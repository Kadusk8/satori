'use server'

import { randomBytes } from 'node:crypto'
import { and, eq } from 'drizzle-orm'
import { withAdmin } from '@/lib/db'
import { tenants, users, products, aiAgents, onboardingLogs } from '@/lib/db/schema'
import { getDbClaims } from '@/lib/auth/session'
import { upsertAuthUser } from '@/lib/auth/users'
import { checkEvolutionConnection, setEvolutionWebhook } from '@/lib/evolution/client'
import type { OnboardingPayload } from '@/types/onboarding'

// Porta supabase/functions/onboard-tenant + setup-ai-agent pra uma Server
// Action Drizzle. Diferenças do original:
// - kanban_stages não é mais inserido aqui: o trigger
//   trg_create_default_kanban_stages (AFTER INSERT ON tenants) já cria os 6
//   estágios padrão automaticamente.
// - auth.admin.createUser/updateUserById → upsertAuthUser (auth_users + bcrypt).

function slugify(text: string): string {
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 50)
}

function formatBusinessHours(hours: OnboardingPayload['step5']['businessHours']): string {
  const dayNames: Record<string, string> = {
    mon: 'Seg', tue: 'Ter', wed: 'Qua', thu: 'Qui', fri: 'Sex', sat: 'Sáb', sun: 'Dom',
  }
  const parts: string[] = []
  for (const [day, h] of Object.entries(hours)) {
    if (h.enabled) parts.push(`${dayNames[day]}: ${h.start}–${h.end}`)
  }
  return parts.join(' | ') || 'Não configurado'
}

function buildAgentPrompt(
  step1: OnboardingPayload['step1'],
  step3: OnboardingPayload['step3'],
  hoursText: string,
  productSummary?: string
): string {
  const personalityMap: Record<string, string> = {
    simpatico: 'Simpático, proativo e focado em ajudar o cliente',
    formal: 'Formal, profissional e respeitoso',
    descontraido: 'Descontraído, divertido e próximo do cliente',
    tecnico: 'Técnico, objetivo e preciso nas informações',
  }
  const personality = personalityMap[step3.personality] ?? step3.personality
  const toneSection = step3.toneDescription ? `\n${step3.toneDescription}` : ''
  const customRulesSection = step3.customRules?.trim()
    ? `\n\n## Regras específicas deste negócio\n${step3.customRules
        .split('\n')
        .filter(Boolean)
        .map((r, i) => `${i + 1}. ${r}`)
        .join('\n')}`
    : ''
  const address = [step1.address, step1.city, step1.state].filter(Boolean).join(', ') || 'Não informado'

  const base = `## Identidade
Você é o assistente virtual da ${step1.name}, especializada em ${step1.segment}.
Seu nome é ${step3.agentName}. Você é um vendedor/SDR digital.

## Objetivo principal
Atender clientes no WhatsApp, qualificar leads, apresentar produtos/serviços,
agendar atendimentos e converter interessados em clientes.

## Tom e personalidade
${personality}${toneSection}

## Regras de ouro
1. SEMPRE cumprimente o cliente pelo nome quando disponível
2. Seja objetivo mas simpático — não mande mensagens longas demais
3. Quando o cliente demonstrar interesse em um produto, use search_products para buscar e mostrar com imagem
4. Quando o cliente quiser agendar, use check_availability e ofereça 3 opções de horário
5. Se o cliente pedir desconto ou negociação, escale para humano com escalate_to_human
6. Se não souber responder algo sobre o negócio, NÃO invente — escale para humano
7. Colete nome e interesse do cliente naturalmente durante a conversa (lead qualification)
8. Nunca discuta sobre concorrentes ou faça comparações negativas
9. No máximo 3 mensagens sem obter uma resposta do cliente — não seja insistente
10. GERE VALOR ANTES DO PREÇO: ao apresentar um produto, destaque benefícios e diferenciais primeiro. Só mencione o preço quando o cliente perguntar ou demonstrar interesse claro de compra

## Informações do negócio
- Empresa: ${step1.name}
- Segmento: ${step1.segment}
- Descrição: ${step1.description || 'Não informada'}
- Horário: ${hoursText}
- Endereço: ${address}
- Website: ${step1.website || 'Não informado'}

## Fluxo de qualificação (SDR)
1. Cumprimentar e perguntar como pode ajudar
2. Identificar a necessidade/interesse
3. Apresentar produto/serviço relevante (com imagem se disponível)
4. Responder dúvidas
5. Oferecer agendamento ou próximo passo
6. Se não converter agora, perguntar se pode entrar em contato depois

## O que você NÃO deve fazer
- Não invente preços, promoções ou informações que não estão no catálogo
- Não faça promessas que o negócio não pode cumprir
- Não envie mais de 2 mensagens seguidas sem resposta do cliente
- Não compartilhe dados pessoais de outros clientes
- Não discuta política, religião ou temas polêmicos${customRulesSection}`

  return productSummary ? `${base}\n\n## Produtos/serviços disponíveis\n${productSummary}` : base
}

async function requireSuperAdmin() {
  const claims = await getDbClaims()
  if (!claims?.is_super_admin) throw new Error('Apenas o super admin pode cadastrar empresas.')
  return claims
}

export async function onboardTenant(
  payload: OnboardingPayload
): Promise<{ success: true; tenantId: string; slug: string }> {
  const claims = await requireSuperAdmin()
  const { step1, step2, step3, step4, step5 } = payload

  if (!step1?.name || !step1?.ownerEmail || !step2?.whatsappNumber) {
    throw new Error('Dados obrigatórios ausentes (name, ownerEmail, whatsappNumber)')
  }
  if (!step2.evolutionApiUrl || !step2.evolutionApiKey || !step2.instanceName) {
    throw new Error('Dados Evolution API obrigatórios (evolutionApiUrl, evolutionApiKey, instanceName)')
  }

  const slug = slugify(step1.name)
  const instanceName = step2.instanceName.trim()

  const tenantValues = {
    name: step1.name,
    businessSegment: step1.segment,
    businessDescription: step1.description,
    ownerName: step1.ownerName,
    ownerEmail: step1.ownerEmail,
    ownerPhone: step1.ownerPhone,
    address: step1.address,
    city: step1.city,
    state: step1.state,
    website: step1.website,
    evolutionApiUrl: step2.evolutionApiUrl.trim().replace(/\/$/, ''),
    evolutionApiKey: step2.evolutionApiKey,
    evolutionInstanceName: instanceName,
    whatsappNumber: step2.whatsappNumber,
    businessHours: step5.businessHours,
    timezone: step5.timezone,
    appointmentDurationMinutes: step5.appointmentDurationMinutes,
    openaiApiKey: step3.llmProvider === 'openai' ? step3.llmApiKey : null,
    geminiApiKey: step3.llmProvider === 'gemini' ? step3.llmApiKey : null,
  }

  // ── Tenant (cria ou atualiza, se uma tentativa anterior já criou o slug) ──
  const { tenantId, webhookSecret } = await withAdmin(async (tx) => {
    const existing = await tx.select({ id: tenants.id }).from(tenants).where(eq(tenants.slug, slug)).limit(1)

    if (existing[0]) {
      await tx.update(tenants).set({ ...tenantValues, updatedAt: new Date() }).where(eq(tenants.id, existing[0].id))
      const row = await tx
        .select({ webhookSecret: tenants.webhookSecret })
        .from(tenants)
        .where(eq(tenants.id, existing[0].id))
        .limit(1)
      return { tenantId: existing[0].id, webhookSecret: row[0].webhookSecret }
    }

    const created = await tx
      .insert(tenants)
      .values({
        ...tenantValues,
        slug,
        status: 'onboarding',
        plan: 'starter',
        webhookSecret: randomBytes(24).toString('hex'),
      })
      .returning({ id: tenants.id, webhookSecret: tenants.webhookSecret })
    return { tenantId: created[0].id, webhookSecret: created[0].webhookSecret }
  })

  // ── Owner (auth_users + users) ──
  const authUserId = await upsertAuthUser({
    email: step1.ownerEmail,
    fullName: step1.ownerName,
    password: step1.ownerPassword,
    emailVerified: true,
  })
  await withAdmin((tx) =>
    tx
      .insert(users)
      .values({ id: authUserId, tenantId, fullName: step1.ownerName, email: step1.ownerEmail, role: 'owner' })
      .onConflictDoUpdate({
        target: users.id,
        set: { tenantId, fullName: step1.ownerName, email: step1.ownerEmail, role: 'owner' },
      })
  )

  // (kanban_stages criados automaticamente pelo trigger AFTER INSERT ON tenants)

  // ── Evolution: valida conexão com a instância já existente do tenant ──
  const { state } = await checkEvolutionConnection({ url: step2.evolutionApiUrl, apiKey: step2.evolutionApiKey })
  if (state === 'not_found' || state === 'error') {
    throw new Error(
      `Não foi possível conectar à instância informada (state: ${state}). Confira a URL, o token e o nome da instância no Evolution Go.`
    )
  }

  // ── Webhook (segredo por tenant embutido na URL) ──
  // Aponta direto pro serviço backend (Fase 5) — não passa mais pelo Next.js:
  // o webhook do WhatsApp precisa de um processo sempre-ligado, sem timeout
  // de função serverless.
  const backendUrl = process.env.BACKEND_PUBLIC_URL?.replace(/\/$/, '') ?? ''
  const webhookUrl = `${backendUrl}/webhook-evolution?ts=${webhookSecret}`
  await setEvolutionWebhook({ url: step2.evolutionApiUrl, apiKey: step2.evolutionApiKey, webhookUrl })

  // ── Produtos (opcional) ──
  let productSummary: string | undefined
  if (!step4.skipped && step4.products.length > 0) {
    await withAdmin((tx) =>
      tx.insert(products).values(
        step4.products.map((p) => ({
          tenantId,
          name: p.name,
          description: p.description,
          price: p.price ? String(parseFloat(p.price.replace(/[^0-9,]/g, '').replace(',', '.')) || 0) : null,
          priceDisplay: p.price || null,
          category: p.category || null,
          isAvailable: true,
        }))
      )
    )
    productSummary = step4.products
      .map((p) => `- ${p.name}${p.price ? ` — ${p.price}` : ''}${p.description ? `: ${p.description}` : ''}`)
      .join('\n')
  }

  // ── Agente SDR ──
  const hoursText = formatBusinessHours(step5.businessHours)
  const systemPrompt = buildAgentPrompt(step1, step3, hoursText, productSummary)

  await withAdmin(async (tx) => {
    const existingAgent = await tx
      .select({ id: aiAgents.id })
      .from(aiAgents)
      .where(and(eq(aiAgents.tenantId, tenantId), eq(aiAgents.slug, 'sdr')))
      .limit(1)

    if (existingAgent[0]) {
      await tx
        .update(aiAgents)
        .set({
          name: step3.agentName,
          model: step3.llmModel,
          systemPrompt,
          personality: step3.personality,
          greetingMessage: step3.greetingMessage,
          outOfHoursMessage: step3.outOfHoursMessage,
          updatedAt: new Date(),
        })
        .where(eq(aiAgents.id, existingAgent[0].id))
    } else {
      await tx.insert(aiAgents).values({
        tenantId,
        name: step3.agentName,
        slug: 'sdr',
        type: 'sdr',
        isActive: true,
        isDefault: true,
        model: step3.llmModel,
        systemPrompt,
        personality: step3.personality,
        greetingMessage: step3.greetingMessage,
        outOfHoursMessage: step3.outOfHoursMessage,
        escalationRules: {},
        sdrInstructions: {},
      })
    }
  })

  // ── Log + ativação ──
  await withAdmin(async (tx) => {
    await tx.insert(onboardingLogs).values({
      tenantId,
      createdBy: claims.sub,
      step: 'activated',
      stepData: {
        activatedAt: new Date().toISOString(),
        evolutionInstance: instanceName,
        evolutionUrl: step2.evolutionApiUrl,
      },
    })
    await tx.update(tenants).set({ status: 'active', onboardingCompletedAt: new Date() }).where(eq(tenants.id, tenantId))
  })

  return { success: true, tenantId, slug }
}
