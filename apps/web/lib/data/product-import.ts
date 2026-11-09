'use server'

import { revalidatePath } from 'next/cache'
import { eq, sql } from 'drizzle-orm'
import { withAdmin, withClaims } from '@/lib/db'
import { products, productCategories, tenants } from '@/lib/db/schema'
import { getDbClaims } from '@/lib/auth/session'

const ENCRYPTION_KEY = process.env.ENCRYPTION_KEY ?? null
// Modelo barato de propósito: classificar produto é tarefa simples. Troca por env sem mexer em código.
const IMPORT_MODEL = process.env.IMPORT_LLM_MODEL ?? 'gpt-4o-mini'
const AI_BATCH = 40
const MAX_AI_ITEMS = 400
const MAX_IMPORT_ITEMS = 300

export interface ClassifyInput {
  name: string
  description: string | null
  category: string | null
  characteristics: string[]
}

export interface ClassifyResult {
  categories: (string | null)[]
  characteristics: string[][]
  // 'rules' = só regras; 'ai' = chamou a IA; 'none' = sem chave de IA
  source: 'rules' | 'ai' | 'none'
  warning?: string
}

export interface ImportRowInput {
  name: string
  description: string | null
  price: number | null
  priceWholesale: number | null
  priceReseller: number | null
  category: string | null
  characteristics: string[]
  imageUrl: string | null
}

export interface ImportResult {
  created: number
  skippedDuplicates: number
  newCategories: string[]
}

async function importContext() {
  const claims = await getDbClaims()
  if (!claims?.tenant_id) throw new Error('Sessão inválida.')
  const [tenant] = await withClaims(claims, (tx) =>
    tx.select({ businessModel: tenants.businessModel, priceTypes: tenants.priceTypesEnabled })
      .from(tenants).where(eq(tenants.id, claims.tenant_id!)).limit(1)
  )
  // Fashion tem variações (tamanho/cor/SKU) e serviço tem duração: ficam fora da importação por planilha por enquanto.
  if (tenant?.businessModel !== 'product') {
    throw new Error('A importação por planilha está disponível só para cadastro de produtos.')
  }
  return { claims, tenantId: claims.tenant_id, priceTypes: tenant.priceTypes === true }
}

function norm(s: string): string {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim()
}

function cleanLabel(value: unknown, max: number): string | null {
  if (typeof value !== 'string') return null
  const v = value.replace(/\s+/g, ' ').trim().slice(0, max)
  return v || null
}

// Chave OpenAI do próprio agente do tenant (BYOK): o custo da classificação fica com o cliente.
async function tenantOpenAiKey(tenantId: string): Promise<string | null> {
  return withAdmin(async (tx) => {
    const res = await tx.execute(sql`
      select get_agent_llm_key(id, ${ENCRYPTION_KEY}) as key
      from ai_agents
      where tenant_id = ${tenantId} and llm_provider = 'openai' and llm_api_key is not null
      order by created_at asc limit 1
    `)
    const key = (res.rows?.[0] as { key: string | null } | undefined)?.key
    return key && key.startsWith('sk-') ? key : null
  })
}

async function classifyBatch(
  apiKey: string,
  batch: { i: number; name: string; description: string; category: string | null }[],
  knownCategories: string[]
): Promise<Map<number, { category: string | null; characteristics: string[] }>> {
  const system =
    'Você classifica produtos de um catálogo de loja brasileira. Para cada item devolva a categoria ' +
    '(tipo do produto, 1 a 3 palavras, no singular, ex: "Capinha", "Fone de ouvido") e até 5 características ' +
    'curtas deduzidas SÓ do nome/descrição (ex: "Cor: Azul", "Material: Couro"). Não invente o que não estiver no texto. ' +
    (knownCategories.length > 0
      ? `Prefira reutilizar uma destas categorias já existentes quando fizer sentido: ${knownCategories.slice(0, 60).join(', ')}. `
      : '') +
    'Responda APENAS JSON: {"items":[{"i":number,"category":string,"characteristics":string[]}]}.'
  const res = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({
      model: IMPORT_MODEL,
      temperature: 0,
      max_tokens: 2500,
      response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: JSON.stringify(batch.map((b) => ({ i: b.i, nome: b.name, descricao: b.description }))) },
      ],
    }),
    signal: AbortSignal.timeout(60_000),
  })
  if (!res.ok) throw new Error(`OpenAI respondeu ${res.status}`)
  const json = (await res.json()) as { choices?: { message?: { content?: string } }[] }
  const parsed: unknown = JSON.parse(json.choices?.[0]?.message?.content ?? '{}')
  const out = new Map<number, { category: string | null; characteristics: string[] }>()
  const list = (parsed as { items?: unknown }).items
  if (!Array.isArray(list)) return out
  for (const entry of list) {
    const e = entry as { i?: unknown; category?: unknown; characteristics?: unknown }
    if (typeof e.i !== 'number') continue
    out.set(e.i, {
      category: cleanLabel(e.category, 60),
      characteristics: Array.isArray(e.characteristics)
        ? e.characteristics.map((c) => cleanLabel(c, 50)).filter((c): c is string => !!c).slice(0, 5)
        : [],
    })
  }
  return out
}

// 1) regras (categoria já existente aparece no nome) → 2) IA barata só no que faltou.
export async function classifyImportItems(items: ClassifyInput[]): Promise<ClassifyResult> {
  const { claims, tenantId } = await importContext()
  if (items.length > MAX_AI_ITEMS) throw new Error(`Envie no máximo ${MAX_AI_ITEMS} itens por vez.`)

  const existing = (await withClaims(claims, (tx) =>
    tx.select({ name: productCategories.name }).from(productCategories)
  )).map((r) => r.name)
  const existingNorm = existing.map((c) => ({ name: c, key: norm(c).replace(/s$/, '') })).filter((c) => c.key.length >= 3)

  const categories: (string | null)[] = items.map((it) => it.category)
  const characteristics: string[][] = items.map((it) => it.characteristics)

  // regra: categoria já cadastrada citada no nome do produto
  items.forEach((it, idx) => {
    if (categories[idx]) return
    const n = norm(it.name)
    const hit = existingNorm.find((c) => n.includes(c.key))
    if (hit) categories[idx] = hit.name
  })

  const needAi = items
    .map((it, i) => ({ i, name: it.name, description: (it.description ?? '').slice(0, 200), category: categories[i] }))
    .filter((it) => !it.category || characteristics[it.i].length === 0)
  if (needAi.length === 0) return { categories, characteristics, source: 'rules' }

  const apiKey = await tenantOpenAiKey(tenantId)
  if (!apiKey) {
    return { categories, characteristics, source: 'none', warning: 'Sem chave OpenAI configurada no agente: classifiquei só pelas regras. Revise as categorias antes de importar.' }
  }

  let failed = false
  for (let start = 0; start < needAi.length; start += AI_BATCH) {
    const batch = needAi.slice(start, start + AI_BATCH)
    try {
      const result = await classifyBatch(apiKey, batch, existing)
      for (const b of batch) {
        const r = result.get(b.i)
        if (!r) continue
        if (!categories[b.i] && r.category) categories[b.i] = r.category
        if (characteristics[b.i].length === 0) characteristics[b.i] = r.characteristics
      }
    } catch (err) {
      failed = true
      console.error('[import] falha na classificação por IA:', err instanceof Error ? err.message : err)
    }
  }
  return {
    categories,
    characteristics,
    source: 'ai',
    warning: failed ? 'A IA falhou em parte dos itens; esses ficaram sem categoria. Preencha na revisão.' : undefined,
  }
}

export async function importProducts(rows: ImportRowInput[]): Promise<ImportResult> {
  const { claims, tenantId, priceTypes } = await importContext()
  if (rows.length === 0) throw new Error('Nenhum produto para importar.')
  if (rows.length > MAX_IMPORT_ITEMS) throw new Error(`Importe no máximo ${MAX_IMPORT_ITEMS} produtos por vez.`)

  const money = (n: number | null) => (n !== null && Number.isFinite(n) && n >= 0 && n < 1e9 ? String(n) : null)

  const result = await withClaims(claims, async (tx) => {
    const existingNames = new Set(
      (await tx.select({ name: products.name }).from(products).where(eq(products.tenantId, tenantId))).map((p) => norm(p.name))
    )
    const existingCategories = await tx.select({ name: productCategories.name, position: productCategories.position }).from(productCategories)
    const categoryByKey = new Map(existingCategories.map((c) => [norm(c.name), c.name]))
    let nextPosition = existingCategories.reduce((max, c) => Math.max(max, c.position), -1) + 1

    const newCategories: string[] = []
    const toInsert: (typeof products.$inferInsert)[] = []
    let skippedDuplicates = 0
    for (const row of rows) {
      const name = cleanLabel(row.name, 200)
      if (!name) continue
      const key = norm(name)
      if (existingNames.has(key)) { skippedDuplicates++; continue }
      existingNames.add(key)

      let category = cleanLabel(row.category, 60)
      if (category) {
        const known = categoryByKey.get(norm(category))
        if (known) category = known
        else {
          categoryByKey.set(norm(category), category)
          newCategories.push(category)
        }
      }
      const image = row.imageUrl && /^https:\/\//i.test(row.imageUrl) ? row.imageUrl : null
      toInsert.push({
        tenantId,
        name,
        description: cleanLabel(row.description, 4000),
        price: money(row.price),
        category,
        characteristics: row.characteristics.map((c) => cleanLabel(c, 80)).filter((c): c is string => !!c).slice(0, 10),
        priceWholesale: priceTypes ? money(row.priceWholesale) : null,
        priceReseller: priceTypes ? money(row.priceReseller) : null,
        images: image ? [{ url: image, thumbnailUrl: image, alt: name }] : [],
        itemKind: 'product',
        isAvailable: true,
      })
    }

    if (newCategories.length > 0) {
      await tx.insert(productCategories)
        .values(newCategories.map((name) => ({ tenantId, name, position: nextPosition++ })))
        .onConflictDoNothing()
    }
    if (toInsert.length > 0) await tx.insert(products).values(toInsert)
    return { created: toInsert.length, skippedDuplicates, newCategories }
  })

  revalidatePath('/products')
  return result
}
