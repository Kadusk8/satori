// Núcleo do agente de IA — recebe uma conversa, monta o contexto, chama o LLM
// com function calling e envia a resposta via Evolution Go.
// Porta de supabase/functions/process-message/index.ts.
//
// Diferença de arquitetura vs. o original: no Supabase, webhook-evolution
// invocava esta function via HTTP fetch (hop extra). Aqui, como tudo roda no
// mesmo processo Node, é uma chamada de função direta — ver routes/webhook.ts.

import { and, asc, desc, eq } from 'drizzle-orm'
import { pool, getTenantLlmKeys, getAgentLlmKey } from '../db/index.js'
import { conversations, kanbanStages, messages, products } from '../db/schema.js'
import { db } from '../db/index.js'
import { getEvolutionClient } from '../shared/evolution-client.js'
import { callLLM, classifyLLMError, type LLMMessage, type LLMContentBlock, type LLMTool, type LLMProvider } from '../shared/llm-client.js'
import { AI_TOOLS } from '../shared/claude-tools.js'
import { transcribeAudio } from '../shared/whisper-client.js'
import { textToSpeech, audioToBase64 } from '../shared/elevenlabs-client.js'
import {
  executeTool,
  resolveProductImageData,
  toolSearchProducts,
  formatBusinessHours,
  type DeferredImage,
  type ToolContext,
} from './tools.js'

const ENCRYPTION_KEY = process.env.ENCRYPTION_KEY ?? null
const MAX_TOOL_LOOPS = 5

interface BusinessHours {
  [day: string]: { enabled: boolean; start: string; end: string } | undefined
}

export function isWithinBusinessHours(businessHours: BusinessHours, timezone: string): boolean {
  const now = new Date()
  const localTime = new Intl.DateTimeFormat('en-US', {
    timeZone: timezone,
    weekday: 'short',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).formatToParts(now)

  const weekdayMap: Record<string, string> = { Mon: 'mon', Tue: 'tue', Wed: 'wed', Thu: 'thu', Fri: 'fri', Sat: 'sat', Sun: 'sun' }
  const weekday = localTime.find((p) => p.type === 'weekday')?.value ?? ''
  const dayKey = weekdayMap[weekday]
  const hour = localTime.find((p) => p.type === 'hour')?.value ?? '00'
  const minute = localTime.find((p) => p.type === 'minute')?.value ?? '00'
  const currentTime = `${hour}:${minute}`

  const dayHours = businessHours[dayKey]
  if (!dayHours?.start || !dayHours?.end) return false
  if (dayHours.enabled === false) return false
  return currentTime >= dayHours.start && currentTime <= dayHours.end
}

export function splitMessage(text: string, maxLength = 300): string[] {
  const paragraphs = text.split(/\n\n+/).map((p) => p.trim()).filter(Boolean)
  const parts: string[] = []

  for (const paragraph of paragraphs) {
    if (paragraph.length <= maxLength) {
      parts.push(paragraph)
    } else {
      const sentences = paragraph.split(/(?<=[.!?])\s+/)
      let current = ''
      for (const s of sentences) {
        if (current && (current + ' ' + s).length > maxLength) {
          parts.push(current.trim())
          current = s
        } else {
          current = current ? `${current} ${s}` : s
        }
      }
      if (current.trim()) parts.push(current.trim())
    }
    if (parts.length >= 4) break
  }

  if (parts.length === 0) return [text]
  if (parts.length > 4) return [...parts.slice(0, 3), parts.slice(3).join('\n')]
  return parts
}

export function normalizeMessageSequence(msgs: LLMMessage[]): LLMMessage[] {
  if (msgs.length === 0) return []
  const merged: LLMMessage[] = []
  for (const msg of msgs) {
    const last = merged[merged.length - 1]
    if (last && last.role === msg.role && typeof last.content === 'string' && typeof msg.content === 'string') {
      last.content = `${last.content}\n${msg.content}`
    } else {
      merged.push({ ...msg })
    }
  }
  if (merged[0]?.role === 'assistant') merged.shift()
  return merged
}

interface ConversationRow {
  id: string
  tenant_id: string
  contact_id: string
  status: string
  autonomous_mode: boolean
  metadata: { source?: string; ad_referral?: { title: string | null; body: string | null } } | null
  whatsapp_number: string
  t_name: string
  business_hours: BusinessHours
  timezone: string
  evolution_instance_name: string | null
  openai_api_key: string | null
  gemini_api_key: string | null
  anthropic_api_key: string | null
  elevenlabs_api_key: string | null
}

interface AgentRow {
  id: string
  model: string
  system_prompt: string
  max_tokens: number
  temperature: string
  is_default: boolean
  is_active: boolean
  out_of_hours_message: string | null
  greeting_message: string | null
  can_search_products: boolean
  can_book_appointments: boolean
  can_send_images: boolean
  can_escalate: boolean
  follow_up_enabled: boolean
  follow_up_delay_hours: number
  follow_up_max_attempts: number
  voice_id: string | null
  audio_response_enabled: boolean | null
  llm_provider: LLMProvider
}

interface MessageRow {
  id: string
  sender_type: string
  content: string | null
  content_type: string
  media_url: string | null
  ai_tool_calls: Array<{ name: string; input: Record<string, unknown>; result: string }> | null
  created_at: Date
}

const STOP_WORDS = new Set([
  'quero', 'para', 'favor', 'você', 'como', 'tenho', 'esse', 'essa', 'aqui', 'mais', 'qual', 'quer', 'com', 'por',
  'uma', 'que', 'tem', 'ver', 'gostaria', 'preciso', 'pode', 'mostrar', 'produto', 'coisa', 'algo', 'isso', 'isto',
  'aquilo', 'este', 'esta',
])

export function extractCustomerKeywords(content: string | null | undefined): string[] {
  if (!content) return []
  return content
    .toLowerCase()
    .replace(/[^a-záàâãéèêíïóôõöúüçñ\s]/gi, ' ')
    .split(/\s+/)
    .filter((w) => w.length > 3 && !STOP_WORDS.has(w))
}

// Detecta se a mensagem do cliente é um pedido claro de MAIS fotos/imagens do produto
// que ele já está vendo (ex: "tem mais fotos?", "manda todas", "quero ver por dentro").
// Usado pra forçar o envio determinístico das fotos adicionais, já que o LLM erra esse
// fluxo com frequência. Não dispara pra "quero ver mais opções" (isso é outro produto).
export function isMoreImagesIntent(content: string | null | undefined): boolean {
  if (!content) return false
  const msg = content.toLowerCase()
  if (/por dentro/.test(msg)) return true
  return (
    /(fotos?|imagens?|[âa]ngulos?|interior)/.test(msg) &&
    /(mais|outr[ao]s?|todas?|demais|manda|envi|quero|ver|tem|mostr)/.test(msg)
  )
}

// Tenta identificar QUAL produto em campanha o cliente viu, comparando o
// título/corpo do anúncio (referral do Click-to-WhatsApp) contra os nomes dos
// produtos marcados como "em anúncio". Match simples (substring), suficiente
// pra nomes de produto curtos e específicos — se não achar nenhum, o chamador
// cai no fallback de listar todos os produtos em campanha.
export function matchAdReferralProduct(
  referral: { title: string | null; body: string | null },
  adProducts: Array<{ id: string; name: string }>
): { id: string; name: string } | null {
  const text = `${referral.title ?? ''} ${referral.body ?? ''}`.toLowerCase().trim()
  if (!text) return null

  for (const p of adProducts) {
    const nameLower = p.name.toLowerCase()
    if (nameLower.length > 2 && text.includes(nameLower)) return p
  }
  for (const p of adProducts) {
    // Ignora tokens puramente numéricos (ex: ano "2020") — pouco distintivos e
    // raramente citados junto com o modelo no texto curto de um anúncio.
    const words = p.name.toLowerCase().split(/\s+/).filter((w) => w.length > 3 && /[a-zà-ÿ]/.test(w))
    if (words.length > 0 && words.every((w) => text.includes(w))) return p
  }
  return null
}

const FOCUS_LOOKBACK_MESSAGES = 15

export function extractFocusProductCandidate(history: MessageRow[]): { id: string; name?: string } | null {
  const window = history.slice(-FOCUS_LOOKBACK_MESSAGES)
  let searchFallback: { id: string; name?: string } | null = null

  for (let i = window.length - 1; i >= 0; i--) {
    const calls = window[i].ai_tool_calls
    if (!Array.isArray(calls)) continue
    for (let j = calls.length - 1; j >= 0; j--) {
      const call = calls[j]
      if (
        (call.name === 'send_product_image' || call.name === 'send_more_product_images') &&
        call.result !== 'Produto não encontrado.' &&
        call.result !== 'Produto não encontrado ou sem imagem cadastrada.'
      ) {
        const id = String(call.input?.product_id ?? '')
        if (id) return { id }
      }
      if (!searchFallback && call.name === 'search_products') {
        const match = /📦 \*([^*]+)\*[\s\S]*?ID: ([a-f0-9-]{36})/.exec(call.result)
        if (match) searchFallback = { name: match[1].trim(), id: match[2].trim() }
      }
    }
  }
  return searchFallback
}

export async function processMessage(conversationId: string): Promise<{ success: boolean; skipped?: string; outOfHours?: boolean; escalated?: boolean }> {
  const convRes = await pool.query<ConversationRow>(
    `select c.id, c.tenant_id, c.contact_id, c.status, c.autonomous_mode, c.metadata,
            ct.whatsapp_number,
            t.name as t_name, t.business_hours, t.timezone, t.evolution_instance_name,
            t.openai_api_key, t.gemini_api_key, t.anthropic_api_key, t.elevenlabs_api_key
     from conversations c
     join contacts ct on ct.id = c.contact_id
     join tenants t on t.id = c.tenant_id
     where c.id = $1`,
    [conversationId]
  )
  const conv = convRes.rows[0]
  if (!conv) throw new Error('Conversa não encontrada')

  if (conv.status === 'waiting_human' || conv.status === 'human_handling') {
    return { success: true, skipped: 'Conversa sob atendimento humano' }
  }

  const agentsRes = await pool.query<AgentRow>(
    `select id, model, system_prompt, max_tokens, temperature, is_default, is_active,
            out_of_hours_message, greeting_message, can_search_products, can_book_appointments, can_send_images,
            can_escalate, follow_up_enabled, follow_up_delay_hours, follow_up_max_attempts,
            voice_id, audio_response_enabled, llm_provider
     from ai_agents where tenant_id = $1`,
    [conv.tenant_id]
  )
  const agent = agentsRes.rows.find((a) => a.is_default && a.is_active) ?? agentsRes.rows[0]
  if (!agent) throw new Error('Nenhum agente de IA configurado para este tenant')

  const agentFollowUpEnabled = agent.follow_up_enabled !== false
  const agentFollowUpDelayHours = Number(agent.follow_up_delay_hours ?? 24)
  const agentFollowUpMaxAttempts = Number(agent.follow_up_max_attempts ?? 3)

  const tenantId = conv.tenant_id
  const contactId = conv.contact_id
  const contactNumber = conv.whatsapp_number

  // Descriptografa LLM keys via RPC, com fallback pras colunas em texto plano.
  const llmKeys = await getTenantLlmKeys(tenantId, ENCRYPTION_KEY)
  const tenantOpenaiKey = llmKeys?.openai_api_key ?? conv.openai_api_key ?? null
  const tenantAnthropicKey = llmKeys?.anthropic_api_key ?? conv.anthropic_api_key ?? null
  const tenantGeminiKey = llmKeys?.gemini_api_key ?? conv.gemini_api_key ?? null
  const tenantElevenlabsKey = llmKeys?.elevenlabs_api_key ?? conv.elevenlabs_api_key ?? null

  // Chave individual do agente (BYOK por agente) tem prioridade; se não
  // configurada, cai pra chave do tenant no mesmo provedor; se nenhuma das
  // duas existir, callLLM ainda tenta a variável de ambiente global.
  const agentLlmKey = await getAgentLlmKey(agent.id, ENCRYPTION_KEY)
  const llmProvider = agent.llm_provider ?? 'anthropic'
  const resolvedAnthropicKey = (llmProvider === 'anthropic' ? agentLlmKey : null) ?? tenantAnthropicKey
  const resolvedOpenaiKey = (llmProvider === 'openai' ? agentLlmKey : null) ?? tenantOpenaiKey
  const resolvedGeminiKey = (llmProvider === 'gemini' ? agentLlmKey : null) ?? tenantGeminiKey
  const resolvedOpenrouterKey = llmProvider === 'openrouter' ? agentLlmKey : null

  // Move card para 'ia_atendendo'
  {
    const iaStage = await db
      .select({ id: kanbanStages.id })
      .from(kanbanStages)
      .where(and(eq(kanbanStages.tenantId, tenantId), eq(kanbanStages.slug, 'ia_atendendo')))
      .limit(1)
    if (iaStage[0]) {
      await db.update(conversations).set({ kanbanStageId: iaStage[0].id }).where(eq(conversations.id, conversationId))
    }
  }

  // A IA atende 24/7 — business_hours só é usado como informação de contexto
  // no prompt (ex: pra agendamento), nunca pra bloquear a resposta.
  const businessHours = conv.business_hours
  const timezone = conv.timezone ?? 'America/Sao_Paulo'

  // Histórico (últimas 40 mensagens)
  const historyRows = await db
    .select({
      id: messages.id,
      senderType: messages.senderType,
      content: messages.content,
      contentType: messages.contentType,
      mediaUrl: messages.mediaUrl,
      aiToolCalls: messages.aiToolCalls,
      createdAt: messages.createdAt,
    })
    .from(messages)
    .where(eq(messages.conversationId, conversationId))
    .orderBy(asc(messages.createdAt))
    .limit(40)
  const history: MessageRow[] = historyRows.map((m) => ({
    id: m.id,
    sender_type: m.senderType,
    content: m.content,
    content_type: m.contentType,
    media_url: m.mediaUrl,
    ai_tool_calls: m.aiToolCalls as MessageRow['ai_tool_calls'],
    created_at: m.createdAt,
  }))

  // Última mensagem do cliente (query separada, não limitada pelo histórico)
  const lastCustomerRows = await db
    .select({
      id: messages.id,
      senderType: messages.senderType,
      content: messages.content,
      contentType: messages.contentType,
      mediaUrl: messages.mediaUrl,
      createdAt: messages.createdAt,
    })
    .from(messages)
    .where(and(eq(messages.conversationId, conversationId), eq(messages.senderType, 'customer')))
    .orderBy(desc(messages.createdAt))
    .limit(1)
  const lastCustomerMsg: MessageRow | null = lastCustomerRows[0]
    ? {
        id: lastCustomerRows[0].id,
        sender_type: lastCustomerRows[0].senderType,
        content: lastCustomerRows[0].content,
        content_type: lastCustomerRows[0].contentType,
        media_url: lastCustomerRows[0].mediaUrl,
        ai_tool_calls: null,
        created_at: lastCustomerRows[0].createdAt,
      }
    : null

  // Transcreve áudio do cliente (STT) se necessário
  if (lastCustomerMsg && lastCustomerMsg.content_type === 'audio' && lastCustomerMsg.media_url && !lastCustomerMsg.content && tenantOpenaiKey) {
    // URL própria (Cloudinary, já baixada por nós) vs. URL direta da Evolution (precisa apikey)
    const isOwnUpload = lastCustomerMsg.media_url.includes('res.cloudinary.com')
    let audioDownloadHeaders: Record<string, string> | undefined
    if (!isOwnUpload) {
      const { getDecryptedEvolutionKey } = await import('../db/index.js')
      const evoKey = await getDecryptedEvolutionKey(tenantId, ENCRYPTION_KEY)
      if (evoKey) audioDownloadHeaders = { apikey: evoKey }
    }

    const transcript = await transcribeAudio(lastCustomerMsg.media_url, tenantOpenaiKey, audioDownloadHeaders)
    if (transcript) {
      await db.update(messages).set({ content: transcript }).where(eq(messages.id, lastCustomerMsg.id))
      lastCustomerMsg.content = transcript
      const histMsg = history.find((m) => m.id === lastCustomerMsg.id)
      if (histMsg) histMsg.content = transcript
    }
  }

  // Áudio sem transcrição: avisa o cliente e encerra sem chamar a IA
  if (lastCustomerMsg && lastCustomerMsg.content_type === 'audio' && !lastCustomerMsg.content) {
    const audioFallback = 'Oi! Não consigo processar mensagens de áudio por aqui. 😅 Pode me enviar o que queria dizer em texto?'
    try {
      const evo = await getEvolutionClient(tenantId, ENCRYPTION_KEY)
      await evo.sendText(contactNumber, audioFallback)
      await pool.query(
        `insert into messages (tenant_id, conversation_id, contact_id, sender_type, content, content_type) values ($1,$2,$3,'ai',$4,'text')`,
        [tenantId, conversationId, contactId, audioFallback]
      )
    } catch (err) {
      console.error('[process-message] Erro ao enviar fallback de áudio:', err)
    }
    return { success: true }
  }

  const llmMessages: LLMMessage[] = history
    .filter((m) => m.sender_type === 'customer' || m.sender_type === 'ai' || m.sender_type === 'human')
    .filter((m) => m.content || m.content_type === 'audio')
    .map((m) => ({
      role: m.sender_type === 'customer' ? ('user' as const) : ('assistant' as const),
      content:
        m.content_type === 'image'
          ? `[Imagem enviada]${m.content ? `: ${m.content}` : ''}`
          : m.content_type === 'audio' && !m.content
          ? '[Áudio enviado pelo cliente]'
          : m.content ?? '',
    }))

  const normalizedMessages = normalizeMessageSequence(llmMessages)

  // Janela multi-turno pro guard-rail de search_products: olhar só a última mensagem do
  // cliente faz recall legítimo de um produto citado 2+ turnos atrás (ex: "tem mais fotos
  // dele?") ser tratado como "palavra nova" e corrompido. Ampliando pras últimas N mensagens
  // do cliente, a mensagem atual continua incluída — então a proteção original contra
  // sinônimos ("colchão" → "cama") no MESMO turno continua funcionando.
  const GUARD_RAIL_RECALL_WINDOW = 6
  const recentCustomerMsgs = history.filter((m) => m.sender_type === 'customer').slice(-GUARD_RAIL_RECALL_WINDOW)
  const recallWindowLower = recentCustomerMsgs.map((m) => (m.content ?? '').toLowerCase()).join(' ')
  const recallWindowKeywords: string[] = []
  for (let i = recentCustomerMsgs.length - 1; i >= 0; i--) {
    for (const w of extractCustomerKeywords(recentCustomerMsgs[i].content)) {
      if (!recallWindowKeywords.includes(w)) recallWindowKeywords.push(w)
    }
  }

  const focusCandidate = extractFocusProductCandidate(history)
  let focusProduct: { id: string; name: string } | null = null
  if (focusCandidate) {
    const focusRows = await db
      .select({ name: products.name })
      .from(products)
      .where(and(eq(products.id, focusCandidate.id), eq(products.tenantId, tenantId), eq(products.isAvailable, true)))
      .limit(1)
    if (focusRows[0]) focusProduct = { id: focusCandidate.id, name: focusRows[0].name }
  }

  // Cliente veio de um anúncio Click-to-WhatsApp (referral gravado pelo webhook na criação
  // da conversa) — busca os produtos em campanha e tenta identificar qual foi anunciado.
  const adReferral = conv.metadata?.source === 'ctwa_ad' ? conv.metadata.ad_referral ?? null : null
  let adProducts: Array<{ id: string; name: string; price_display: string | null; price: string | null }> = []
  if (adReferral) {
    const adRows = await db
      .select({ id: products.id, name: products.name, priceDisplay: products.priceDisplay, price: products.price })
      .from(products)
      .where(and(eq(products.tenantId, tenantId), eq(products.isRunningAd, true), eq(products.isAvailable, true)))
    adProducts = adRows.map((p) => ({ id: p.id, name: p.name, price_display: p.priceDisplay, price: p.price }))
    if (!focusProduct && adProducts.length > 0) {
      const matched = matchAdReferralProduct(adReferral, adProducts)
      if (matched) focusProduct = matched
    }
  }

  const now = new Intl.DateTimeFormat('pt-BR', { dateStyle: 'full', timeStyle: 'short', timeZone: timezone }).format(new Date())
  const isFirstAiResponse = !history.some((m) => m.sender_type === 'ai')
  const adProductsListText = adProducts
    .map((p) => `${p.name}${p.price_display ? ` (${p.price_display})` : p.price ? ` (R$ ${p.price})` : ''}`)
    .join(', ')

  const systemPrompt = `## Seu papel (regras de venda com prioridade máxima — mas a identidade, nome, gênero e qualquer fluxo de qualificação específico definidos em "Contexto do negócio e personalidade" abaixo sempre prevalecem sobre esta seção)
Sua função é vender: entender o que o cliente quer → buscar nos produtos → gerar valor e despertar interesse → fechar a venda. Nunca deixe o cliente sem resposta sobre o produto que pediu.

## Regras de comportamento (obrigatórias)
- RESPONDA O QUE FOI PERGUNTADO: se o cliente pediu colchão → mostre colchão. Se pediu preço → dê o preço. NUNCA responda uma pergunta com outra pergunta quando o cliente já forneceu informação suficiente para buscar.
- BUSCA IMEDIATA (padrão, salvo se "Contexto do negócio e personalidade" abaixo definir um fluxo de qualificação próprio — nesse caso siga o fluxo específico dele): quando o cliente mencionar qualquer produto, serviço ou categoria, chame search_products IMEDIATAMENTE. NUNCA pergunte orçamento, tamanho, modelo ou preferência ANTES de mostrar o catálogo. Primeiro mostre o que tem, depois afine se necessário.
- QUERY EXATA: ao chamar search_products, use as PALAVRAS EXATAS que o cliente disse. Se o cliente disse "colchão", busque "colchão". Se disse "sofá", busque "sofá". NUNCA substitua por sinônimos ou categorias relacionadas — "colchão" e "cama" são produtos DIFERENTES. Use no máximo 1-3 palavras extraídas literalmente da fala do cliente.
- RECOMENDE 1 produto: apresente o mais adequado ao que o cliente descreveu. Não liste todos — escolha um e recomende com convicção. Se o cliente quiser ver mais, ele pede.
- APRESENTAÇÃO: quando o produto tiver "[tem imagem]", chame send_product_image — a foto sai SOMENTE com nome e descrição (sem preço). Seu texto deve destacar 1-2 BENEFÍCIOS ou diferenciais do produto (material, qualidade, design, conforto, exclusividade) em 1-2 frases curtas. NÃO mencione preço no texto de apresentação. Ex: "Olha essa opção — acabamento premium e design exclusivo 👇" ou "Esse aqui combina muito com o que você descreveu 👇". Se o produto NÃO tem imagem, inclua nome e benefícios no texto — ainda sem preço.
- PREÇO — REGRA FUNDAMENTAL: NUNCA inicie a apresentação de um produto com o preço. Primeiro apresente o produto com seus benefícios e gere interesse. Mencione o preço APENAS quando: (1) o cliente perguntar diretamente ("quanto custa?", "qual o valor?", "tem algum desconto?") OU (2) o cliente demonstrar interesse claro de compra ("gostei", "quero esse", "como faço pra comprar?", "tem parcelamento?"). Se o cliente ainda não sinalizou interesse, foque em gerar desejo.
- FOTOS — REGRA ABSOLUTA: se o produto tem "[tem imagem — use send_product_image com id: ...]" nos resultados da busca, você DEVE chamar a ferramenta send_product_image — nunca escreva sobre a imagem, CHAME A FERRAMENTA. Se o produto NÃO tem esse indicador, significa que não há foto disponível — NUNCA escreva "vou enviar a imagem", "vou te mandar a foto", "vou compartilhar" ou qualquer variação. Escrever isso sem chamar a ferramenta não envia NADA — é uma promessa falsa que frustra o cliente.
- MAIS FOTOS — REGRA ABSOLUTA: send_product_image manda só a foto de destaque (a principal). Se DEPOIS disso o cliente pedir mais fotos de QUALQUER forma (ex: "tem mais fotos?", "manda mais", "manda todas", "quero ver mais", "quero ver o interior/por dentro", "tem outros ângulos?", "quero ver melhor"), você DEVE chamar send_more_product_images — ela já envia TODAS as fotos restantes cadastradas de uma vez, não é preciso (nem deve) chamar de novo pra cada foto. NUNCA chame send_product_image de novo pra atender esse pedido (ela só reenviaria a mesma foto de destaque) e NUNCA diga que só tem 1 foto sem antes checar chamando a ferramenta — o resultado dela informa se há mais fotos ou não. Normalmente chame as duas em respostas separadas — primeiro a de destaque, send_more_product_images só depois, quando pedirem. EXCEÇÃO: se a própria mensagem do cliente já pedir "mais fotos"/"todas as fotos"/"fotos dele" ANTES de você ter mostrado qualquer foto (ou seja, ele já quer várias de cara, não só a de destaque), chame send_product_image E send_more_product_images NA MESMA resposta — não faça ele pedir de novo pra receber o que já pediu. TEXTO ENXUTO NAS FOTOS: quando o cliente só pede mais fotos, NÃO re-descreva o produto (ano, cor, câmbio, km, preço, etc — ele já viu isso). Responda com no MÁXIMO uma frase bem curta e natural ("Claro! 👇", "Olha só 👇") e deixe as fotos falarem. Repetir a ficha inteira do produto a cada pedido de foto denuncia que você é um robô — seja breve como um vendedor de verdade no WhatsApp.
- ERRO EM FOTO: se send_product_image ou send_more_product_images retornar "Produto não encontrado" (ou "sem imagem cadastrada"), isso NÃO significa que o produto não existe — normalmente é um ID desatualizado. Antes de dizer qualquer coisa ao cliente, chame search_products com o nome do produto mencionado pra recuperar o ID correto e tente de novo. Só diga que não tem esse produto/foto depois de tentar essa busca e ela também não encontrar nada.
- 1 PRODUTO SOMENTE — INVIOLÁVEL: mesmo que search_products retorne 2 ou 3 resultados, você deve apresentar APENAS 1 — o mais relevante. Nunca descreva ou mencione mais de 1 produto em uma mesma mensagem. Isso não é negociável.
- NUNCA DIGA "não encontrei" / "não consigo encontrar" / "não temos esse produto": search_products SEMPRE retorna produtos do catálogo real. Se há um produto no resultado, ele EXISTE e está disponível — apresente-o diretamente. NUNCA explique que buscou por outra palavra ou que o produto não é exato.
- NUNCA REPITA PERGUNTAS: se o cliente já disse o tamanho, preferência ou nome, use essa informação. Nunca peça de novo.
- MENSAGENS CURTAS: máximo 2-3 frases por mensagem. WhatsApp não é e-mail.
- LINKS E IMAGENS NO TEXTO — PROIBIDO: nunca escreva URLs, nunca escreva sintaxe markdown de imagem tipo "![nome](url)" ou qualquer variação disso, mesmo como placeholder ou exemplo. Isso NUNCA vira imagem de verdade pro cliente — aparece como texto quebrado. A ÚNICA forma de o cliente receber uma foto é você chamar send_product_image ou send_more_product_images.
- ÁUDIO: se o histórico tiver "[Áudio enviado pelo cliente]" em mensagens ANTERIORES, é um áudio antigo sem transcrição — ignore e responda baseado no contexto geral da conversa.

## Humanização (conversar como pessoa, não como robô)
- NUNCA se apresente como "assistente virtual", "inteligência artificial", "bot" ou "IA" por conta própria — converse como uma pessoa de verdade atendendo pelo WhatsApp da loja.
- Se o cliente perguntar diretamente "você é um robô?" / "isso é IA?" / "é um bot?" — não negue nem finja ser humano. Admita de forma leve e natural, sem soar formal (ex: "sou o assistente virtual daqui, mas te ajudo igual um consultor de verdade 😉"). Nunca minta dizendo que é uma pessoa.
- VARIE as frases: não repita sempre a mesma estrutura ("Aqui estão algumas opções...", "Como posso ajudar você hoje?"). Escreva como alguém digitando rápido no WhatsApp — direto, sem formalidade excessiva, sem parecer um formulário ou menu de opções.
- Evite som de atendimento automatizado: não liste itens numerados (1. 2. 3.) pra apresentar produtos — isso é dead giveaway de bot. Fale um de cada vez, em texto corrido.

## Contexto do negócio e personalidade
${agent.system_prompt}
${isFirstAiResponse && agent.greeting_message ? `
## Primeira mensagem do cliente nesta conversa
Esta é a primeira vez que este cliente escreve nesta conversa — use como base a mensagem de boas-vindas configurada abaixo (adapte naturalmente ao que ele disse, não repita ela igual se não fizer sentido, mas mantenha a essência de se apresentar):
"${agent.greeting_message}"
` : ''}
${conv.autonomous_mode ? `
## Modo de fechamento autônomo (ativado — não há vendedor humano disponível agora)
Você está conduzindo esta negociação sozinha até o fechamento, sem apoio de um vendedor humano no
momento. Não prometa transferência ("vou chamar alguém", "já te transfiro") — isso quebra a confiança
do cliente. Mantenha a mesma disciplina das regras acima: negocie só dentro do catálogo real (nunca
invente preço, prazo ou desconto fora do cadastrado), quebre objeções com benefícios concretos e
conduza ativamente para o fechamento (forma de pagamento, confirmação do pedido).
` : ''}

## Contexto atual
- Data/hora: ${now}
- Horário de atendimento: ${formatBusinessHours(businessHours)}
- Status: DENTRO do horário de atendimento
${focusProduct ? `
## Produto em foco
O cliente estava vendo "${focusProduct.name}" (ID: ${focusProduct.id}) mais recentemente nesta conversa.
Se ele disser "ele", "dele", "esse", "esse aí", "mais fotos", "tem mais?", "quanto custa?" etc. sem citar
outro produto, ele está se referindo a ESTE produto — use o ID acima diretamente em send_product_image /
send_more_product_images, NÃO chame search_products de novo só pra redescobrir esse ID. Se o cliente
claramente mudar de assunto pra outro produto, ignore esta seção e busque normalmente.` : ''}
${adReferral ? `
## Cliente veio de anúncio
Esta conversa começou porque o cliente clicou em um anúncio patrocinado (Facebook/Instagram Ads) e a
mensagem inicial dele foi gerada automaticamente a partir desse clique — não é uma pergunta espontânea,
é resposta direta ao que ele acabou de ver no anúncio. Assuma que o interesse já está nos produtos em
campanha, sem forçá-lo a explicar o que já demonstrou interesse.
${focusProduct ? `Pelo conteúdo do anúncio, tudo indica que ele viu "${focusProduct.name}" (já coberto na seção "Produto em foco" acima) — confirme com naturalidade e siga direto pra apresentar os diferenciais dele.` : adProducts.length > 0 ? `Produtos atualmente em campanha: ${adProductsListText}. Pergunte de forma natural e direta qual desses chamou a atenção no anúncio, sem soar como um menu.` : `Nenhum produto está marcado como "em anúncio" no momento — trate como um atendimento normal, buscando pelo que o cliente pedir.`}
Conduza ativamente pra gerar interesse e avançar rumo a um agendamento ou fechamento — não trate isso
como um atendimento genérico de primeiro contato.` : ''}`

  const allowedTools = AI_TOOLS.filter((tool) => {
    if (tool.name === 'search_products' && !agent.can_search_products) return false
    if ((tool.name === 'send_product_image' || tool.name === 'send_more_product_images') && !agent.can_send_images) return false
    if ((tool.name === 'check_availability' || tool.name === 'book_appointment' || tool.name === 'cancel_appointment') && !agent.can_book_appointments) return false
    if (tool.name === 'escalate_to_human' && !agent.can_escalate) return false
    if (tool.name === 'schedule_follow_up' && !agentFollowUpEnabled) return false
    return true
  })

  // "Digitando..." fire-and-forget
  getEvolutionClient(tenantId, ENCRYPTION_KEY)
    .then((evo) => evo.sendPresence(contactNumber, 'composing', 5000))
    .catch(() => {})

  const clientSentAudio = lastCustomerMsg?.content_type === 'audio'

  const ctx: ToolContext = {
    tenantId,
    conversationId,
    contactId,
    contactNumber,
    agentId: agent.id,
    agentFollowUpDelayHours,
    agentFollowUpMaxAttempts,
    encryptionKey: ENCRYPTION_KEY,
  }

  const loopMessages = [...normalizedMessages]
  const allToolCalls: Array<{ name: string; input: Record<string, unknown>; result: string }> = []
  let finalText = ''
  let wasEscalated = false
  let imageSent = false
  let deferredImage: DeferredImage | null = null
  let deferredImageProductId: string | null = null
  let lastSearchProductsWithImages: Array<{ name: string; id: string }> = []

  for (let loop = 0; loop < MAX_TOOL_LOOPS; loop++) {
    let response: Awaited<ReturnType<typeof callLLM>>
    try {
      response = await callLLM({
        model: agent.model ?? 'claude-sonnet-4-20250514',
        system: systemPrompt,
        messages: loopMessages,
        tools: allowedTools as LLMTool[],
        maxTokens: agent.max_tokens ?? 1024,
        temperature: Number(agent.temperature ?? 0.7),
        provider: llmProvider,
        anthropicApiKey: resolvedAnthropicKey ?? undefined,
        openaiApiKey: resolvedOpenaiKey ?? undefined,
        geminiApiKey: resolvedGeminiKey ?? undefined,
        openrouterApiKey: resolvedOpenrouterKey ?? undefined,
      })
    } catch (llmErr) {
      const { type, message } = classifyLLMError(llmErr)
      console.error(`[process-message] Erro no LLM (${llmProvider}, ${type}):`, message)
      try {
        await pool.query(
          `insert into ai_error_logs (tenant_id, ai_agent_id, conversation_id, provider, error_type, message)
           values ($1, $2, $3, $4, $5, $6)`,
          [tenantId, agent.id, conversationId, llmProvider, type, message.slice(0, 2000)]
        )
      } catch (logErr) {
        console.error('[process-message] Erro ao registrar ai_error_logs:', logErr)
      }
      try {
        const evo = await getEvolutionClient(tenantId, ENCRYPTION_KEY)
        await evo.sendText(contactNumber, 'Desculpa, estou com uma instabilidade técnica agora. Já vamos verificar e te responder em breve! 🙏')
      } catch (sendErr) {
        console.error('[process-message] Erro ao enviar fallback de erro de LLM:', sendErr)
      }
      return { success: false, skipped: `Erro de LLM (${type})` }
    }

    if (response.stopReason !== 'tool_use') {
      const trimmed = response.text?.trim() ?? ''
      if (trimmed.length > 15 || !imageSent) finalText = trimmed
      break
    }

    const toolResults: LLMContentBlock[] = []
    let shouldBreak = false

    for (const tu of response.toolUses) {
      let result: string
      let escalated = false

      if (tu.name === 'send_product_image') {
        const productId = String(tu.input.product_id ?? '')
        const imageData = await resolveProductImageData(tenantId, productId)
        if (imageData) {
          deferredImage = imageData
          deferredImageProductId = productId
          imageSent = true
          result = 'ok'
          const responseText = response.text?.trim() ?? ''
          if (responseText.length > 5) {
            finalText = responseText
            shouldBreak = true
          }
        } else {
          result = 'Produto não encontrado ou sem imagem cadastrada.'
        }
      } else if (tu.name === 'search_products') {
        let searchInput = tu.input
        let queryCorrected = false
        if (recallWindowKeywords.length > 0 && recallWindowLower) {
          const aiQuery = String(tu.input.query ?? '').toLowerCase()
          const aiQueryWords = aiQuery.split(/\s+/).filter((w) => w.length > 2)
          const aiIntroducedNewWords = aiQueryWords.some((w) => !recallWindowLower.includes(w))
          if (aiIntroducedNewWords) {
            const correctedQuery = recallWindowKeywords.slice(0, 3).join(' ')
            searchInput = { ...tu.input, query: correctedQuery }
            queryCorrected = true
          }
        }
        result = await toolSearchProducts(tenantId, searchInput)
        if (queryCorrected) {
          result = `[SISTEMA: Apresente os produtos abaixo normalmente como resultados disponíveis. NÃO mencione que houve troca de palavras. NÃO escreva "não encontrei" — há produtos no catálogo.]\n\n` + result
        }
        const imgMatches = [...result.matchAll(/📦 \*([^*]+)\*[\s\S]*?use send_product_image com id: ([a-f0-9-]{36})/g)]
        lastSearchProductsWithImages = imgMatches.map(([, name, id]) => ({ name: name.trim(), id: id.trim() }))
      } else {
        const toolResult = await executeTool(ctx, tu.name, tu.input)
        result = toolResult.result
        escalated = toolResult.escalated
      }

      allToolCalls.push({ name: tu.name, input: tu.input, result })
      toolResults.push({ type: 'tool_result', tool_use_id: tu.id, content: result })

      if (escalated) {
        wasEscalated = true
        finalText = result
      }
    }

    if (wasEscalated || shouldBreak) break

    loopMessages.push({ role: 'assistant', content: response.content })
    loopMessages.push({ role: 'user', content: toolResults })
  }

  // Auto-imagem: fallback quando o LLM não chamou send_product_image
  if (!deferredImage && finalText && lastSearchProductsWithImages.length > 0) {
    const finalTextLower = finalText.toLowerCase()
    let matched = false

    for (const { name, id } of lastSearchProductsWithImages) {
      const nameParts = name.split(/\s+/).filter((w) => w.length > 3)
      const matchCount = nameParts.filter((p) => finalTextLower.includes(p.toLowerCase())).length
      if (matchCount >= 2) {
        const imageData = await resolveProductImageData(tenantId, id)
        if (imageData) {
          deferredImage = imageData
          deferredImageProductId = id
          matched = true
          break
        }
      }
    }

    if (!matched && lastSearchProductsWithImages.length === 1) {
      const { id } = lastSearchProductsWithImages[0]
      const imageData = await resolveProductImageData(tenantId, id)
      if (imageData) {
        deferredImage = imageData
        deferredImageProductId = id
      }
    }
  }

  // Rede de segurança: o LLM às vezes tenta "embutir" a imagem como texto markdown
  // (ex: "![Nome](url)"), mesmo com a regra de prompt proibindo isso — nunca deixa de
  // ser texto quebrado no WhatsApp, então removemos aqui antes de enviar.
  if (finalText) {
    finalText = finalText.replace(/!\[[^\]]*\]\([^)]*\)/g, '').trim()
  }

  // "Mais fotos" — resposta enxuta como humano. Quando o cliente só pede mais fotos de um
  // produto que já está em foco/sendo mostrado, um vendedor real não re-descreve o carro
  // inteiro: manda as fotos com uma linha curta. O texto verboso do LLM nesse caso denuncia
  // que é um bot. Não encurtamos se o cliente também perguntou preço/algo a mais na mesma
  // mensagem (aí a resposta completa é necessária).
  const moreImagesIntent = agent.can_send_images && isMoreImagesIntent(lastCustomerMsg?.content)
  const customerMsgLower = (lastCustomerMsg?.content ?? '').toLowerCase()
  const askedSomethingElse = /(pre[çc]o|valor|quanto|custa|financ|parcel|entrada|troca|\bkm\b|\bano\b|\bcor\b|c[âa]mbio|agenda|visita|test)/.test(customerMsgLower)
  const pureMoreImages = moreImagesIntent && !askedSomethingElse && (focusProduct !== null || deferredImage !== null)
  if (pureMoreImages && finalText) {
    const shortReplies = ['Claro! 👇', 'Olha só 👇', 'Tem sim, dá uma olhada 👇', 'Beleza, olha aí 👇', 'Manda ver 👇']
    finalText = shortReplies[Math.floor(Math.random() * shortReplies.length)]
  }

  if (deferredImage && finalText) {
    const cleaned = finalText
      .replace(/[^\n]*[Vv]ou (te )?(enviar|mandar|compartilhar)[^\n]*(imagem|foto)[^\n]*(\n|$)/gi, '')
      .trim()
    if (cleaned.length > 10) finalText = cleaned
  }

  // Salva e envia resposta da IA
  if (finalText) {
    const useAudio = !wasEscalated && clientSentAudio && agent.audio_response_enabled && agent.voice_id && tenantElevenlabsKey
    let sentContentType: 'text' | 'audio' = 'text'

    if (useAudio && agent.voice_id && tenantElevenlabsKey) {
      try {
        const audioBytes = await textToSpeech(finalText, agent.voice_id, tenantElevenlabsKey)
        const audioBase64 = audioToBase64(audioBytes)
        const evo = await getEvolutionClient(tenantId, ENCRYPTION_KEY)
        evo.sendPresence(contactNumber, 'recording', 2000).catch(() => {})
        await evo.sendAudio(contactNumber, audioBase64)
        sentContentType = 'audio'
      } catch (audioErr) {
        console.error('[process-message] Erro ao gerar/enviar áudio TTS, fallback para texto:', audioErr)
        try {
          const evo = await getEvolutionClient(tenantId, ENCRYPTION_KEY)
          await evo.sendText(contactNumber, finalText)
        } catch (sendErr) {
          console.error('[process-message] Erro ao enviar texto (fallback):', sendErr)
        }
      }
    } else {
      try {
        const evo = await getEvolutionClient(tenantId, ENCRYPTION_KEY)
        const parts = splitMessage(finalText)
        for (const part of parts) {
          // Simula ritmo humano de digitação: mais tempo por mensagem mais
          // longa, com uma variação aleatória pra não parecer um cálculo
          // determinístico (bots respondem sempre no mesmo ritmo exato).
          const jitter = Math.floor(Math.random() * 700)
          const composingMs = Math.min(6000, Math.max(1000, part.length * 25 + jitter))
          await evo.sendPresence(contactNumber, 'composing', composingMs)
          await new Promise<void>((r) => setTimeout(r, composingMs + 200))
          await evo.sendText(contactNumber, part)
        }
      } catch (sendErr) {
        console.error('[process-message] Erro ao enviar via Evolution:', sendErr)
      }
    }

    await pool.query(
      `insert into messages (tenant_id, conversation_id, contact_id, sender_type, content, content_type, ai_tool_calls)
       values ($1, $2, $3, 'ai', $4, $5, $6)`,
      [tenantId, conversationId, contactId, finalText, sentContentType, allToolCalls.length > 0 ? JSON.stringify(allToolCalls) : null]
    )
  }

  // Envia imagem diferida após a resposta principal
  if (deferredImage) {
    try {
      await new Promise<void>((r) => setTimeout(r, 4000))
      const evo = await getEvolutionClient(tenantId, ENCRYPTION_KEY)
      await evo.sendMedia(contactNumber, deferredImage.imageUrl, deferredImage.caption)
      await pool.query(
        `insert into messages (tenant_id, conversation_id, contact_id, sender_type, content, content_type, media_url)
         values ($1, $2, $3, 'ai', $4, 'image', $5)`,
        [tenantId, conversationId, contactId, deferredImage.caption, deferredImage.imageUrl]
      )
    } catch (err) {
      console.error('[process-message] Erro ao enviar imagem diferida:', err)
    }
  }

  // "Mais fotos" — garantia determinística (não confiar só no LLM).
  // Cliente vindo de anúncio quase sempre pede "mais fotos do X" logo de cara, e o modelo
  // erra com frequência: manda só a foto de destaque (send_product_image) e esquece de
  // chamar send_more_product_images. Aqui, se a mensagem do cliente pede claramente mais
  // fotos/imagens e sabemos qual é o produto em foco (o que teve a foto principal enviada
  // agora, ou o último produto mostrado na conversa), forçamos o envio das demais fotos.
  if (agent.can_send_images) {
    const alreadySentMore = allToolCalls.some((c) => c.name === 'send_more_product_images')
    const moreImagesProductId = deferredImageProductId ?? focusProduct?.id ?? null

    if (moreImagesIntent && !alreadySentMore && moreImagesProductId) {
      try {
        // Se a foto de destaque foi enviada agora, ela já saiu acima (delay de 4s) —
        // um respiro curto pra as fotos adicionais não colidirem com ela.
        if (deferredImage) await new Promise<void>((r) => setTimeout(r, 1500))
        await executeTool(ctx, 'send_more_product_images', { product_id: moreImagesProductId })
      } catch (err) {
        console.error('[process-message] Erro no envio determinístico de mais fotos:', err)
      }
    }
  }

  // Auto follow-up
  const aiScheduledFollowUp = allToolCalls.some((c) => c.name === 'schedule_follow_up')
  if (agentFollowUpEnabled && !wasEscalated && finalText && !aiScheduledFollowUp) {
    try {
      const countRes = await pool.query<{ count: string }>(
        `select count(*) from follow_ups where conversation_id = $1 and status not in ('cancelled','max_reached')`,
        [conversationId]
      )
      const attemptNumber = Number(countRes.rows[0]?.count ?? 0) + 1
      if (attemptNumber <= agentFollowUpMaxAttempts) {
        const scheduledAt = new Date(Date.now() + agentFollowUpDelayHours * 60 * 60 * 1000)
        const existingRes = await pool.query<{ id: string }>(
          `select id from follow_ups where conversation_id = $1 and status = 'pending' limit 1`,
          [conversationId]
        )
        if (existingRes.rows[0]) {
          await pool.query(`update follow_ups set scheduled_at = $1 where id = $2`, [scheduledAt.toISOString(), existingRes.rows[0].id])
        } else {
          await pool.query(
            `insert into follow_ups (tenant_id, contact_id, conversation_id, ai_agent_id, scheduled_at, attempt_number, status, context)
             values ($1, $2, $3, $4, $5, $6, 'pending', 'Follow-up automático — sem resposta do cliente')`,
            [tenantId, contactId, conversationId, agent.id, scheduledAt.toISOString(), attemptNumber]
          )
        }
      }
    } catch (fuErr) {
      console.error('[process-message] Erro ao criar auto follow-up:', fuErr)
    }
  }

  return { success: true, escalated: wasEscalated }
}
