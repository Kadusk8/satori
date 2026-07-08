// Núcleo do agente de IA — recebe uma conversa, monta o contexto, chama o LLM
// com function calling e envia a resposta via Evolution Go.
// Porta de supabase/functions/process-message/index.ts.
//
// Diferença de arquitetura vs. o original: no Supabase, webhook-evolution
// invocava esta function via HTTP fetch (hop extra). Aqui, como tudo roda no
// mesmo processo Node, é uma chamada de função direta — ver routes/webhook.ts.

import { and, asc, desc, eq } from 'drizzle-orm'
import { pool, getTenantLlmKeys, getAgentLlmKey } from '../db/index.js'
import { conversations, kanbanStages, messages } from '../db/schema.js'
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
  created_at: Date
}

export async function processMessage(conversationId: string): Promise<{ success: boolean; skipped?: string; outOfHours?: boolean; escalated?: boolean }> {
  const convRes = await pool.query<ConversationRow>(
    `select c.id, c.tenant_id, c.contact_id, c.status, c.autonomous_mode,
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

  const stopWords = new Set([
    'quero', 'para', 'favor', 'você', 'como', 'tenho', 'esse', 'essa', 'aqui', 'mais', 'qual', 'quer', 'com', 'por',
    'uma', 'que', 'tem', 'ver', 'gostaria', 'preciso', 'pode', 'mostrar', 'produto', 'coisa', 'algo', 'isso', 'isto',
    'aquilo', 'este', 'esta',
  ])
  const customerKeywords: string[] = lastCustomerMsg?.content
    ? lastCustomerMsg.content
        .toLowerCase()
        .replace(/[^a-záàâãéèêíïóôõöúüçñ\s]/gi, ' ')
        .split(/\s+/)
        .filter((w) => w.length > 3 && !stopWords.has(w))
    : []

  const now = new Intl.DateTimeFormat('pt-BR', { dateStyle: 'full', timeStyle: 'short', timeZone: timezone }).format(new Date())
  const isFirstAiResponse = !history.some((m) => m.sender_type === 'ai')

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
- MAIS FOTOS: send_product_image manda só a foto de destaque (a principal). Se DEPOIS disso o cliente demonstrar mais interesse (ex: "tem mais fotos?", "gostei, quero ver mais", "como é por dentro?", "quero ver melhor"), chame send_more_product_images pra enviar as demais. Nunca chame as duas na mesma resposta — primeiro a de destaque, as outras só se pedirem.
- 1 PRODUTO SOMENTE — INVIOLÁVEL: mesmo que search_products retorne 2 ou 3 resultados, você deve apresentar APENAS 1 — o mais relevante. Nunca descreva ou mencione mais de 1 produto em uma mesma mensagem. Isso não é negociável.
- NUNCA DIGA "não encontrei" / "não consigo encontrar" / "não temos esse produto": search_products SEMPRE retorna produtos do catálogo real. Se há um produto no resultado, ele EXISTE e está disponível — apresente-o diretamente. NUNCA explique que buscou por outra palavra ou que o produto não é exato.
- NUNCA REPITA PERGUNTAS: se o cliente já disse o tamanho, preferência ou nome, use essa informação. Nunca peça de novo.
- MENSAGENS CURTAS: máximo 2-3 frases por mensagem. WhatsApp não é e-mail.
- LINKS: nunca escreva URLs. Use send_product_image.
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
- Status: DENTRO do horário de atendimento`

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
        const customerMsgLower = (lastCustomerMsg?.content ?? '').toLowerCase()
        if (customerKeywords.length > 0 && customerMsgLower) {
          const aiQuery = String(tu.input.query ?? '').toLowerCase()
          const aiQueryWords = aiQuery.split(/\s+/).filter((w) => w.length > 2)
          const aiIntroducedNewWords = aiQueryWords.some((w) => !customerMsgLower.includes(w))
          if (aiIntroducedNewWords) {
            const correctedQuery = customerKeywords.slice(0, 3).join(' ')
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
          matched = true
          break
        }
      }
    }

    if (!matched && lastSearchProductsWithImages.length === 1) {
      const { id } = lastSearchProductsWithImages[0]
      const imageData = await resolveProductImageData(tenantId, id)
      if (imageData) deferredImage = imageData
    }
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
