// Executores das 8 tools de function calling do agente SDR.
// Porta de supabase/functions/process-message/index.ts (seção de tools),
// trocando o query builder do supabase-js por Drizzle/SQL cru.

import { and, eq, lte, ne } from 'drizzle-orm'
import { db, pool } from '../db/index.js'
import { appointments, conversations, kanbanStages, products } from '../db/schema.js'
import { getEvolutionClient } from '../shared/evolution-client.js'
import { assignNextVendedor, countRegisteredVendors } from './lead-routing.js'

interface ProductRow {
  id: string
  name: string
  short_description: string | null
  description: string | null
  price_display: string | null
  price: string | null
  category: string | null
  images: unknown
}

async function queryProducts(whereSql: string, params: unknown[], orderLimitSql: string): Promise<ProductRow[]> {
  const res = await pool.query<ProductRow>(
    `select id, name, short_description, description, price_display, price, category, images
     from products
     where tenant_id = $1 and is_available = true ${whereSql}
     ${orderLimitSql}`,
    params
  )
  return res.rows
}

export async function toolSearchProducts(tenantId: string, input: Record<string, unknown>): Promise<string> {
  const query = input.query ? String(input.query).trim() : ''
  const categoryParam = input.category ? String(input.category) : null
  const maxResults = Number(input.max_results ?? 8)
  const priceMax = input.price_max ? Number(input.price_max) : null

  const priceSql = priceMax ? 'and price <= $2' : ''

  let data: ProductRow[] = []

  // Categorias disponíveis no catálogo, pra detectar match dinâmico
  const catRes = await pool.query<{ category: string }>(
    `select distinct category from products where tenant_id = $1 and is_available = true and category is not null`,
    [tenantId]
  )
  const uniqueCategories = catRes.rows.map((r) => r.category)
  const queryLower = query.toLowerCase()
  const matchedCategory = categoryParam ?? uniqueCategories.find((cat) => queryLower.includes(cat.toLowerCase())) ?? null

  // 1ª tentativa: categoria (ilike) + limite
  if (matchedCategory) {
    const params: unknown[] = priceMax ? [tenantId, priceMax, matchedCategory] : [tenantId, matchedCategory]
    const catIdx = priceMax ? 3 : 2
    data = await queryProducts(`${priceSql} and category ilike $${catIdx}`, params, `limit ${maxResults}`)
  }

  // 2ª tentativa: full-text search (stemming português)
  if (data.length === 0 && query) {
    const params: unknown[] = priceMax ? [tenantId, priceMax, query] : [tenantId, query]
    const qIdx = priceMax ? 3 : 2
    data = await queryProducts(
      `${priceSql} and search_vector @@ websearch_to_tsquery('portuguese', $${qIdx})`,
      params,
      `limit ${maxResults}`
    )
  }

  // 3ª tentativa: ilike no nome/descrição
  if (data.length === 0 && query) {
    const safeQuery = query.replace(/[,()]/g, ' ').trim()
    const params: unknown[] = priceMax ? [tenantId, priceMax, `%${safeQuery}%`] : [tenantId, `%${safeQuery}%`]
    const qIdx = priceMax ? 3 : 2
    data = await queryProducts(`${priceSql} and (name ilike $${qIdx} or description ilike $${qIdx})`, params, `limit ${maxResults}`)
  }

  // 4ª tentativa: lista tudo que está disponível
  if (data.length === 0) {
    const params: unknown[] = priceMax ? [tenantId, priceMax] : [tenantId]
    data = await queryProducts(priceSql, params, `order by is_featured desc, name asc limit ${maxResults}`)
  }

  if (data.length === 0) return 'Nenhum produto cadastrado no momento.'

  return data
    .map((p) => {
      const images = Array.isArray(p.images) ? p.images : []
      const hasImage = images.length > 0
      const desc = p.short_description || p.description
      return [
        `📦 *${p.name}*`,
        p.price_display ? `💰 ${p.price_display}` : p.price ? `💰 R$ ${Number(p.price).toFixed(2)}` : '',
        desc ? `📝 ${desc}` : '',
        p.category ? `🏷️ ${p.category}` : '',
        hasImage ? `🖼️ [tem imagem — use send_product_image com id: ${p.id}]` : '',
        `ID: ${p.id}`,
      ]
        .filter(Boolean)
        .join('\n')
    })
    .join('\n\n')
}

export async function toolCheckAvailability(tenantId: string, input: Record<string, unknown>): Promise<string> {
  const tenantRows = await pool.query<{ appointment_duration_minutes: number; business_hours: Record<string, { enabled: boolean; start: string; end: string }>; timezone: string }>(
    `select appointment_duration_minutes, business_hours, timezone from tenants where id = $1`,
    [tenantId]
  )
  const tenant = tenantRows.rows[0]
  if (!tenant) return 'Erro ao buscar configurações de agenda.'

  const duration = tenant.appointment_duration_minutes ?? 30
  const bh = tenant.business_hours
  const timezone = tenant.timezone ?? 'America/Sao_Paulo'

  const targetDate = input.date ? String(input.date) : null
  const period = input.period ? String(input.period) : null

  const dates: string[] = []
  if (targetDate) {
    dates.push(targetDate)
  } else {
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

    const [startH, startM] = dayHours.start.split(':').map(Number)
    const [endH, endM] = dayHours.end.split(':').map(Number)
    const startMinutes = startH * 60 + startM
    const endMinutes = endH * 60 + endM

    const periodFilters: Record<string, [number, number]> = {
      morning: [0, 720],
      afternoon: [720, 1080],
      evening: [1080, 1440],
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

    const booked = await db
      .select({ startTime: appointments.startTime })
      .from(appointments)
      .where(and(eq(appointments.tenantId, tenantId), eq(appointments.date, dateStr), ne(appointments.status, 'cancelled')))

    const bookedTimes = new Set(booked.map((a) => a.startTime.slice(0, 5)))
    const freeSlots = slots.filter((s) => !bookedTimes.has(s))

    if (freeSlots.length > 0) {
      const dateLabel = new Intl.DateTimeFormat('pt-BR', { weekday: 'long', day: 'numeric', month: 'long', timeZone: timezone }).format(date)
      available.push(`📅 *${dateLabel}*: ${freeSlots.slice(0, 6).join(', ')}`)
    }
    if (available.length >= 3) break
  }

  if (available.length === 0) return 'Não há horários disponíveis nos próximos dias.'
  return `Horários disponíveis:\n\n${available.join('\n')}`
}

export async function toolBookAppointment(
  tenantId: string,
  conversationId: string,
  contactId: string,
  input: Record<string, unknown>
): Promise<string> {
  const date = String(input.date ?? '')
  const startTime = String(input.start_time ?? '')
  if (!date || !startTime) return 'Data e horário são obrigatórios para agendar.'

  const tenantRows = await pool.query<{ appointment_duration_minutes: number }>(
    `select appointment_duration_minutes from tenants where id = $1`,
    [tenantId]
  )
  const duration = tenantRows.rows[0]?.appointment_duration_minutes ?? 30
  const [h, m] = startTime.split(':').map(Number)
  const endMinutes = h * 60 + m + duration
  const endTime = `${String(Math.floor(endMinutes / 60)).padStart(2, '0')}:${String(endMinutes % 60).padStart(2, '0')}`

  try {
    const created = await db
      .insert(appointments)
      .values({
        tenantId,
        contactId,
        conversationId,
        date,
        startTime,
        endTime,
        status: 'confirmed',
        title: input.contact_name ? `Agendamento — ${input.contact_name}` : 'Agendamento',
        notes: input.notes ? String(input.notes) : null,
        reminder24hSent: false,
        reminder1hSent: false,
      })
      .returning({ id: appointments.id })

    const agStage = await db
      .select({ id: kanbanStages.id })
      .from(kanbanStages)
      .where(and(eq(kanbanStages.tenantId, tenantId), eq(kanbanStages.slug, 'agendado')))
      .limit(1)
    if (agStage[0]) {
      await db.update(conversations).set({ kanbanStageId: agStage[0].id }).where(eq(conversations.id, conversationId))
    }

    return `✅ Agendamento confirmado!\n📅 Data: ${date}\n🕐 Horário: ${startTime}–${endTime}\nID: ${created[0].id}`
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    if (message.includes('exclusion') || message.includes('conflito')) {
      return 'Esse horário já está ocupado. Por favor, escolha outro horário.'
    }
    return `Erro ao criar agendamento: ${message}`
  }
}

export async function toolCancelAppointment(tenantId: string, input: Record<string, unknown>): Promise<string> {
  const appointmentId = String(input.appointment_id ?? '')
  if (!appointmentId) return 'ID do agendamento é obrigatório.'

  await db
    .update(appointments)
    .set({ status: 'cancelled' })
    .where(and(eq(appointments.id, appointmentId), eq(appointments.tenantId, tenantId)))

  return '✅ Agendamento cancelado com sucesso.'
}

export async function toolEscalateToHuman(
  tenantId: string,
  conversationId: string,
  input: Record<string, unknown>
): Promise<{ result: string; escalated: boolean }> {
  const reason = String(input.reason ?? '')
  const summary = String(input.summary ?? '')
  const priority = String(input.priority ?? 'normal')

  // 1) Tenta round-robin entre vendedores online. O trigger de banco
  // sync_conversation_status_to_kanban já move o card pra 'aguardando_humano'
  // sozinho quando o status muda — não setar kanban_stage_id aqui.
  const vendor = await assignNextVendedor(tenantId)
  if (vendor) {
    await db
      .update(conversations)
      .set({ status: 'waiting_human', assignedTo: vendor.id, autonomousMode: false, aiSummary: summary, priority })
      .where(eq(conversations.id, conversationId))

    const firstName = vendor.fullName.split(' ')[0]
    return {
      result: `Transferindo para ${firstName}. Motivo: ${reason}. Em breve ${firstName} vai te atender! 🙏`,
      escalated: true,
    }
  }

  // 2) Ninguém online agora, mas a empresa já tem equipe cadastrada — a IA
  // assume o fechamento sozinha em vez de deixar a conversa órfã.
  const totalVendors = await countRegisteredVendors(tenantId)
  if (totalVendors >= 2) {
    await db
      .update(conversations)
      .set({ autonomousMode: true, aiSummary: summary, priority })
      .where(eq(conversations.id, conversationId))

    return {
      result: `[SISTEMA: Nenhum vendedor está online agora. Assuma o fechamento — negocie, quebre objeções e conduza até a decisão de compra usando só o catálogo real. Não diga que vai chamar alguém ou transferir. Continue a conversa normalmente.]`,
      escalated: false,
    }
  }

  // 3) Fallback: time pequeno demais (menos de 2 vendedores) — comportamento
  // antigo, escala sem dono.
  await db
    .update(conversations)
    .set({ status: 'waiting_human', aiSummary: summary, priority })
    .where(eq(conversations.id, conversationId))

  return {
    result: `Transferindo para um atendente humano. Motivo: ${reason}. Em breve alguém da equipe irá te atender! 🙏`,
    escalated: true,
  }
}

export interface DeferredImage {
  productName: string
  imageUrl: string
  caption: string
}

export async function resolveProductImageData(tenantId: string, productId: string): Promise<DeferredImage | null> {
  if (!productId) return null

  const rows = await db
    .select({
      name: products.name,
      shortDescription: products.shortDescription,
      description: products.description,
      images: products.images,
    })
    .from(products)
    .where(and(eq(products.id, productId), eq(products.tenantId, tenantId)))
    .limit(1)

  const product = rows[0]
  if (!product) return null

  const images = Array.isArray(product.images) ? product.images : []
  if (images.length === 0) return null

  const imageUrl = (images[0] as Record<string, unknown>)?.url ?? images[0]
  if (!imageUrl || typeof imageUrl !== 'string') return null

  const desc = product.shortDescription || product.description || ''
  const caption = [`📦 *${product.name}*`, desc ? desc : ''].filter(Boolean).join('\n')

  return { productName: product.name, imageUrl, caption }
}

export async function toolSendProductImage(
  tenantId: string,
  conversationId: string,
  contactId: string,
  contactNumber: string,
  encryptionKey: string | null,
  input: Record<string, unknown>
): Promise<string> {
  const productId = String(input.product_id ?? '')
  const imageData = await resolveProductImageData(tenantId, productId)
  if (!imageData) return 'Produto não encontrado ou sem imagem cadastrada.'

  try {
    const evo = await getEvolutionClient(tenantId, encryptionKey)
    await evo.sendMedia(contactNumber, imageData.imageUrl, imageData.caption)
  } catch (err) {
    console.error('[toolSendProductImage] Erro ao enviar imagem:', err)
    return `Erro ao enviar imagem de "${imageData.productName}".`
  }

  await pool.query(
    `insert into messages (tenant_id, conversation_id, contact_id, sender_type, content, content_type, media_url)
     values ($1, $2, $3, 'ai', $4, 'image', $5)`,
    [tenantId, conversationId, contactId, imageData.caption, imageData.imageUrl]
  )

  return `Imagem de "${imageData.productName}" enviada.`
}

export async function toolScheduleFollowUp(
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

  const existingRes = await pool.query(
    `select id from follow_ups where conversation_id = $1 and status = 'pending' limit 1`,
    [conversationId]
  )
  if (existingRes.rows.length > 0) return 'Follow-up já agendado para esta conversa.'

  const countRes = await pool.query<{ count: string }>(
    `select count(*) from follow_ups where conversation_id = $1 and status != 'cancelled'`,
    [conversationId]
  )
  const attemptNumber = Number(countRes.rows[0]?.count ?? 0) + 1
  if (attemptNumber > agentFollowUpMaxAttempts) {
    return `Número máximo de follow-ups (${agentFollowUpMaxAttempts}) já atingido para esta conversa.`
  }

  const scheduledAt = new Date(Date.now() + delayHours * 60 * 60 * 1000)

  await pool.query(
    `insert into follow_ups (tenant_id, contact_id, conversation_id, ai_agent_id, scheduled_at, attempt_number, status, context)
     values ($1, $2, $3, $4, $5, $6, 'pending', $7)`,
    [tenantId, contactId, conversationId, agentId, scheduledAt.toISOString(), attemptNumber, context]
  )

  const hoursLabel = delayHours === 1 ? '1 hora' : `${delayHours} horas`
  return `✅ Follow-up agendado! Entrarei em contato novamente em ${hoursLabel} caso não haja resposta.`
}

function formatBusinessHours(businessHours: Record<string, { enabled: boolean; start: string; end: string } | undefined>): string {
  const dayNames: Record<string, string> = { mon: 'Seg', tue: 'Ter', wed: 'Qua', thu: 'Qui', fri: 'Sex', sat: 'Sáb', sun: 'Dom' }
  return (
    Object.entries(businessHours)
      .filter((entry): entry is [string, { enabled: boolean; start: string; end: string }] => {
        const h = entry[1]
        return !!h && h.enabled !== false && !!h.start && !!h.end
      })
      .map(([day, h]) => `${dayNames[day]}: ${h.start}–${h.end}`)
      .join(' | ') || 'Não configurado'
  )
}

export { formatBusinessHours }

export async function toolGetBusinessInfo(tenantId: string): Promise<string> {
  const rows = await pool.query<{
    name: string
    business_description: string | null
    address: string | null
    city: string | null
    state: string | null
    website: string | null
    business_hours: Record<string, { enabled: boolean; start: string; end: string }>
    owner_phone: string | null
  }>(
    `select name, business_description, address, city, state, website, business_hours, owner_phone from tenants where id = $1`,
    [tenantId]
  )
  const tenant = rows.rows[0]
  if (!tenant) return 'Informações do negócio não encontradas.'

  const hoursText = formatBusinessHours(tenant.business_hours)
  const address = [tenant.address, tenant.city, tenant.state].filter(Boolean).join(', ')

  return [
    `🏢 *${tenant.name}*`,
    tenant.business_description ? `📋 ${tenant.business_description}` : '',
    hoursText ? `🕐 Horários: ${hoursText}` : '',
    address ? `📍 Endereço: ${address}` : '',
    tenant.website ? `🌐 Site: ${tenant.website}` : '',
    tenant.owner_phone ? `📞 Contato: ${tenant.owner_phone}` : '',
  ]
    .filter(Boolean)
    .join('\n')
}

export interface ToolContext {
  tenantId: string
  conversationId: string
  contactId: string
  contactNumber: string
  agentId: string
  agentFollowUpDelayHours: number
  agentFollowUpMaxAttempts: number
  encryptionKey: string | null
}

export async function executeTool(
  ctx: ToolContext,
  toolName: string,
  input: Record<string, unknown>
): Promise<{ result: string; escalated: boolean }> {
  let result: string
  let escalated = false

  switch (toolName) {
    case 'search_products':
      result = await toolSearchProducts(ctx.tenantId, input)
      break
    case 'check_availability':
      result = await toolCheckAvailability(ctx.tenantId, input)
      break
    case 'book_appointment':
      result = await toolBookAppointment(ctx.tenantId, ctx.conversationId, ctx.contactId, input)
      break
    case 'cancel_appointment':
      result = await toolCancelAppointment(ctx.tenantId, input)
      break
    case 'escalate_to_human': {
      const escalation = await toolEscalateToHuman(ctx.tenantId, ctx.conversationId, input)
      result = escalation.result
      escalated = escalation.escalated
      break
    }
    case 'send_product_image':
      result = await toolSendProductImage(ctx.tenantId, ctx.conversationId, ctx.contactId, ctx.contactNumber, ctx.encryptionKey, input)
      break
    case 'get_business_info':
      result = await toolGetBusinessInfo(ctx.tenantId)
      break
    case 'schedule_follow_up':
      result = await toolScheduleFollowUp(
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

// Reaproveitado no loop principal (process-message.ts) para o fallback de
// query corrigida e a extração de produtos com imagem.
export const AI_TOOLS_PRODUCT_IMAGE_REGEX = /📦 \*([^*]+)\*[\s\S]*?use send_product_image com id: ([a-f0-9-]{36})/g
