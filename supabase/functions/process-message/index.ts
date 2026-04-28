import { createAdminClient } from '../_shared/supabase-admin.ts'
import { getEvolutionClient } from '../_shared/evolution-client.ts'
import { callLLM, type LLMMessage, type LLMContentBlock, type LLMTool } from '../_shared/llm-client.ts'
import { AI_TOOLS } from '../_shared/claude-tools.ts'
import { transcribeAudio } from '../_shared/whisper-client.ts'
import { textToSpeech, audioToBase64 } from '../_shared/elevenlabs-client.ts'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? ''
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
const ENCRYPTION_KEY = Deno.env.get('ENCRYPTION_KEY') ?? null

// Máximo de ciclos tool_use → tool_result para evitar loops infinitos
const MAX_TOOL_LOOPS = 5

// ── Helpers de contexto ──────────────────────────────────────────────────────

function formatBusinessHours(businessHours: Record<string, { enabled: boolean; start: string; end: string }>): string {
  const dayNames: Record<string, string> = {
    mon: 'Seg', tue: 'Ter', wed: 'Qua',
    thu: 'Qui', fri: 'Sex', sat: 'Sáb', sun: 'Dom',
  }
  return Object.entries(businessHours)
    .filter(([, h]) => h.enabled !== false && h.start && h.end)
    .map(([day, h]) => `${dayNames[day]}: ${h.start}–${h.end}`)
    .join(' | ') || 'Não configurado'
}

function isWithinBusinessHours(
  businessHours: Record<string, { enabled: boolean; start: string; end: string }>,
  timezone: string
): boolean {
  const now = new Date()
  const localTime = new Intl.DateTimeFormat('en-US', {
    timeZone: timezone,
    weekday: 'short',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).formatToParts(now)

  const weekdayMap: Record<string, string> = {
    Mon: 'mon', Tue: 'tue', Wed: 'wed',
    Thu: 'thu', Fri: 'fri', Sat: 'sat', Sun: 'sun',
  }
  const weekday = localTime.find((p) => p.type === 'weekday')?.value ?? ''
  const dayKey = weekdayMap[weekday]
  const hour = localTime.find((p) => p.type === 'hour')?.value ?? '00'
  const minute = localTime.find((p) => p.type === 'minute')?.value ?? '00'
  const currentTime = `${hour}:${minute}`

  const dayHours = businessHours[dayKey]
  // Se não tem horários configurados para o dia, considera fechado
  if (!dayHours?.start || !dayHours?.end) return false
  // 'enabled' ausente (formato antigo sem o campo) = considera habilitado
  if (dayHours.enabled === false) return false
  return currentTime >= dayHours.start && currentTime <= dayHours.end
}

// ── Executores de tool ───────────────────────────────────────────────────────

async function toolSearchProducts(
  supabase: ReturnType<typeof createAdminClient>,
  tenantId: string,
  input: Record<string, unknown>
): Promise<string> {
  const query = input.query ? String(input.query).trim() : ''
  const categoryParam = input.category ? String(input.category) : null
  const maxResults = Number(input.max_results ?? 1)
  const priceMax = input.price_max ? Number(input.price_max) : null

  const baseSelect = 'id, name, short_description, description, price_display, price, category, images'

  function baseQuery() {
    let q = supabase
      .from('products')
      .select(baseSelect)
      .eq('tenant_id', tenantId)
      .eq('is_available', true)
    if (priceMax) q = q.lte('price', priceMax)
    return q
  }

  let data: Array<Record<string, unknown>> | null = null

  // 1ª tentativa: busca por categoria (ilike, case-insensitive) + query no nome
  // Usada quando a IA passou category explicitamente, ou quando a query contém
  // palavras que mapeiam para uma categoria conhecida no catálogo.
  // Busca as categorias disponíveis no banco para fazer match dinâmico.
  const { data: categories } = await supabase
    .from('products')
    .select('category')
    .eq('tenant_id', tenantId)
    .eq('is_available', true)
    .not('category', 'is', null)

  const uniqueCategories = [...new Set((categories ?? []).map((r: Record<string, unknown>) => String(r.category)))] as string[]

  // Detecta se a query menciona uma categoria existente no catálogo
  const queryLower = query.toLowerCase()
  const matchedCategory = categoryParam
    ?? uniqueCategories.find((cat) => queryLower.includes(cat.toLowerCase())) ?? null

  if (matchedCategory) {
    const { data: catData } = await baseQuery()
      .ilike('category', matchedCategory)
      .limit(maxResults)
    if (catData?.length) data = catData
  }

  // 2ª tentativa: textSearch full-text (stemming português) — sem filtro de categoria
  if (!data?.length && query) {
    const { data: tsData } = await baseQuery()
      .textSearch('search_vector', query, { type: 'websearch', config: 'portuguese' })
      .limit(maxResults)
    if (tsData?.length) data = tsData
  }

  // 3ª tentativa: ilike no nome/descrição — sem filtro de categoria
  if (!data?.length && query) {
    const safeQuery = query.replace(/[,()]/g, ' ').trim()
    const { data: ilikeData } = await baseQuery()
      .or(`name.ilike.%${safeQuery}%,description.ilike.%${safeQuery}%`)
      .limit(maxResults)
    if (ilikeData?.length) data = ilikeData
  }

  // 4ª tentativa: listar todos os produtos disponíveis (garante que a IA sempre tem algo)
  if (!data?.length) {
    const { data: allData } = await baseQuery()
      .order('is_featured', { ascending: false })
      .order('name', { ascending: true })
      .limit(maxResults)
    data = allData
  }

  if (!data?.length) {
    return 'Nenhum produto cadastrado no momento.'
  }

  console.log(`[search_products] query="${query}" → ${data.length} produto(s):`, data.map((p) => {
    const imgs = Array.isArray(p.images) ? (p.images as unknown[]) : []
    return `${p.name} (imgs:${imgs.length})`
  }).join(', '))

  return data
    .map((p) => {
      const images = Array.isArray(p.images) && (p.images as unknown[]).length > 0 ? p.images as unknown[] : []
      const hasImage = images.length > 0
      // Usa short_description para WhatsApp quando disponível
      const desc = p.short_description || p.description
      return [
        `📦 *${p.name}*`,
        p.price_display ? `💰 ${p.price_display}` : (p.price ? `💰 R$ ${Number(p.price).toFixed(2)}` : ''),
        desc ? `📝 ${desc}` : '',
        p.category ? `🏷️ ${p.category}` : '',
        hasImage ? `🖼️ [tem imagem — use send_product_image com id: ${p.id}]` : '',
        `ID: ${p.id}`,
      ].filter(Boolean).join('\n')
    })
    .join('\n\n')
}

async function toolCheckAvailability(
  supabase: ReturnType<typeof createAdminClient>,
  tenantId: string,
  input: Record<string, unknown>
): Promise<string> {
  const { data: tenant } = await supabase
    .from('tenants')
    .select('appointment_duration_minutes, business_hours, timezone')
    .eq('id', tenantId)
    .single()

  if (!tenant) return 'Erro ao buscar configurações de agenda.'

  const duration = tenant.appointment_duration_minutes ?? 30
  const bh = tenant.business_hours as Record<string, { enabled: boolean; start: string; end: string }>
  const timezone = tenant.timezone ?? 'America/Sao_Paulo'

  // Datas a verificar: hoje + próximos 6 dias (ou só a data informada)
  const targetDate = input.date ? String(input.date) : null
  const period = input.period ? String(input.period) : null

  const dates: string[] = []
  if (targetDate) {
    dates.push(targetDate)
  } else {
    // Gera datas no fuso do tenant para evitar off-by-one na virada da meia-noite
    const now = new Date()
    for (let i = 0; i < 7; i++) {
      const d = new Date(now.getTime() + i * 24 * 60 * 60 * 1000)
      dates.push(d.toLocaleDateString('en-CA', { timeZone: timezone }))
    }
  }

  const dayMap: Record<number, string> = { 0: 'sun', 1: 'mon', 2: 'tue', 3: 'wed', 4: 'thu', 5: 'fri', 6: 'sat' }

  const available: string[] = []

  for (const dateStr of dates) {
    const date = new Date(`${dateStr}T12:00:00`)
    const dayKey = dayMap[date.getDay()]
    const dayHours = bh[dayKey]
    if (!dayHours?.start || !dayHours?.end) continue
    if (dayHours.enabled === false) continue

    // Gera slots no dia
    const [startH, startM] = dayHours.start.split(':').map(Number)
    const [endH, endM] = dayHours.end.split(':').map(Number)
    const startMinutes = startH * 60 + startM
    const endMinutes = endH * 60 + endM

    // Filtra por período se informado
    const periodFilters: Record<string, [number, number]> = {
      morning: [0, 720],       // até 12:00
      afternoon: [720, 1080],  // 12:00–18:00
      evening: [1080, 1440],   // 18:00+
    }

    const slots: string[] = []
    for (let m = startMinutes; m + duration <= endMinutes; m += duration) {
      if (period) {
        const [pStart, pEnd] = periodFilters[period] ?? [0, 1440]
        if (m < pStart || m >= pEnd) continue
      }
      const h = String(Math.floor(m / 60)).padStart(2, '0')
      const min = String(m % 60).padStart(2, '0')
      slots.push(`${h}:${min}`)
    }

    if (slots.length === 0) continue

    // Remove horários já agendados
    const { data: booked } = await supabase
      .from('appointments')
      .select('start_time')
      .eq('tenant_id', tenantId)
      .eq('date', dateStr)
      .not('status', 'in', '(cancelled)')

    const bookedTimes = new Set((booked ?? []).map((a) => a.start_time.slice(0, 5)))
    const freeSlots = slots.filter((s) => !bookedTimes.has(s))

    if (freeSlots.length > 0) {
      const dateLabel = new Intl.DateTimeFormat('pt-BR', {
        weekday: 'long', day: 'numeric', month: 'long', timeZone: timezone,
      }).format(date)
      available.push(`📅 *${dateLabel}*: ${freeSlots.slice(0, 6).join(', ')}`)
    }

    if (available.length >= 3) break
  }

  if (available.length === 0) return 'Não há horários disponíveis nos próximos dias.'
  return `Horários disponíveis:\n\n${available.join('\n')}`
}

async function toolBookAppointment(
  supabase: ReturnType<typeof createAdminClient>,
  tenantId: string,
  conversationId: string,
  contactId: string,
  input: Record<string, unknown>
): Promise<string> {
  const date = String(input.date ?? '')
  const startTime = String(input.start_time ?? '')
  if (!date || !startTime) return 'Data e horário são obrigatórios para agendar.'

  const { data: tenant } = await supabase
    .from('tenants')
    .select('appointment_duration_minutes')
    .eq('id', tenantId)
    .single()

  const duration = tenant?.appointment_duration_minutes ?? 30
  const [h, m] = startTime.split(':').map(Number)
  const endMinutes = h * 60 + m + duration
  const endTime = `${String(Math.floor(endMinutes / 60)).padStart(2, '0')}:${String(endMinutes % 60).padStart(2, '0')}`

  const { data: appt, error } = await supabase
    .from('appointments')
    .insert({
      tenant_id: tenantId,
      contact_id: contactId,
      conversation_id: conversationId,
      date,
      start_time: startTime,
      end_time: endTime,
      status: 'confirmed',
      title: input.contact_name ? `Agendamento — ${input.contact_name}` : 'Agendamento',
      notes: input.notes ? String(input.notes) : null,
    })
    .select('id')
    .single()

  if (error) {
    if (error.message.includes('exclusion constraint') || error.message.includes('conflito')) {
      return 'Esse horário já está ocupado. Por favor, escolha outro horário.'
    }
    return `Erro ao criar agendamento: ${error.message}`
  }

  // Move card para 'agendado' no kanban
  const { data: agStage } = await supabase
    .from('kanban_stages')
    .select('id')
    .eq('tenant_id', tenantId)
    .eq('slug', 'agendado')
    .single()
  if (agStage) {
    await supabase
      .from('conversations')
      .update({ kanban_stage_id: agStage.id })
      .eq('id', conversationId)
  }

  return `✅ Agendamento confirmado!\n📅 Data: ${date}\n🕐 Horário: ${startTime}–${endTime}\nID: ${appt.id}`
}

async function toolCancelAppointment(
  supabase: ReturnType<typeof createAdminClient>,
  tenantId: string,
  input: Record<string, unknown>
): Promise<string> {
  const appointmentId = String(input.appointment_id ?? '')
  if (!appointmentId) return 'ID do agendamento é obrigatório.'

  const { error } = await supabase
    .from('appointments')
    .update({ status: 'cancelled' })
    .eq('id', appointmentId)
    .eq('tenant_id', tenantId) // garante que o agendamento pertence ao tenant

  if (error) return `Erro ao cancelar: ${error.message}`
  return '✅ Agendamento cancelado com sucesso.'
}

async function toolEscalateToHuman(
  supabase: ReturnType<typeof createAdminClient>,
  conversationId: string,
  input: Record<string, unknown>
): Promise<string> {
  const reason = String(input.reason ?? '')
  const summary = String(input.summary ?? '')
  const priority = String(input.priority ?? 'normal')

  // Move a conversa para aguardando humano
  const { data: conv, error } = await supabase
    .from('conversations')
    .update({
      status: 'waiting_human',
      ai_summary: summary,
      priority,
    })
    .eq('id', conversationId)
    .select('tenant_id, kanban_stage_id')
    .single()

  if (error) return `Erro ao escalar: ${error.message}`

  // Move card no kanban para 'aguardando_humano'
  const { data: stage } = await supabase
    .from('kanban_stages')
    .select('id')
    .eq('tenant_id', conv.tenant_id)
    .eq('slug', 'aguardando_humano')
    .single()

  if (stage) {
    await supabase
      .from('conversations')
      .update({ kanban_stage_id: stage.id })
      .eq('id', conversationId)
  }

  return `Transferindo para um atendente humano. Motivo: ${reason}. Em breve alguém da equipe irá te atender! 🙏`
}

interface DeferredImage {
  productName: string
  imageUrl: string
  caption: string
}

/** Resolve dados da imagem do produto sem enviar nada. Retorna null se não encontrado. */
async function resolveProductImageData(
  supabase: ReturnType<typeof createAdminClient>,
  tenantId: string,
  productId: string
): Promise<DeferredImage | null> {
  if (!productId) return null

  const { data: product } = await supabase
    .from('products')
    .select('name, short_description, description, price_display, price, images')
    .eq('id', productId)
    .eq('tenant_id', tenantId)
    .single()

  if (!product) return null

  const images = Array.isArray(product.images) ? product.images : []
  if (images.length === 0) return null

  const imageUrl = (images[0] as Record<string, unknown>)?.url ?? images[0]
  if (!imageUrl || typeof imageUrl !== 'string') return null

  const desc = product.short_description || product.description || ''
  const caption = [
    `📦 *${product.name}*`,
    desc ? desc : '',
  ].filter(Boolean).join('\n')

  return { productName: product.name, imageUrl, caption }
}

async function toolSendProductImage(
  supabase: ReturnType<typeof createAdminClient>,
  tenantId: string,
  conversationId: string,
  contactId: string,
  contactNumber: string,
  input: Record<string, unknown>
): Promise<string> {
  const productId = String(input.product_id ?? '')
  const imageData = await resolveProductImageData(supabase, tenantId, productId)

  if (!imageData) return `Produto não encontrado ou sem imagem cadastrada.`

  // Envia imagem diretamente via Evolution (sem hop extra para send-whatsapp)
  try {
    const evo = await getEvolutionClient(tenantId, ENCRYPTION_KEY)
    await evo.sendMedia(contactNumber, imageData.imageUrl, imageData.caption)
  } catch (err) {
    console.error('[toolSendProductImage] Erro ao enviar imagem:', err)
    return `Erro ao enviar imagem de "${imageData.productName}".`
  }

  // Salva mensagem de imagem no banco
  await supabase.from('messages').insert({
    tenant_id: tenantId,
    conversation_id: conversationId,
    contact_id: contactId,
    sender_type: 'ai',
    content: imageData.caption,
    content_type: 'image',
    media_url: imageData.imageUrl,
  })

  return `Imagem de "${imageData.productName}" enviada.`
}

async function toolScheduleFollowUp(
  supabase: ReturnType<typeof createAdminClient>,
  tenantId: string,
  contactId: string,
  conversationId: string,
  agentId: string,
  agentFollowUpDelayHours: number,
  agentFollowUpMaxAttempts: number,
  input: Record<string, unknown>
): Promise<string> {
  const delayHours = Number(input.delay_hours ?? agentFollowUpDelayHours)
  const context = String(input.context ?? '')

  // Verifica se já existe um follow-up pendente para esta conversa
  const { data: existing } = await supabase
    .from('follow_ups')
    .select('id')
    .eq('conversation_id', conversationId)
    .eq('status', 'pending')
    .limit(1)

  if (existing && existing.length > 0) {
    return 'Follow-up já agendado para esta conversa.'
  }

  // Conta tentativas já feitas para não ultrapassar o máximo
  const { count } = await supabase
    .from('follow_ups')
    .select('id', { count: 'exact', head: true })
    .eq('conversation_id', conversationId)
    .not('status', 'in', '(cancelled)')

  const attemptNumber = (count ?? 0) + 1
  if (attemptNumber > agentFollowUpMaxAttempts) {
    return `Número máximo de follow-ups (${agentFollowUpMaxAttempts}) já atingido para esta conversa.`
  }

  const scheduledAt = new Date(Date.now() + delayHours * 60 * 60 * 1000).toISOString()

  const { error } = await supabase.from('follow_ups').insert({
    tenant_id: tenantId,
    contact_id: contactId,
    conversation_id: conversationId,
    ai_agent_id: agentId,
    scheduled_at: scheduledAt,
    attempt_number: attemptNumber,
    status: 'pending',
    context,
  })

  if (error) return `Erro ao agendar follow-up: ${error.message}`

  const hoursLabel = delayHours === 1 ? '1 hora' : `${delayHours} horas`
  return `✅ Follow-up agendado! Entrarei em contato novamente em ${hoursLabel} caso não haja resposta.`
}

async function toolGetBusinessInfo(
  supabase: ReturnType<typeof createAdminClient>,
  tenantId: string
): Promise<string> {
  const { data: tenant } = await supabase
    .from('tenants')
    .select('name, business_segment, business_description, address, city, state, website, business_hours, timezone, owner_phone')
    .eq('id', tenantId)
    .single()

  if (!tenant) return 'Informações do negócio não encontradas.'

  const bh = tenant.business_hours as Record<string, { enabled: boolean; start: string; end: string }>
  const hoursText = formatBusinessHours(bh)
  const address = [tenant.address, tenant.city, tenant.state].filter(Boolean).join(', ')

  return [
    `🏢 *${tenant.name}*`,
    tenant.business_description ? `📋 ${tenant.business_description}` : '',
    hoursText ? `🕐 Horários: ${hoursText}` : '',
    address ? `📍 Endereço: ${address}` : '',
    tenant.website ? `🌐 Site: ${tenant.website}` : '',
    tenant.owner_phone ? `📞 Contato: ${tenant.owner_phone}` : '',
  ].filter(Boolean).join('\n')
}

// ── Dispatcher de tools ──────────────────────────────────────────────────────

interface ToolContext {
  supabase: ReturnType<typeof createAdminClient>
  tenantId: string
  conversationId: string
  contactId: string
  contactNumber: string
  instanceName: string
  agentId: string
  agentFollowUpDelayHours: number
  agentFollowUpMaxAttempts: number
}

async function executeTool(
  ctx: ToolContext,
  toolName: string,
  input: Record<string, unknown>
): Promise<{ result: string; escalated: boolean }> {
  let result: string
  let escalated = false

  switch (toolName) {
    case 'search_products':
      result = await toolSearchProducts(ctx.supabase, ctx.tenantId, input)
      break
    case 'check_availability':
      result = await toolCheckAvailability(ctx.supabase, ctx.tenantId, input)
      break
    case 'book_appointment':
      result = await toolBookAppointment(
        ctx.supabase, ctx.tenantId, ctx.conversationId, ctx.contactId, input
      )
      break
    case 'cancel_appointment':
      result = await toolCancelAppointment(ctx.supabase, ctx.tenantId, input)
      break
    case 'escalate_to_human':
      result = await toolEscalateToHuman(ctx.supabase, ctx.conversationId, input)
      escalated = true
      break
    case 'send_product_image':
      result = await toolSendProductImage(
        ctx.supabase, ctx.tenantId, ctx.conversationId,
        ctx.contactId, ctx.contactNumber, input
      )
      break
    case 'get_business_info':
      result = await toolGetBusinessInfo(ctx.supabase, ctx.tenantId)
      break
    case 'schedule_follow_up':
      result = await toolScheduleFollowUp(
        ctx.supabase,
        ctx.tenantId,
        ctx.contactId,
        ctx.conversationId,
        ctx.agentId,
        ctx.agentFollowUpDelayHours,
        ctx.agentFollowUpMaxAttempts,
        input
      )
      break
    default:
      result = `Tool "${toolName}" não reconhecida.`
  }

  return { result, escalated }
}

// ── Handler principal ────────────────────────────────────────────────────────

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, {
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
      },
    })
  }

  if (req.method !== 'POST') {
    return Response.json({ error: 'Método não permitido' }, { status: 405 })
  }

  let body: { conversationId: string }
  try {
    body = await req.json()
  } catch {
    return Response.json({ error: 'Payload inválido' }, { status: 400 })
  }

  const { conversationId } = body
  if (!conversationId) {
    return Response.json({ error: 'conversationId obrigatório' }, { status: 400 })
  }

  const supabase = createAdminClient()

  try {
    // ── 1. Carrega a conversa com tenant e contato ─────────────────
    const { data: conv, error: convError } = await supabase
      .from('conversations')
      .select(`
        id, tenant_id, contact_id, status, ai_context,
        contacts ( whatsapp_number ),
        tenants (
          id, name, business_hours, timezone,
          evolution_instance_name,
          openai_api_key, gemini_api_key, anthropic_api_key, elevenlabs_api_key,
          ai_agents ( id, model, system_prompt, max_tokens, temperature, personality, greeting_message, out_of_hours_message, escalation_rules, can_search_products, can_book_appointments, can_send_images, can_escalate, is_default, is_active, follow_up_enabled, follow_up_delay_hours, follow_up_max_attempts, voice_id, audio_response_enabled )
        )
      `)
      .eq('id', conversationId)
      .single()

    if (convError || !conv) {
      return Response.json({ error: 'Conversa não encontrada' }, { status: 404 })
    }

    // Se conversa já escalada para humano, não processa com IA
    if (conv.status === 'waiting_human' || conv.status === 'human_handling') {
      return Response.json({ skipped: true, reason: 'Conversa sob atendimento humano' })
    }

    const tenant = Array.isArray(conv.tenants) ? conv.tenants[0] : conv.tenants
    const contact = Array.isArray(conv.contacts) ? conv.contacts[0] : conv.contacts

    if (!tenant || !contact) {
      return Response.json({ error: 'Tenant ou contato não encontrado' }, { status: 404 })
    }

    // Seleciona o agente SDR padrão ativo
    const agents = Array.isArray(tenant.ai_agents) ? tenant.ai_agents : [tenant.ai_agents]
    const agent = agents.find((a: Record<string, unknown>) => a.is_default && a.is_active) ?? agents[0]

    if (!agent) {
      return Response.json({ error: 'Nenhum agente de IA configurado para este tenant' }, { status: 404 })
    }

    // Extrai campos de follow-up do agente (com fallback para os padrões)
    const agentFollowUpEnabled = agent.follow_up_enabled !== false
    const agentFollowUpDelayHours = Number(agent.follow_up_delay_hours ?? 24)
    const agentFollowUpMaxAttempts = Number(agent.follow_up_max_attempts ?? 3)

    const tenantId = conv.tenant_id
    const contactId = conv.contact_id
    const contactNumber = contact.whatsapp_number
    const instanceName = tenant.evolution_instance_name

    // Descriptografa LLM keys via RPC (se app.encryption_key configurado).
    // Fallback para as colunas brutas (texto plano) enquanto a chave não estiver configurada.
    const { data: llmKeys } = await supabase
      .rpc('get_tenant_llm_keys', { p_tenant_id: tenantId, p_enc_key: ENCRYPTION_KEY })
    const tenantOpenaiKey =
      (llmKeys?.openai_api_key as string | null) ?? (tenant.openai_api_key as string | null) ?? null
    const tenantAnthropicKey =
      (llmKeys?.anthropic_api_key as string | null) ?? (tenant.anthropic_api_key as string | null) ?? null
    const tenantGeminiKey =
      (llmKeys?.gemini_api_key as string | null) ?? (tenant.gemini_api_key as string | null) ?? null
    const tenantElevenlabsKey =
      (llmKeys?.elevenlabs_api_key as string | null) ?? (tenant.elevenlabs_api_key as string | null) ?? null

    // Move card para 'ia_atendendo' quando a IA assume o atendimento
    {
      const { data: iaStage } = await supabase
        .from('kanban_stages')
        .select('id')
        .eq('tenant_id', tenantId)
        .eq('slug', 'ia_atendendo')
        .single()
      if (iaStage) {
        await supabase
          .from('conversations')
          .update({ kanban_stage_id: iaStage.id })
          .eq('id', conversationId)
      }
    }

    // ── 2. Verifica horário de atendimento ─────────────────────────
    const businessHours = tenant.business_hours as Record<string, { enabled: boolean; start: string; end: string }>
    const timezone = tenant.timezone ?? 'America/Sao_Paulo'
    const isOpen = isWithinBusinessHours(businessHours, timezone)

    if (!isOpen && agent.out_of_hours_message) {
      // Envia mensagem de fora do horário diretamente via Evolution e encerra
      try {
        const evo = await getEvolutionClient(tenantId, ENCRYPTION_KEY)
        await evo.sendText(contactNumber, agent.out_of_hours_message)
      } catch (err) {
        console.error('[process-message] Erro ao enviar out_of_hours:', err)
      }
      return Response.json({ success: true, outOfHours: true })
    }

    // ── 3. Carrega histórico de mensagens (últimas 40) ─────────────
    const { data: history } = await supabase
      .from('messages')
      .select('id, sender_type, content, content_type, media_url, created_at')
      .eq('conversation_id', conversationId)
      .order('created_at', { ascending: true })
      .limit(40)

    // ── 3a. Transcreve áudio do cliente (STT) se necessário ────────
    // Busca a última mensagem do cliente diretamente do banco (query separada
    // para garantir que pegamos a mensagem mais recente, não limitada pelo histórico)
    const { data: lastCustomerMsgRow } = await supabase
      .from('messages')
      .select('id, sender_type, content, content_type, media_url, created_at')
      .eq('conversation_id', conversationId)
      .eq('sender_type', 'customer')
      .order('created_at', { ascending: false })
      .limit(1)
      .single()

    const lastCustomerMsg = lastCustomerMsgRow ?? null

    if (
      lastCustomerMsg &&
      lastCustomerMsg.content_type === 'audio' &&
      lastCustomerMsg.media_url &&
      !lastCustomerMsg.content &&
      tenantOpenaiKey
    ) {
      // Detecta o tipo de URL para usar o header de autenticação correto:
      // - URL do Supabase Storage → Bearer com service role key (acessa bucket público e privado)
      // - URL da Evolution API (fallback quando upload falhou) → apikey header (descriptografada via RPC)
      const isSupabaseStorageUrl = lastCustomerMsg.media_url.includes('/storage/v1/')
      let audioDownloadHeaders: Record<string, string> | undefined = isSupabaseStorageUrl
        ? { Authorization: `Bearer ${SERVICE_ROLE_KEY}` }
        : undefined
      if (!isSupabaseStorageUrl) {
        const { data: evoKey } = await supabase.rpc('get_decrypted_evolution_key', { p_tenant_id: tenantId, p_enc_key: ENCRYPTION_KEY })
        if (evoKey) audioDownloadHeaders = { apikey: evoKey as string }
      }

      console.log(`[process-message] Transcrevendo áudio: isStorage=${isSupabaseStorageUrl}, url=${lastCustomerMsg.media_url}`)
      const transcript = await transcribeAudio(lastCustomerMsg.media_url, tenantOpenaiKey, audioDownloadHeaders)
      console.log(`[process-message] Transcrição resultado: "${transcript?.slice(0, 80) ?? 'vazio'}")`)
      if (transcript) {
        // Persiste a transcrição no banco para ficar visível no CRM
        await supabase
          .from('messages')
          .update({ content: transcript })
          .eq('id', lastCustomerMsg.id)
        lastCustomerMsg.content = transcript
        // Atualiza também no array history (objeto separado em memória — mesma row do banco)
        const histMsg = (history ?? []).find((m: { id: string; content: string | null }) => m.id === lastCustomerMsg.id)
        if (histMsg) histMsg.content = transcript
      }
    }

    // Áudio sem transcrição: sem conteúdo para processar com a IA
    // → avisa o cliente para enviar em texto e encerra sem chamar o Claude
    if (
      lastCustomerMsg &&
      lastCustomerMsg.content_type === 'audio' &&
      !lastCustomerMsg.content
    ) {
      const audioFallback = 'Oi! Não consigo processar mensagens de áudio por aqui. 😅 Pode me enviar o que queria dizer em texto?'
      try {
        const evo = await getEvolutionClient(tenantId, ENCRYPTION_KEY)
        await evo.sendText(contactNumber, audioFallback)
        await supabase.from('messages').insert({
          tenant_id: tenantId,
          conversation_id: conversationId,
          contact_id: contactId,
          sender_type: 'ai',
          content: audioFallback,
          content_type: 'text',
        })
      } catch (err) {
        console.error('[process-message] Erro ao enviar fallback de áudio:', err)
      }
      return Response.json(
        { success: true, audioFallback: true },
        { headers: { 'Access-Control-Allow-Origin': '*' } }
      )
    }

    // Monta array de mensagens para a LLM API
    const messages: LLMMessage[] = (history ?? [])
      .filter((m) => (m.sender_type === 'customer' || m.sender_type === 'ai' || m.sender_type === 'human'))
      .filter((m) => m.content || m.content_type === 'audio') // áudio sem transcrição ainda entra
      .map((m) => ({
        role: m.sender_type === 'customer' ? 'user' : 'assistant',
        content: m.content_type === 'image'
          ? `[Imagem enviada]${m.content ? `: ${m.content}` : ''}`
          : m.content_type === 'audio' && !m.content
          ? '[Áudio enviado pelo cliente]'
          : (m.content ?? ''),
      }))

    // LLM APIs exigem que as mensagens alternem user/assistant e comecem com user
    const normalizedMessages = normalizeMessageSequence(messages)

    // Extrai palavras-chave da última mensagem do cliente para validar queries da IA
    // Usado para detectar quando a IA substitui palavras do cliente por sinônimos (ex: "colchão" → "cama")
    const stopWords = new Set(['quero', 'para', 'favor', 'você', 'como', 'tenho', 'esse', 'essa', 'aqui', 'mais', 'qual', 'quer', 'com', 'por', 'uma', 'que', 'tem', 'ver', 'gostaria', 'preciso', 'pode', 'mostrar', 'produto', 'coisa', 'algo', 'isso', 'isto', 'aquilo', 'este', 'esta'])
    const customerKeywords: string[] = lastCustomerMsg?.content
      ? lastCustomerMsg.content.toLowerCase()
          .replace(/[^a-záàâãéèêíïóôõöúüçñ\s]/gi, ' ')
          .split(/\s+/)
          .filter((w: string) => w.length > 3 && !stopWords.has(w))
      : []

    // ── 4. Monta system prompt com contexto atual ──────────────────
    const now = new Intl.DateTimeFormat('pt-BR', {
      dateStyle: 'full', timeStyle: 'short', timeZone: timezone,
    }).format(new Date())

    const systemPrompt = `## Seu papel (prioridade máxima — estas regras se sobrepõem a qualquer instrução abaixo)
Você é uma VENDEDORA digital. Seu trabalho é: entender o que o cliente quer → buscar nos produtos → gerar valor e despertar interesse → fechar a venda. Nunca deixe o cliente sem resposta sobre o produto que pediu.

## Regras de comportamento (obrigatórias)
- RESPONDA O QUE FOI PERGUNTADO: se o cliente pediu colchão → mostre colchão. Se pediu preço → dê o preço. NUNCA responda uma pergunta com outra pergunta quando o cliente já forneceu informação suficiente para buscar.
- BUSCA IMEDIATA: quando o cliente mencionar qualquer produto, serviço ou categoria, chame search_products IMEDIATAMENTE. NUNCA pergunte orçamento, tamanho, modelo ou preferência ANTES de mostrar o catálogo. Primeiro mostre o que tem, depois afine se necessário.
- QUERY EXATA: ao chamar search_products, use as PALAVRAS EXATAS que o cliente disse. Se o cliente disse "colchão", busque "colchão". Se disse "sofá", busque "sofá". NUNCA substitua por sinônimos ou categorias relacionadas — "colchão" e "cama" são produtos DIFERENTES. Use no máximo 1-3 palavras extraídas literalmente da fala do cliente.
- RECOMENDE 1 produto: apresente o mais adequado ao que o cliente descreveu. Não liste todos — escolha um e recomende com convicção. Se o cliente quiser ver mais, ele pede.
- APRESENTAÇÃO: quando o produto tiver "[tem imagem]", chame send_product_image — a foto sai SOMENTE com nome e descrição (sem preço). Seu texto deve destacar 1-2 BENEFÍCIOS ou diferenciais do produto (material, qualidade, design, conforto, exclusividade) em 1-2 frases curtas. NÃO mencione preço no texto de apresentação. Ex: "Olha essa opção — acabamento premium e design exclusivo 👇" ou "Esse aqui combina muito com o que você descreveu 👇". Se o produto NÃO tem imagem, inclua nome e benefícios no texto — ainda sem preço.
- PREÇO — REGRA FUNDAMENTAL: NUNCA inicie a apresentação de um produto com o preço. Primeiro apresente o produto com seus benefícios e gere interesse. Mencione o preço APENAS quando: (1) o cliente perguntar diretamente ("quanto custa?", "qual o valor?", "tem algum desconto?") OU (2) o cliente demonstrar interesse claro de compra ("gostei", "quero esse", "como faço pra comprar?", "tem parcelamento?"). Se o cliente ainda não sinalizou interesse, foque em gerar desejo.
- FOTOS — REGRA ABSOLUTA: se o produto tem "[tem imagem — use send_product_image com id: ...]" nos resultados da busca, você DEVE chamar a ferramenta send_product_image — nunca escreva sobre a imagem, CHAME A FERRAMENTA. Se o produto NÃO tem esse indicador, significa que não há foto disponível — NUNCA escreva "vou enviar a imagem", "vou te mandar a foto", "vou compartilhar" ou qualquer variação. Escrever isso sem chamar a ferramenta não envia NADA — é uma promessa falsa que frustra o cliente.
- 1 PRODUTO SOMENTE — INVIOLÁVEL: mesmo que search_products retorne 2 ou 3 resultados, você deve apresentar APENAS 1 — o mais relevante. Nunca descreva ou mencione mais de 1 produto em uma mesma mensagem. Isso não é negociável.
- NUNCA DIGA "não encontrei" / "não consigo encontrar" / "não temos esse produto": search_products SEMPRE retorna produtos do catálogo real. Se há um produto no resultado, ele EXISTE e está disponível — apresente-o diretamente. NUNCA explique que buscou por outra palavra ou que o produto não é exato.
- NUNCA REPITA PERGUNTAS: se o cliente já disse o tamanho, preferência ou nome, use essa informação. Nunca peça de novo.
- MENSAGENS CURTAS: máximo 2-3 frases por mensagem. WhatsApp não é e-mail.
- LINKS: nunca escreva URLs. Use send_product_image.
- ÁUDIO: se o histórico tiver "[Áudio enviado pelo cliente]" em mensagens ANTERIORES, é um áudio antigo sem transcrição — ignore e responda baseado no contexto geral da conversa.

## Contexto do negócio e personalidade
${agent.system_prompt}

## Contexto atual
- Data/hora: ${now}
- Horário de atendimento: ${formatBusinessHours(businessHours)}
- Status: DENTRO do horário de atendimento`

    // Filtra tools de acordo com permissões do agente
    const allowedTools = AI_TOOLS.filter((tool) => {
      if (tool.name === 'search_products' && !agent.can_search_products) return false
      if (tool.name === 'send_product_image' && !agent.can_send_images) return false
      if ((tool.name === 'check_availability' || tool.name === 'book_appointment' || tool.name === 'cancel_appointment') && !agent.can_book_appointments) return false
      if (tool.name === 'escalate_to_human' && !agent.can_escalate) return false
      if (tool.name === 'schedule_follow_up' && !agentFollowUpEnabled) return false
      return true
    })

    // ── 5. Mostra "digitando..." antes de chamar a IA ─────────────
    // Fire-and-forget: sendPresence pode levar 6-7s — não bloqueia o processamento
    getEvolutionClient(tenantId, ENCRYPTION_KEY)
      .then(evo => evo.sendPresence(contactNumber, 'composing', 5000))
      .catch(() => { /* não crítico */ })

    // Detecta se o cliente mandou áudio neste turno (para responder em áudio)
    const clientSentAudio = lastCustomerMsg?.content_type === 'audio'

    // ── 6. Loop de function calling ────────────────────────────────
    const ctx: ToolContext = {
      supabase,
      tenantId,
      conversationId,
      contactId,
      contactNumber,
      instanceName,
      agentId: agent.id,
      agentFollowUpDelayHours,
      agentFollowUpMaxAttempts,
    }
    const loopMessages = [...normalizedMessages]
    const allToolCalls: Array<{ name: string; input: Record<string, unknown>; result: string }> = []
    let finalText = ''
    let wasEscalated = false
    let imageSent = false // controla se send_product_image já enviou imagem neste turno
    let deferredImage: DeferredImage | null = null // imagem enviada após a resposta principal
    // Produtos com imagem retornados na última search_products (para fallback de auto-imagem)
    let lastSearchProductsWithImages: Array<{ name: string; id: string }> = []

    for (let loop = 0; loop < MAX_TOOL_LOOPS; loop++) {
      const response = await callLLM({
        model: agent.model ?? 'claude-sonnet-4-20250514',
        system: systemPrompt,
        messages: loopMessages,
        tools: allowedTools as LLMTool[],
        maxTokens: agent.max_tokens ?? 1024,
        temperature: agent.temperature ?? 0.7,
        anthropicApiKey: tenantAnthropicKey,
        openaiApiKey: tenantOpenaiKey,
        geminiApiKey: tenantGeminiKey,
      })

      if (response.stopReason !== 'tool_use') {
        // Captura o texto final da IA.
        // Se imageSent=true e o texto for muito curto (ex: "Aqui está!" ou vazio),
        // suprime para não mandar mensagem vazia ou redundante.
        // Caso contrário, sempre envia — ex: pergunta de acompanhamento após a imagem.
        const trimmed = response.text?.trim() ?? ''
        if (trimmed.length > 15 || !imageSent) {
          finalText = trimmed
        }
        break
      }

      // Processa cada tool_use desta rodada
      const toolResults: LLMContentBlock[] = []
      let shouldBreak = false

      for (const tu of response.toolUses) {
        let result: string
        let escalated = false

        if (tu.name === 'send_product_image') {
          // Adiar envio da imagem para após a resposta principal (fluxo humanizado)
          const productId = String(tu.input.product_id ?? '')
          console.log(`[send_product_image] IA chamou tool — product_id="${productId}"`)
          const imageData = await resolveProductImageData(supabase, tenantId, productId)
          if (imageData) {
            deferredImage = imageData
            imageSent = true
            result = 'ok'
            console.log(`[send_product_image] Imagem encontrada: "${imageData.productName}" — deferredImage setado`)

            // Captura o texto que a IA gerou JUNTO ao tool call (descrição do produto).
            // Esse texto vira o áudio — evita que a IA gere uma nova resposta dizendo "vou enviar a imagem".
            const responseText = response.text?.trim() ?? ''
            console.log(`[send_product_image] responseText junto ao tool call (${responseText.length} chars): "${responseText.slice(0, 80)}"`)
            if (responseText.length > 5) {
              finalText = responseText
              shouldBreak = true // já temos texto + imagem diferida — não precisa de mais iterações
            }
          } else {
            console.log(`[send_product_image] resolveProductImageData retornou null para product_id="${productId}" — produto sem imagem ou não encontrado`)
            result = 'Produto não encontrado ou sem imagem cadastrada.'
          }
        } else if (tu.name === 'search_products') {
          // Valida query da IA: se ela introduziu palavras que o cliente NÃO usou, corrige.
          // Ex: cliente disse "colchão de casal" mas IA chamou search_products(query="cama de casal")
          // O check antigo falhava porque "casal" dava overlap — agora verificamos se a IA
          // ADICIONOU palavras que não estão na mensagem original do cliente.
          let searchInput = tu.input
          let queryCorrected = false
          let correctedQuery = ''
          const customerMsgLower = (lastCustomerMsg?.content ?? '').toLowerCase()
          if (customerKeywords.length > 0 && customerMsgLower) {
            const aiQuery = String(tu.input.query ?? '').toLowerCase()
            const aiQueryWords = aiQuery.split(/\s+/).filter((w: string) => w.length > 2)
            // Detecta se a IA introduziu palavras que NÃO aparecem na mensagem do cliente
            const aiIntroducedNewWords = aiQueryWords.some((w: string) => !customerMsgLower.includes(w))
            if (aiIntroducedNewWords) {
              correctedQuery = customerKeywords.slice(0, 3).join(' ')
              searchInput = { ...tu.input, query: correctedQuery }
              queryCorrected = true
              console.log(`[search_products] Query corrigida: "${aiQuery}" → "${correctedQuery}" (IA introduziu palavras que o cliente não usou)`)
            }
          }
          result = await toolSearchProducts(ctx.supabase, ctx.tenantId, searchInput)
          // Quando a query foi corrigida, informa a IA no tool_result para que ela use
          // a palavra correta na resposta (evita "não encontrei cama" quando buscou colchão)
          if (queryCorrected) {
            result = `[SISTEMA: Apresente os produtos abaixo normalmente como resultados disponíveis. NÃO mencione que houve troca de palavras. NÃO escreva "não encontrei" — há produtos no catálogo.]\n\n` + result
          }
          // Extrai produtos com imagem para fallback de auto-imagem (caso IA não chame send_product_image)
          const imgMatches = [...result.matchAll(/📦 \*([^*]+)\*[\s\S]*?use send_product_image com id: ([a-f0-9-]{36})/g)]
          lastSearchProductsWithImages = imgMatches.map(([, name, id]) => ({ name: name.trim(), id: id.trim() }))
          console.log(`[search_products] ${lastSearchProductsWithImages.length} produto(s) com imagem detectado(s):`, lastSearchProductsWithImages.map(p => p.name).join(', '))
        } else {
          const toolResult = await executeTool(ctx, tu.name, tu.input)
          result = toolResult.result
          escalated = toolResult.escalated
        }

        allToolCalls.push({ name: tu.name, input: tu.input, result })
        toolResults.push({ type: 'tool_result', tool_use_id: tu.id, content: result })

        if (escalated) {
          wasEscalated = true
          finalText = result // mensagem de escalação já é o texto final
        }
      }

      if (wasEscalated || shouldBreak) break

      // Adiciona turno assistant + tool_results ao histórico do loop
      loopMessages.push({ role: 'assistant', content: response.content })
      loopMessages.push({ role: 'user', content: toolResults })
    }

    // Auto-imagem: fallback para quando o LLM não chamou send_product_image.
    // Detecta qual produto da busca foi mencionado no texto final e envia a imagem automaticamente.
    if (!deferredImage && finalText && lastSearchProductsWithImages.length > 0) {
      const finalTextLower = finalText.toLowerCase()
      let matched = false

      for (const { name, id } of lastSearchProductsWithImages) {
        // Considera match se 2+ palavras significativas (>3 chars) do nome estão no texto final
        const nameParts = name.split(/\s+/).filter((w: string) => w.length > 3)
        const matchCount = nameParts.filter((p: string) => finalTextLower.includes(p.toLowerCase())).length
        if (matchCount >= 2) {
          const imageData = await resolveProductImageData(supabase, tenantId, id)
          if (imageData) {
            deferredImage = imageData
            matched = true
            console.log(`[auto-image] Fallback por nome: "${name}" → imagem de "${imageData.productName}" será enviada automaticamente`)
            break
          }
        }
      }

      // Se 1 único produto com imagem na busca: envia sem precisar de match por nome
      if (!matched && lastSearchProductsWithImages.length === 1) {
        const { name, id } = lastSearchProductsWithImages[0]
        const imageData = await resolveProductImageData(supabase, tenantId, id)
        if (imageData) {
          deferredImage = imageData
          console.log(`[auto-image] Fallback único produto: imagem de "${name}" será enviada automaticamente`)
        }
      }
    }

    // Remove promessas falsas de imagem do texto final (a imagem já será enviada via deferredImage)
    if (deferredImage && finalText) {
      // Remove qualquer linha/frase que contenha "vou enviar/mandar/compartilhar" + "imagem/foto"
      const cleaned = finalText
        .replace(/[^\n]*[Vv]ou (te )?(enviar|mandar|compartilhar)[^\n]*(imagem|foto)[^\n]*(\n|$)/gi, '')
        .trim()
      if (cleaned.length > 10) finalText = cleaned
    }

    // ── 6. Salva e envia resposta da IA ───────────────────────────
    if (finalText) {
      // Responde em áudio SOMENTE quando o cliente mandou áudio (espelha o cliente)
      // audio_response_enabled = true apenas habilita a feature; não força áudio em texto
      const useAudio =
        !wasEscalated &&
        clientSentAudio &&
        agent.audio_response_enabled &&
        agent.voice_id &&
        tenantElevenlabsKey

      let sentContentType: 'text' | 'audio' = 'text'

      if (useAudio) {
        // ── TTS: gera áudio com ElevenLabs e envia como mensagem de voz ──
        try {
          const audioBytes = await textToSpeech(finalText, agent.voice_id, tenantElevenlabsKey)
          const audioBase64 = audioToBase64(audioBytes)
          const evo = await getEvolutionClient(tenantId, ENCRYPTION_KEY)
          // Mostra indicador de gravação (fire-and-forget — não bloqueia)
          evo.sendPresence(contactNumber, 'recording', 2000).catch(() => { /* não crítico */ })
          await evo.sendAudio(contactNumber, audioBase64)
          sentContentType = 'audio'
        } catch (audioErr) {
          console.error('[process-message] Erro ao gerar/enviar áudio TTS, fallback para texto:', audioErr)
          // Fallback: envia como texto se o TTS falhar
          try {
            const evo = await getEvolutionClient(tenantId, ENCRYPTION_KEY)
            await evo.sendText(contactNumber, finalText)
          } catch (sendErr) {
            console.error('[process-message] Erro ao enviar texto (fallback):', sendErr)
          }
        }
      } else {
        // ── Texto normal: divide em partes humanizadas com indicador de digitação ──
        try {
          const evo = await getEvolutionClient(tenantId, ENCRYPTION_KEY)
          const parts = splitMessage(finalText)
          for (const part of parts) {
            const composingMs = Math.min(3000, Math.max(800, part.length * 12))
            await evo.sendPresence(contactNumber, 'composing', composingMs)
            await new Promise<void>(r => setTimeout(r, composingMs + 200))
            await evo.sendText(contactNumber, part)
          }
        } catch (sendErr) {
          console.error('[process-message] Erro ao enviar via Evolution:', sendErr)
        }
      }

      // Salva mensagem da IA no banco (sempre, independente do tipo de envio)
      await supabase.from('messages').insert({
        tenant_id: tenantId,
        conversation_id: conversationId,
        contact_id: contactId,
        sender_type: 'ai',
        content: finalText,
        content_type: sentContentType,
        ai_tool_calls: allToolCalls.length > 0 ? allToolCalls : null,
      })
    }

    // ── Envia imagem diferida após a resposta principal (fluxo humanizado) ─────
    // A imagem chega ~1.5s depois do áudio/texto, como um humano faria naturalmente.
    if (deferredImage) {
      try {
        await new Promise<void>(r => setTimeout(r, 4000))
        const evo = await getEvolutionClient(tenantId, ENCRYPTION_KEY)
        await evo.sendMedia(contactNumber, deferredImage.imageUrl, deferredImage.caption)
        await supabase.from('messages').insert({
          tenant_id: tenantId,
          conversation_id: conversationId,
          contact_id: contactId,
          sender_type: 'ai',
          content: deferredImage.caption,
          content_type: 'image',
          media_url: deferredImage.imageUrl,
        })
      } catch (err) {
        console.error('[process-message] Erro ao enviar imagem diferida:', err)
      }
    }

    // ── Auto follow-up: agenda automaticamente se cliente não responder ────────
    // Só cria quando a IA não chamou schedule_follow_up explicitamente neste turno
    const aiScheduledFollowUp = allToolCalls.some(c => c.name === 'schedule_follow_up')
    if (agentFollowUpEnabled && !wasEscalated && finalText && !aiScheduledFollowUp) {
      try {
        const { count } = await supabase
          .from('follow_ups')
          .select('id', { count: 'exact', head: true })
          .eq('conversation_id', conversationId)
          .not('status', 'in', '(cancelled,max_reached)')

        const attemptNumber = (count ?? 0) + 1
        if (attemptNumber <= agentFollowUpMaxAttempts) {
          const scheduledAt = new Date(Date.now() + agentFollowUpDelayHours * 60 * 60 * 1000).toISOString()

          const { data: existingPending } = await supabase
            .from('follow_ups')
            .select('id')
            .eq('conversation_id', conversationId)
            .eq('status', 'pending')
            .limit(1)
            .single()

          if (existingPending) {
            // Reseta o timer: cliente ainda está ativo na conversa
            await supabase
              .from('follow_ups')
              .update({ scheduled_at: scheduledAt })
              .eq('id', existingPending.id)
          } else {
            await supabase.from('follow_ups').insert({
              tenant_id: tenantId,
              contact_id: contactId,
              conversation_id: conversationId,
              ai_agent_id: agent.id,
              scheduled_at: scheduledAt,
              attempt_number: attemptNumber,
              status: 'pending',
              context: 'Follow-up automático — sem resposta do cliente',
            })
          }
        }
      } catch (fuErr) {
        console.error('[process-message] Erro ao criar auto follow-up:', fuErr)
      }
    }

    return Response.json(
      { success: true, escalated: wasEscalated },
      { headers: { 'Access-Control-Allow-Origin': '*' } }
    )
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Erro interno'
    console.error('[process-message]', message)
    return Response.json(
      { error: message },
      { status: 500, headers: { 'Access-Control-Allow-Origin': '*' } }
    )
  }
})

// ── Divide resposta em partes menores para envio humanizado no WhatsApp ─────
// Máximo de 300 caracteres por parte, máximo 4 partes.
// Divide por parágrafos (\n\n) e, se ainda longo, por sentenças.
function splitMessage(text: string, maxLength = 300): string[] {
  const paragraphs = text.split(/\n\n+/).map(p => p.trim()).filter(Boolean)
  const parts: string[] = []

  for (const paragraph of paragraphs) {
    if (paragraph.length <= maxLength) {
      parts.push(paragraph)
    } else {
      // Divide por sentença quando o parágrafo é longo
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
  // Garante máximo de 4 partes (mescla excesso na última)
  if (parts.length > 4) {
    return [...parts.slice(0, 3), parts.slice(3).join('\n')]
  }
  return parts
}

// ── Normaliza sequência de mensagens para LLM APIs ───────────────────────
// As APIs exigem que mensagens comecem com 'user' e alternem user/assistant.
// Mensagens consecutivas do mesmo role são mescladas.
function normalizeMessageSequence(messages: LLMMessage[]): LLMMessage[] {
  if (messages.length === 0) return []

  const merged: LLMMessage[] = []
  for (const msg of messages) {
    const last = merged[merged.length - 1]
    if (last && last.role === msg.role) {
      // Mescla: ambos são string
      last.content = `${last.content}\n${msg.content}`
    } else {
      merged.push({ ...msg })
    }
  }

  // Garante que começa com 'user'
  if (merged[0]?.role === 'assistant') {
    merged.shift()
  }

  return merged
}
