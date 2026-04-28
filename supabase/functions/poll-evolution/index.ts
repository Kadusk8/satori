/**
 * poll-evolution — busca mensagens novas da Evolution API diretamente
 * e processa as que ainda não foram salvas no banco.
 *
 * Executa via pg_cron a cada minuto OU pode ser chamado manualmente.
 * Serve como fallback quando os webhooks da Evolution não chegam.
 */

import { createAdminClient } from '../_shared/supabase-admin.ts'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? ''
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''

// Quantas mensagens buscar por tenant por execução
const FETCH_LIMIT = 50

interface EvolutionMessage {
  id: string  // ID interno do Evolution
  key: {
    id: string         // ID da mensagem no WhatsApp
    fromMe: boolean
    remoteJid: string
    remoteJidAlt?: string
  }
  message?: {
    conversation?: string
    extendedTextMessage?: { text: string }
    imageMessage?: { caption?: string; url?: string }
    audioMessage?: { url?: string }
    documentMessage?: { title?: string; url?: string }
  }
  messageType: string
  messageTimestamp: number
  pushName?: string
}

function extractNumber(key: { remoteJid: string; remoteJidAlt?: string }): string {
  const jid = (key.remoteJid.endsWith('@lid') && key.remoteJidAlt)
    ? key.remoteJidAlt
    : key.remoteJid
  return jid.replace(/@.*$/, '').replace(/:\d+$/, '')
}

function parseMessageContent(msg: EvolutionMessage): {
  text: string | null
  contentType: 'text' | 'image' | 'audio' | 'document'
  mediaUrl: string | null
} {
  const m = msg.message ?? {}
  if (m.conversation) return { text: m.conversation, contentType: 'text', mediaUrl: null }
  if (m.extendedTextMessage?.text) return { text: m.extendedTextMessage.text, contentType: 'text', mediaUrl: null }
  if (m.imageMessage) return { text: m.imageMessage.caption ?? null, contentType: 'image', mediaUrl: m.imageMessage.url ?? null }
  if (m.audioMessage) return { text: null, contentType: 'audio', mediaUrl: m.audioMessage.url ?? null }
  if (m.documentMessage) return { text: m.documentMessage.title ?? null, contentType: 'document', mediaUrl: m.documentMessage.url ?? null }
  return { text: null, contentType: 'text', mediaUrl: null }
}

async function processTenant(
  supabase: ReturnType<typeof createAdminClient>,
  tenantId: string,
  evolutionUrl: string,
  evolutionApiKey: string,
  instanceName: string
) {
  // Busca mensagens recentes da Evolution (não enviadas por nós)
  const res = await fetch(`${evolutionUrl}/chat/findMessages/${instanceName}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', apikey: evolutionApiKey },
    body: JSON.stringify({
      where: { key: { fromMe: false } },
      limit: FETCH_LIMIT,
    }),
  })

  if (!res.ok) {
    console.error(`[poll-evolution] Erro ao buscar mensagens do Evolution: ${res.status}`)
    return
  }

  const data = await res.json()
  const messages: EvolutionMessage[] = data?.messages?.records ?? []

  // Filtra: mensagens recentes (últimas 10 minutos), não de grupos, e NÃO enviadas pelo bot
  // O filtro fromMe da API Evolution nem sempre funciona — aplicamos client-side também
  // Ignora mensagens LID sem remoteJidAlt: não temos o número real para responder
  const tenMinutesAgo = Math.floor(Date.now() / 1000) - 10 * 60
  const recentMessages = messages.filter(
    (m) =>
      m.messageTimestamp >= tenMinutesAgo &&
      !m.key.fromMe &&
      !m.key.remoteJid.includes('@g.us') &&
      m.key.id &&
      !(m.key.remoteJid.endsWith('@lid') && !m.key.remoteJidAlt)
  )

  if (recentMessages.length === 0) return

  // Verifica quais já estão no banco pelo whatsapp_message_id
  const whatsappIds = recentMessages.map((m) => m.key.id)
  const { data: existing } = await supabase
    .from('messages')
    .select('whatsapp_message_id')
    .in('whatsapp_message_id', whatsappIds)
    .eq('tenant_id', tenantId)

  const existingIds = new Set((existing ?? []).map((m) => m.whatsapp_message_id))

  // Processa somente mensagens novas (não estão no banco)
  const newMessages = recentMessages
    .filter((m) => !existingIds.has(m.key.id))
    .sort((a, b) => a.messageTimestamp - b.messageTimestamp) // ordem cronológica

  for (const msg of newMessages) {
    const phoneNumber = extractNumber(msg.key)
    const { text, contentType, mediaUrl } = parseMessageContent(msg)

    // Ignora mensagens sem conteúdo útil
    if (!text && contentType !== 'image') continue

    console.log(`[poll-evolution] Processando mensagem nova: ${msg.key.id} de ${phoneNumber}`)

    // Busca ou cria contato
    const { data: existingContact } = await supabase
      .from('contacts')
      .select('id')
      .eq('tenant_id', tenantId)
      .eq('whatsapp_number', phoneNumber)
      .single()

    let contactId: string

    if (existingContact) {
      contactId = existingContact.id
      const updates: Record<string, unknown> = { last_contact_at: new Date().toISOString() }
      if (msg.pushName) updates.whatsapp_name = msg.pushName
      await supabase.from('contacts').update(updates).eq('id', contactId)
    } else {
      const { data: newContact, error: contactError } = await supabase
        .from('contacts')
        .insert({
          tenant_id: tenantId,
          whatsapp_number: phoneNumber,
          whatsapp_name: msg.pushName ?? null,
          first_contact_at: new Date().toISOString(),
          last_contact_at: new Date().toISOString(),
        })
        .select('id')
        .single()

      if (contactError || !newContact) {
        console.error('[poll-evolution] Erro ao criar contato:', contactError?.message)
        continue
      }
      contactId = newContact.id
    }

    // Busca ou cria conversa ativa
    const { data: existingConv } = await supabase
      .from('conversations')
      .select('id, status')
      .eq('tenant_id', tenantId)
      .eq('contact_id', contactId)
      .not('status', 'eq', 'closed')
      .order('created_at', { ascending: false })
      .limit(1)
      .single()

    let conversationId: string
    let conversationStatus: string

    if (existingConv) {
      conversationId = existingConv.id
      conversationStatus = existingConv.status
      await supabase
        .from('conversations')
        .update({ last_message_at: new Date().toISOString() })
        .eq('id', conversationId)
    } else {
      const { data: agent } = await supabase
        .from('ai_agents')
        .select('id')
        .eq('tenant_id', tenantId)
        .eq('is_default', true)
        .eq('is_active', true)
        .single()

      const { data: stage } = await supabase
        .from('kanban_stages')
        .select('id')
        .eq('tenant_id', tenantId)
        .eq('slug', 'novo_lead')
        .single()

      const { data: newConv, error: convError } = await supabase
        .from('conversations')
        .insert({
          tenant_id: tenantId,
          contact_id: contactId,
          ai_agent_id: agent?.id ?? null,
          kanban_stage_id: stage?.id ?? null,
          status: 'ai_handling',
          last_message_at: new Date().toISOString(),
        })
        .select('id, status')
        .single()

      if (convError || !newConv) {
        console.error('[poll-evolution] Erro ao criar conversa:', convError?.message)
        continue
      }

      conversationId = newConv.id
      conversationStatus = newConv.status
    }

    // Salva mensagem no banco
    const { error: msgError } = await supabase.from('messages').insert({
      tenant_id: tenantId,
      conversation_id: conversationId,
      contact_id: contactId,
      sender_type: 'customer',
      content: text,
      content_type: contentType,
      media_url: mediaUrl,
      whatsapp_message_id: msg.key.id,
    })

    if (msgError) {
      // Pode ser duplicata se webhook e polling rodaram ao mesmo tempo — ignora
      if (msgError.code === '23505') continue
      console.error('[poll-evolution] Erro ao salvar mensagem:', msgError.message)
      continue
    }

    // Cancela follow-ups pendentes
    await supabase
      .from('follow_ups')
      .update({ status: 'replied' })
      .eq('contact_id', contactId)
      .eq('status', 'pending')

    // Dispara process-message se IA está atendendo
    if (conversationStatus === 'ai_handling') {
      fetch(`${SUPABASE_URL}/functions/v1/process-message`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${SERVICE_ROLE_KEY}`,
        },
        body: JSON.stringify({ conversationId }),
      }).catch((err) => console.error('[poll-evolution] process-message error:', err))
    }
  }
}

// Executa uma rodada de polling para todos os tenants ativos
async function runPollRound(supabase: ReturnType<typeof createAdminClient>): Promise<number> {
  const { data: tenants, error } = await supabase
    .from('tenants')
    .select('id, evolution_api_url, evolution_api_key, evolution_instance_name')
    .eq('status', 'active')
    .not('evolution_api_url', 'is', null)
    .not('evolution_api_key', 'is', null)
    .not('evolution_instance_name', 'is', null)

  if (error || !tenants?.length) return 0

  let totalProcessed = 0
  for (const tenant of tenants) {
    try {
      await processTenant(
        supabase,
        tenant.id,
        tenant.evolution_api_url.replace(/\/$/, ''),
        tenant.evolution_api_key,
        tenant.evolution_instance_name
      )
      totalProcessed++
    } catch (err) {
      console.error(`[poll-evolution] Erro no tenant ${tenant.id}:`, err)
    }
  }
  return totalProcessed
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, {
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
      },
    })
  }

  const supabase = createAdminClient()

  try {
    // Primeira rodada imediata
    const first = await runPollRound(supabase)

    // Repete mais 3 vezes a cada 15 segundos dentro da mesma execução
    // Reduz o delay máximo de 60s (pg_cron) para ~15s
    const INTERVAL_MS = 15_000
    const EXTRA_ROUNDS = 3

    ;(async () => {
      for (let i = 0; i < EXTRA_ROUNDS; i++) {
        await new Promise((resolve) => setTimeout(resolve, INTERVAL_MS))
        try {
          await runPollRound(supabase)
        } catch (err) {
          console.error(`[poll-evolution] Erro na rodada ${i + 2}:`, err)
        }
      }
    })()

    return Response.json({ success: true, tenantsProcessed: first, mode: 'polling-15s' })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Erro interno'
    console.error('[poll-evolution]', message)
    return Response.json({ error: message }, { status: 500 })
  }
})
