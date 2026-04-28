import { createAdminClient } from '../_shared/supabase-admin.ts'

// NOTA: Todas as env vars/secrets devem ser lidas DENTRO do handler (não no nível de módulo).
// A injeção de secrets só acontece no contexto de request no Supabase Edge Functions.

// Tipos dos eventos da Evolution API v2
interface EvolutionEvent {
  event: string
  instance: string
  data: EvolutionMessageData | EvolutionConnectionData | EvolutionContactData
}

interface EvolutionMessageData {
  key: {
    remoteJid: string      // número@s.whatsapp.net, grupo@g.us, ou LID@lid
    fromMe: boolean
    id: string
    remoteJidAlt?: string  // número real quando remoteJid é LID (@lid)
  }
  message?: {
    conversation?: string          // texto simples
    extendedTextMessage?: { text: string }
    imageMessage?: { caption?: string; url?: string }
    audioMessage?: { url?: string }
    pttMessage?: { url?: string }  // áudio PTT (gravado ao vivo no WhatsApp)
    documentMessage?: { title?: string; url?: string }
  }
  messageType: string
  messageTimestamp: number
  pushName?: string               // nome do contato no WhatsApp
}

interface EvolutionConnectionData {
  state: 'open' | 'close' | 'connecting'
}

interface EvolutionContactData {
  id: string
  name?: string
  pushName?: string
}

// Extrai o número limpo do JID do WhatsApp (remove @s.whatsapp.net e sufixos)
// Quando remoteJid é LID (@lid), usa remoteJidAlt que contém o número real
function extractNumber(key: { remoteJid: string; remoteJidAlt?: string }): string {
  const jid = (key.remoteJid.endsWith('@lid') && key.remoteJidAlt)
    ? key.remoteJidAlt
    : key.remoteJid
  return jid.replace(/@.*$/, '').replace(/:\d+$/, '')
}

// Normaliza número brasileiro: remove o 9 extra de celular quando presente
// Ex: 5562999350398 → 556299350398 (BR, DDD 62, remove 9 após DDD)
function normalizeBrazilianNumber(phone: string): string {
  if (/^55\d{11}$/.test(phone)) {
    return phone.slice(0, 4) + phone.slice(5)
  }
  return phone
}

// Extrai texto e mídia da mensagem Evolution
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
async function handleMessageUpsert(
  supabase: ReturnType<typeof createAdminClient>,
  instanceName: string,
  data: EvolutionMessageData,
): Promise<{ conversationId: string; whatsappMessageId: string } | null> {
  // Ignora mensagens enviadas pelo próprio bot
  console.log(`[webhook-evolution] fromMe=${data.key.fromMe}, remoteJid=${data.key.remoteJid}, messageType=${data.messageType}`)
  if (data.key.fromMe) return null

  // Ignora mensagens de grupos
  if (data.key.remoteJid.includes('@g.us')) return null

  const phoneNumber = extractNumber(data.key)
  const { text, contentType, mediaUrl } = parseMessage(data)
  console.log(`[webhook-evolution] parsed: contentType=${contentType}, text=${text?.slice(0,50) ?? 'null'}, mediaUrl=${mediaUrl ?? 'null'}`)

  // Ignora se não tem conteúdo útil (documento sem texto — áudio é tratado via STT)
  if (!text && contentType !== 'image' && contentType !== 'audio') {
    console.log('[webhook-evolution] descartado: sem conteúdo útil')
    return null
  }

  // ── Busca tenant pelo evolution_instance_name ────────────────────
  const { data: tenant, error: tenantError } = await supabase
    .from('tenants')
    .select('id, status, evolution_api_url, evolution_api_key')
    .eq('evolution_instance_name', instanceName)
    .single()

  if (tenantError || !tenant) {
    console.error(`[webhook-evolution] Tenant não encontrado para instância ${instanceName}`)
    return null
  }

  // Tenant suspenso não processa mensagens
  if (tenant.status === 'suspended' || tenant.status === 'cancelled') return null

  const tenantId = tenant.id

  // ── Busca ou cria contato ──────────────────────────────────────
  // Tenta pelo número exato primeiro; se não achar, tenta sem o 9 extra (BR)
  let { data: existingContact } = await supabase
    .from('contacts')
    .select('id, whatsapp_number')
    .eq('tenant_id', tenantId)
    .eq('whatsapp_number', phoneNumber)
    .single()

  // Fallback: número BR com 13 dígitos → tenta versão sem o 9 extra (12 dígitos)
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
    if (data.pushName) updates.whatsapp_name = data.pushName
    await supabase.from('contacts').update(updates).eq('id', contactId)
  } else {
    const { data: newContact, error: contactError } = await supabase
      .from('contacts')
      .insert({
        tenant_id: tenantId,
        whatsapp_number: phoneNumber,
        whatsapp_name: data.pushName ?? null,
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

  // ── Para áudio: busca base64 na Evolution API e faz upload no Storage ──
  let finalMediaUrl = mediaUrl
  if (contentType === 'audio' && tenant.evolution_api_url && tenant.evolution_api_key) {
    try {
      const evoUrl = (tenant.evolution_api_url as string).replace(/\/$/, '')
      const evoKey = tenant.evolution_api_key as string
      const mediaRes = await fetch(
        `${evoUrl}/chat/getBase64FromMediaMessage/${instanceName}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', apikey: evoKey },
          body: JSON.stringify({
            message: {
              key: data.key,
              message: data.message,
            },
          }),
        }
      )
      if (mediaRes.ok) {
        const mediaData = await mediaRes.json()
        const base64 = mediaData?.base64 ?? mediaData?.data?.base64
        const mimeType = mediaData?.mimetype ?? 'audio/ogg'
        if (base64) {
          // Decodifica base64 e faz upload no Supabase Storage
          const byteString = atob(base64)
          const bytes = new Uint8Array(byteString.length)
          for (let i = 0; i < byteString.length; i++) {
            bytes[i] = byteString.charCodeAt(i)
          }
          const ext = mimeType.includes('mp4') ? 'mp4' : mimeType.includes('mpeg') ? 'mp3' : 'ogg'
          const storagePath = `${tenantId}/audio/${data.key.id}.${ext}`
          const { error: uploadError } = await supabase.storage
            .from('media')
            .upload(storagePath, bytes, { contentType: mimeType, upsert: true })
          if (!uploadError) {
            const { data: publicData } = supabase.storage.from('media').getPublicUrl(storagePath)
            finalMediaUrl = publicData.publicUrl
          } else {
            console.error('[webhook-evolution] Erro upload storage:', uploadError.message)
          }
        }
      } else {
        console.error('[webhook-evolution] Erro getBase64:', await mediaRes.text())
      }
    } catch (err) {
      console.error('[webhook-evolution] Erro ao buscar mídia da Evolution:', err)
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
    whatsapp_message_id: data.key.id,
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

  // Retorna { conversationId, whatsappMessageId } se IA deve processar, null caso contrário
  return conversationStatus === 'ai_handling'
    ? { conversationId, whatsappMessageId: data.key.id }
    : null
}

async function handleConnectionUpdate(
  supabase: ReturnType<typeof createAdminClient>,
  instanceName: string,
  data: EvolutionConnectionData
) {
  const connected = data.state === 'open'
  await supabase
    .from('tenants')
    .update({ whatsapp_connected: connected })
    .eq('evolution_instance_name', instanceName)
}

async function handleContactsUpsert(
  supabase: ReturnType<typeof createAdminClient>,
  instanceName: string,
  data: EvolutionContactData
) {
  const phoneNumber = extractNumber({ remoteJid: data.id })
  const name = data.name ?? data.pushName ?? null
  if (!name) return

  const { data: tenant } = await supabase
    .from('tenants')
    .select('id')
    .eq('evolution_instance_name', instanceName)
    .single()

  if (!tenant) return

  await supabase
    .from('contacts')
    .update({ whatsapp_name: name })
    .eq('tenant_id', tenant.id)
    .eq('whatsapp_number', phoneNumber)
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

  let event: EvolutionEvent
  try {
    const raw = await req.json()
    console.log('[webhook-evolution] raw keys:', Object.keys(raw), '| data type:', typeof raw.data)
    if (raw.data && typeof raw.data === 'string') {
      console.log('[webhook-evolution] data base64 prefix:', raw.data.slice(0, 80))
      try {
        raw.data = JSON.parse(atob(raw.data))
        console.log('[webhook-evolution] base64 decodificado OK')
      } catch (e) {
        console.error('[webhook-evolution] falha ao decodificar base64:', e)
      }
    }
    event = raw
    console.log(`[webhook-evolution] Payload recebido: event=${raw.event}, instance=${raw.instance}`)
    if (raw.event === 'MESSAGES_UPSERT') {
      console.log('[webhook-evolution] data completo:', JSON.stringify(raw.data).slice(0, 500))
    }
  } catch (parseErr) {
    console.error('[webhook-evolution] Erro ao parsear payload:', parseErr)
    return Response.json({ error: 'Payload inválido' }, { status: 400 })
  }

  const { event: rawEventType, instance: instanceName, data } = event
  // Normaliza: 'messages.upsert' → 'MESSAGES_UPSERT'
  const eventType = (rawEventType ?? '').toUpperCase().replace(/\./g, '_')

  if (!eventType || !instanceName) {
    console.error('[webhook-evolution] Campos ausentes: event=', eventType, 'instance=', instanceName)
    return Response.json({ error: 'event e instance são obrigatórios' }, { status: 400 })
  }

  const supabase = createAdminClient()

  try {
    switch (eventType) {
      case 'MESSAGES_UPSERT': {
        const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? ''
        const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
        const result = await handleMessageUpsert(supabase, instanceName, data as EvolutionMessageData)
        console.log(`[webhook-evolution] MESSAGES_UPSERT processado → ${result ? `convId: ${result.conversationId}` : 'null (ignorado)'}`)
        if (result) {
          const { conversationId: convId, whatsappMessageId: ourMsgId } = result

          // Buffer: aguarda 6s para agrupar mensagens rápidas do mesmo cliente
          // Só processa se esta ainda for a mensagem mais recente após a espera
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

      case 'CONNECTION_UPDATE':
        await handleConnectionUpdate(supabase, instanceName, data as EvolutionConnectionData)
        break

      case 'CONTACTS_UPSERT':
        await handleContactsUpsert(supabase, instanceName, data as EvolutionContactData)
        break

      default:
        break
    }

    return Response.json({ received: true })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Erro interno'
    console.error('[webhook-evolution]', eventType, message)
    return Response.json({ received: true, error: message })
  }
})
