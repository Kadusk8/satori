import { createAdminClient } from '../_shared/supabase-admin.ts'

// NOTA: Todas as env vars/secrets devem ser lidas DENTRO do handler (não no nível de módulo).
// A injeção de secrets só acontece no contexto de request no Supabase Edge Functions.
//
// Evolution Go: cada tenant tem sua própria instância externa, e nossa URL de
// webhook já é única por tenant (?ts=<webhook_secret>). Por isso resolvemos o
// tenant PELO SEGREDO DA URL, não por um campo "instance" no corpo do payload
// — a Evolution Go não necessariamente inclui esse campo, e mesmo se incluísse
// seria redundante, já que a própria URL do webhook já identifica o tenant.
//
// Formato de `data` confirmado na doc oficial (docs/wiki/recursos-avancados/
// events-system.md do repo evolution-foundation/evolution-go, lido em
// 2026-07-03): é o mesmo shape key/message da Evolution API clássica —
// { key: { remoteJid, fromMe, id }, message: { conversation }, pushName }.
// Os nomes de evento variam entre MAIÚSCULO ("MESSAGE") e PascalCase
// ("Message") dependendo da página da doc — normalizeEventType() aceita
// ambos via lowercase. Mídia (imagem/áudio/documento) segue a mesma
// nomenclatura da Evolution API clássica, mas não foi vista num exemplo
// oficial — só o caso de texto foi confirmado ao pé da letra.

interface EvolutionMessageData {
  key: {
    remoteJid: string
    fromMe: boolean
    id: string
    remoteJidAlt?: string
  }
  message?: {
    conversation?: string
    extendedTextMessage?: { text: string }
    imageMessage?: { caption?: string; url?: string }
    audioMessage?: { url?: string }
    pttMessage?: { url?: string }
    documentMessage?: { title?: string; url?: string }
  }
  messageType?: string
  messageTimestamp?: string
  pushName?: string
}

interface EvolutionConnectionData {
  state?: 'open' | 'close' | 'connecting'
  connected?: boolean
}

interface TenantRow {
  id: string
  status: string
  evolution_api_url: string | null
  evolution_api_key: string | null
  evolution_instance_name: string | null
  webhook_secret: string
}

// Mapeia os nomes de evento da Evolution Go (PascalCase, do whatsmeow) e os
// da Evolution API clássica (MAIUSCULO_COM_UNDERSCORE) pro mesmo vocabulário interno.
function normalizeEventType(rawEventType: string): 'MESSAGE' | 'CONNECTION' | 'UNKNOWN' {
  const t = (rawEventType ?? '').toLowerCase()
  if (t === 'message' || t === 'messages_upsert' || t === 'messages.upsert') return 'MESSAGE'
  if (
    t === 'connected' || t === 'disconnected' || t === 'loggedout' || t === 'logged_out' ||
    t === 'connection_update' || t === 'connection.update' || t === 'pairsuccess' || t === 'pair_success'
  ) return 'CONNECTION'
  return 'UNKNOWN'
}

// Extrai o número limpo do JID do WhatsApp (remove @s.whatsapp.net e sufixos)
// Quando remoteJid é LID (@lid), usa remoteJidAlt que contém o número real
function extractNumber(jid: string, jidAlt?: string): string {
  const resolved = (jid.endsWith('@lid') && jidAlt) ? jidAlt : jid
  return resolved.replace(/@.*$/, '').replace(/:\d+$/, '')
}

// Normaliza número brasileiro: remove o 9 extra de celular quando presente
function normalizeBrazilianNumber(phone: string): string {
  if (/^55\d{11}$/.test(phone)) {
    return phone.slice(0, 4) + phone.slice(5)
  }
  return phone
}

// Lê remoteJid/fromMe/id do envelope `key` (confirmado na doc oficial)
function readEnvelope(data: EvolutionMessageData): { remoteJid: string; remoteJidAlt?: string; fromMe: boolean; id: string; pushName?: string } | null {
  if (!data.key) return null
  return {
    remoteJid: data.key.remoteJid,
    remoteJidAlt: data.key.remoteJidAlt,
    fromMe: data.key.fromMe,
    id: data.key.id,
    pushName: data.pushName,
  }
}

// Extrai texto e mídia da mensagem
function parseMessage(data: EvolutionMessageData): {
  text: string | null
  contentType: 'text' | 'image' | 'audio' | 'document'
  mediaUrl: string | null
} {
  const msg = data.message ?? {}
  console.log('[webhook-evolution] parseMessage keys:', Object.keys(msg))

  if (msg.conversation) {
    return { text: msg.conversation, contentType: 'text', mediaUrl: null }
  }
  if (msg.extendedTextMessage?.text) {
    return { text: msg.extendedTextMessage.text, contentType: 'text', mediaUrl: null }
  }
  if (msg.imageMessage) {
    return {
      text: msg.imageMessage.caption ?? null,
      contentType: 'image',
      mediaUrl: msg.imageMessage.url ?? null,
    }
  }
  if (msg.audioMessage) {
    return { text: null, contentType: 'audio', mediaUrl: msg.audioMessage.url ?? null }
  }
  if (msg.pttMessage) {
    return { text: null, contentType: 'audio', mediaUrl: msg.pttMessage.url ?? null }
  }
  if (msg.documentMessage) {
    return {
      text: msg.documentMessage.title ?? null,
      contentType: 'document',
      mediaUrl: msg.documentMessage.url ?? null,
    }
  }

  return { text: null, contentType: 'text', mediaUrl: null }
}

// ── Handlers por tipo de evento ──────────────────────────────────────────────

// Retorna { conversationId, whatsappMessageId } se a IA deve processar, null caso contrário
async function handleMessageEvent(
  supabase: ReturnType<typeof createAdminClient>,
  tenant: TenantRow,
  data: EvolutionMessageData,
): Promise<{ conversationId: string; whatsappMessageId: string } | null> {
  const envelope = readEnvelope(data)
  if (!envelope) {
    console.error('[webhook-evolution] payload de mensagem sem key/info reconhecível:', JSON.stringify(data).slice(0, 300))
    return null
  }

  console.log(`[webhook-evolution] fromMe=${envelope.fromMe}, remoteJid=${envelope.remoteJid}, messageType=${data.messageType}`)
  if (envelope.fromMe) return null

  // Ignora mensagens de grupos
  if (envelope.remoteJid.includes('@g.us')) return null

  const phoneNumber = extractNumber(envelope.remoteJid, envelope.remoteJidAlt)
  const { text, contentType, mediaUrl } = parseMessage(data)
  console.log(`[webhook-evolution] parsed: contentType=${contentType}, text=${text?.slice(0, 50) ?? 'null'}, mediaUrl=${mediaUrl ?? 'null'}`)

  if (!text && contentType !== 'image' && contentType !== 'audio') {
    console.log('[webhook-evolution] descartado: sem conteúdo útil')
    return null
  }

  if (tenant.status === 'suspended' || tenant.status === 'cancelled') return null

  const tenantId = tenant.id

  // ── Busca ou cria contato ──────────────────────────────────────
  let { data: existingContact } = await supabase
    .from('contacts')
    .select('id, whatsapp_number')
    .eq('tenant_id', tenantId)
    .eq('whatsapp_number', phoneNumber)
    .single()

  if (!existingContact) {
    const normalized = normalizeBrazilianNumber(phoneNumber)
    if (normalized !== phoneNumber) {
      const { data: fallback } = await supabase
        .from('contacts')
        .select('id, whatsapp_number')
        .eq('tenant_id', tenantId)
        .eq('whatsapp_number', normalized)
        .single()
      if (fallback) existingContact = fallback
    }
  }

  let contactId: string

  if (existingContact) {
    contactId = existingContact.id
    const updates: Record<string, unknown> = { last_contact_at: new Date().toISOString() }
    if (envelope.pushName) updates.whatsapp_name = envelope.pushName
    await supabase.from('contacts').update(updates).eq('id', contactId)
  } else {
    const { data: newContact, error: contactError } = await supabase
      .from('contacts')
      .insert({
        tenant_id: tenantId,
        whatsapp_number: phoneNumber,
        whatsapp_name: envelope.pushName ?? null,
        first_contact_at: new Date().toISOString(),
        last_contact_at: new Date().toISOString(),
      })
      .select('id')
      .single()

    if (contactError || !newContact) {
      console.error('[webhook-evolution] Erro ao criar contato:', contactError?.message)
      return null
    }
    contactId = newContact.id
  }

  // ── Busca ou cria conversa ativa ───────────────────────────────
  const { data: existingConv } = await supabase
    .from('conversations')
    .select('id, status, ai_agent_id')
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
      console.error('[webhook-evolution] Erro ao criar conversa:', convError?.message)
      return null
    }

    conversationId = newConv.id
    conversationStatus = newConv.status
  }

  // ── Para áudio: busca a mídia na Evolution Go e faz upload no Storage ──
  let finalMediaUrl = mediaUrl
  if (contentType === 'audio' && tenant.evolution_api_url && tenant.evolution_api_key) {
    try {
      const evoUrl = tenant.evolution_api_url.replace(/\/$/, '')
      const evoKey = tenant.evolution_api_key
      // Confirmado na doc oficial (guias-api/api-messages.md): o endpoint é
      // /message/downloadimage (apesar do nome, baixa qualquer tipo de mídia
      // — image/video/audio/document/sticker) e retorna
      // { data: { base64: "data:<mime>;base64,<...>" } } — uma data URI completa.
      const mediaRes = await fetch(`${evoUrl}/message/downloadimage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', apikey: evoKey },
        body: JSON.stringify({ message: data.message }),
      })
      if (mediaRes.ok) {
        const mediaBody = await mediaRes.json()
        const dataUri: string | undefined = mediaBody?.data?.base64
        const match = dataUri?.match(/^data:([^;]+);base64,(.+)$/)
        if (match) {
          const [, mimeType, base64] = match
          const byteString = atob(base64)
          const bytes = new Uint8Array(byteString.length)
          for (let i = 0; i < byteString.length; i++) {
            bytes[i] = byteString.charCodeAt(i)
          }
          const ext = mimeType.includes('mp4') ? 'mp4' : mimeType.includes('mpeg') ? 'mp3' : 'ogg'
          const storagePath = `${tenantId}/audio/${envelope.id}.${ext}`
          const { error: uploadError } = await supabase.storage
            .from('media')
            .upload(storagePath, bytes, { contentType: mimeType, upsert: true })
          if (!uploadError) {
            const { data: publicData } = supabase.storage.from('media').getPublicUrl(storagePath)
            finalMediaUrl = publicData.publicUrl
          } else {
            console.error('[webhook-evolution] Erro upload storage:', uploadError.message)
          }
        } else {
          console.error('[webhook-evolution] Resposta de downloadimage sem base64 reconhecível:', JSON.stringify(mediaBody).slice(0, 200))
        }
      } else {
        console.error('[webhook-evolution] Erro downloadimage:', await mediaRes.text())
      }
    } catch (err) {
      console.error('[webhook-evolution] Erro ao buscar mídia da Evolution Go:', err)
    }
  }

  // ── Salva mensagem do cliente ──────────────────────────────────
  await supabase.from('messages').insert({
    tenant_id: tenantId,
    conversation_id: conversationId,
    contact_id: contactId,
    sender_type: 'customer',
    content: text,
    content_type: contentType,
    media_url: finalMediaUrl,
    whatsapp_message_id: envelope.id,
  })

  // ── Cancela follow-ups pendentes do contato que respondeu ─────
  const { error: followUpError } = await supabase
    .from('follow_ups')
    .update({ status: 'replied' })
    .eq('contact_id', contactId)
    .eq('status', 'pending')

  if (followUpError) {
    console.error('[webhook-evolution] Erro ao cancelar follow-ups:', followUpError.message)
  }

  return conversationStatus === 'ai_handling'
    ? { conversationId, whatsappMessageId: envelope.id }
    : null
}

async function handleConnectionEvent(
  supabase: ReturnType<typeof createAdminClient>,
  tenant: TenantRow,
  rawEventType: string,
  data: EvolutionConnectionData,
) {
  // "LoggedOut"/"Disconnected" → desconectado; "Connected"/state:"open" → conectado
  const t = rawEventType.toLowerCase()
  const connected = data.connected === true || data.state === 'open' ||
    (t === 'connected' && data.state !== 'close')
  const disconnected = t === 'loggedout' || t === 'logged_out' || t === 'disconnected' || data.state === 'close'

  await supabase
    .from('tenants')
    .update({ whatsapp_connected: disconnected ? false : connected })
    .eq('id', tenant.id)
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

  let raw: { event?: string; instance?: string; data?: unknown }
  try {
    raw = await req.json()
    console.log('[webhook-evolution] raw keys:', Object.keys(raw), '| event:', raw.event, '| instance:', raw.instance)
    console.log('[webhook-evolution] data completo:', JSON.stringify(raw.data).slice(0, 800))
  } catch (parseErr) {
    console.error('[webhook-evolution] Erro ao parsear payload:', parseErr)
    return Response.json({ error: 'Payload inválido' }, { status: 400 })
  }

  const rawEventType = raw.event ?? ''
  const eventType = normalizeEventType(rawEventType)

  if (!rawEventType) {
    console.error('[webhook-evolution] Payload sem campo "event"')
    return Response.json({ error: 'event é obrigatório' }, { status: 400 })
  }

  const supabase = createAdminClient()

  // ── Resolve o tenant e valida o segredo do webhook ───────────────────────
  // A URL do nosso webhook já é única por tenant (?ts=<webhook_secret>) —
  // não dependemos de a Evolution Go informar qual instância mandou o evento.
  const providedSecret = new URL(req.url).searchParams.get('ts')
  if (!providedSecret) {
    console.error('[webhook-evolution] Requisição sem ?ts= — rejeitada')
    return Response.json({ error: 'not authorized' }, { status: 401 })
  }

  const { data: tenant } = await supabase
    .from('tenants')
    .select('id, status, evolution_api_url, evolution_api_key, evolution_instance_name, webhook_secret')
    .eq('webhook_secret', providedSecret)
    .single<TenantRow>()

  if (!tenant) {
    console.error('[webhook-evolution] Nenhum tenant encontrado para o segredo informado')
    return Response.json({ error: 'not authorized' }, { status: 401 })
  }

  try {
    switch (eventType) {
      case 'MESSAGE': {
        const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? ''
        const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
        const result = await handleMessageEvent(supabase, tenant, raw.data as EvolutionMessageData)
        console.log(`[webhook-evolution] MESSAGE processado → ${result ? `convId: ${result.conversationId}` : 'null (ignorado)'}`)
        if (result) {
          const { conversationId: convId, whatsappMessageId: ourMsgId } = result

          // Buffer: aguarda 6s para agrupar mensagens rápidas do mesmo cliente
          const bgTask = (async () => {
            await new Promise<void>(r => setTimeout(r, 6000))

            const supabase2 = createAdminClient()
            const { data: latestMsg } = await supabase2
              .from('messages')
              .select('whatsapp_message_id')
              .eq('conversation_id', convId)
              .eq('sender_type', 'customer')
              .order('created_at', { ascending: false })
              .limit(1)
              .single()

            if (latestMsg?.whatsapp_message_id !== ourMsgId) {
              console.log('[webhook-evolution] Mensagem mais recente detectada, abortando processamento')
              return
            }

            await fetch(`${SUPABASE_URL}/functions/v1/process-message`, {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${SERVICE_ROLE_KEY}`,
              },
              body: JSON.stringify({ conversationId: convId }),
            }).catch((err) => console.error('[webhook-evolution] Erro ao invocar process-message:', err))
          })()

          // @ts-ignore: EdgeRuntime é uma variável global do Supabase
          if (typeof EdgeRuntime !== 'undefined' && typeof EdgeRuntime.waitUntil === 'function') {
            // @ts-ignore
            EdgeRuntime.waitUntil(bgTask)
          } else {
            bgTask.catch(e => console.error('[webhook-evolution] bgTask error:', e))
          }
        }
        break
      }

      case 'CONNECTION':
        await handleConnectionEvent(supabase, tenant, rawEventType, raw.data as EvolutionConnectionData)
        break

      default:
        console.log(`[webhook-evolution] Evento não tratado: ${rawEventType}`)
        break
    }

    return Response.json({ received: true })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Erro interno'
    console.error('[webhook-evolution]', rawEventType, message)
    return Response.json({ received: true, error: message })
  }
})
