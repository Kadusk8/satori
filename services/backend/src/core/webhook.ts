// Lógica de processamento de eventos da Evolution Go — porta de
// supabase/functions/webhook-evolution/index.ts. Troca Supabase Storage por
// Cloudinary pro áudio, e a invocação de process-message via fetch por uma
// chamada de função direta (mesmo processo Node).

import { and, desc, eq, ne } from 'drizzle-orm'
import { db, pool, getDecryptedEvolutionKey } from '../db/index.js'
import { contacts, conversations, messages } from '../db/schema.js'
import { uploadAudio } from '../shared/cloudinary.js'
import { processMessage } from './process-message.js'

const ENCRYPTION_KEY = process.env.ENCRYPTION_KEY ?? null

export interface TenantRow {
  id: string
  status: string
  evolution_api_url: string | null
  evolution_api_key: string | null
  evolution_instance_name: string | null
  webhook_secret: string
}

// Referral de anúncio Click-to-WhatsApp — mesmo proto do WhatsApp usado pelo
// Baileys/whatsmeow (contextInfo.externalAdReply), presente em qualquer tipo
// de mensagem que o cliente mande como primeira mensagem ao clicar num
// anúncio do Facebook/Instagram. Formato confirmado contra payload real da
// Evolution Go em 2026-07-12: sourceID/sourceURL vêm com ID/URL maiúsculos
// (não sourceId/sourceUrl como no proto Baileys "clássico"), e ctwaClid é o
// click ID do Meta (mais útil que sourceID pra Conversions API).
interface ExternalAdReplyInfo {
  title?: string
  body?: string
  sourceID?: string
  sourceURL?: string
  ctwaClid?: string
  thumbnailUrl?: string
  mediaType?: number
}

interface ContextInfo {
  externalAdReply?: ExternalAdReplyInfo
}

// Formato real da Evolution Go (baseada na lib Go `whatsmeow`, não no formato
// Baileys clássico) — campos em PascalCase dentro de `Info`/`Message`.
interface EvolutionMessageData {
  Info?: {
    Chat: string
    Sender: string
    SenderAlt?: string
    IsFromMe: boolean
    IsGroup: boolean
    ID: string
    PushName?: string
  }
  Message?: {
    conversation?: string
    extendedTextMessage?: { text: string; contextInfo?: ContextInfo }
    imageMessage?: { caption?: string; url?: string; contextInfo?: ContextInfo }
    audioMessage?: { url?: string }
    pttMessage?: { url?: string }
    documentMessage?: { title?: string; url?: string }
  }
}

export interface AdReferral {
  title: string | null
  body: string | null
  sourceId: string | null
  sourceUrl: string | null
  ctwaClid: string | null
}

/**
 * Extrai o referral de anúncio (Click-to-WhatsApp) do payload cru, se houver.
 * Loga o contextInfo bruto sempre que presente — é o que permite confirmar/
 * corrigir o mapeamento de campo real da Evolution Go assim que o primeiro
 * lead de anúncio chegar em produção, sem precisar instrumentar depois.
 */
export function extractAdReferral(data: EvolutionMessageData): AdReferral | null {
  const contextInfo = data.Message?.extendedTextMessage?.contextInfo ?? data.Message?.imageMessage?.contextInfo
  if (!contextInfo) return null

  console.log('[webhook] contextInfo bruto recebido (validação de referral de anúncio):', JSON.stringify(contextInfo))

  const ad = contextInfo.externalAdReply
  if (!ad) return null

  return {
    title: ad.title ?? null,
    body: ad.body ?? null,
    sourceId: ad.sourceID ?? null,
    sourceUrl: ad.sourceURL ?? null,
    ctwaClid: ad.ctwaClid ?? null,
  }
}

interface EvolutionConnectionData {
  state?: 'open' | 'close' | 'connecting'
  connected?: boolean
}

function normalizeEventType(rawEventType: string): 'MESSAGE' | 'CONNECTION' | 'UNKNOWN' {
  const t = (rawEventType ?? '').toLowerCase()
  if (t === 'message' || t === 'messages_upsert' || t === 'messages.upsert') return 'MESSAGE'
  if (
    t === 'connected' || t === 'disconnected' || t === 'loggedout' || t === 'logged_out' ||
    t === 'connection_update' || t === 'connection.update' || t === 'pairsuccess' || t === 'pair_success'
  ) return 'CONNECTION'
  return 'UNKNOWN'
}

function extractNumber(jid: string, jidAlt?: string): string {
  const resolved = jid.endsWith('@lid') && jidAlt ? jidAlt : jid
  return resolved.replace(/@.*$/, '').replace(/:\d+$/, '')
}

function normalizeBrazilianNumber(phone: string): string {
  if (/^55\d{11}$/.test(phone)) return phone.slice(0, 4) + phone.slice(5)
  return phone
}

function readEnvelope(data: EvolutionMessageData): { remoteJid: string; remoteJidAlt?: string; fromMe: boolean; isGroup: boolean; id: string; pushName?: string } | null {
  if (!data.Info) return null
  return {
    remoteJid: data.Info.Chat,
    remoteJidAlt: data.Info.SenderAlt,
    fromMe: data.Info.IsFromMe,
    isGroup: data.Info.IsGroup,
    id: data.Info.ID,
    pushName: data.Info.PushName,
  }
}

function parseMessage(data: EvolutionMessageData): { text: string | null; contentType: 'text' | 'image' | 'audio' | 'document'; mediaUrl: string | null } {
  const msg = data.Message ?? {}
  if (msg.conversation) return { text: msg.conversation, contentType: 'text', mediaUrl: null }
  if (msg.extendedTextMessage?.text) return { text: msg.extendedTextMessage.text, contentType: 'text', mediaUrl: null }
  if (msg.imageMessage) return { text: msg.imageMessage.caption ?? null, contentType: 'image', mediaUrl: msg.imageMessage.url ?? null }
  if (msg.audioMessage) return { text: null, contentType: 'audio', mediaUrl: msg.audioMessage.url ?? null }
  if (msg.pttMessage) return { text: null, contentType: 'audio', mediaUrl: msg.pttMessage.url ?? null }
  if (msg.documentMessage) return { text: msg.documentMessage.title ?? null, contentType: 'document', mediaUrl: msg.documentMessage.url ?? null }
  return { text: null, contentType: 'text', mediaUrl: null }
}

async function handleMessageEvent(tenant: TenantRow, data: EvolutionMessageData): Promise<{ conversationId: string; whatsappMessageId: string } | null> {
  const envelope = readEnvelope(data)
  if (!envelope) {
    console.error('[webhook] payload de mensagem sem Info reconhecível:', JSON.stringify(data))
    return null
  }
  if (envelope.fromMe) return null
  if (envelope.isGroup || envelope.remoteJid.includes('@g.us')) return null

  const phoneNumber = extractNumber(envelope.remoteJid, envelope.remoteJidAlt)
  const { text, contentType, mediaUrl } = parseMessage(data)
  const adReferral = extractAdReferral(data)

  if (!text && contentType !== 'image' && contentType !== 'audio') return null
  if (tenant.status === 'suspended' || tenant.status === 'cancelled') return null

  const tenantId = tenant.id

  // Busca ou cria contato
  let contactId: string
  const existing = await db
    .select({ id: contacts.id })
    .from(contacts)
    .where(and(eq(contacts.tenantId, tenantId), eq(contacts.whatsappNumber, phoneNumber)))
    .limit(1)

  let existingContact = existing[0]
  if (!existingContact) {
    const normalized = normalizeBrazilianNumber(phoneNumber)
    if (normalized !== phoneNumber) {
      const fallback = await db
        .select({ id: contacts.id })
        .from(contacts)
        .where(and(eq(contacts.tenantId, tenantId), eq(contacts.whatsappNumber, normalized)))
        .limit(1)
      existingContact = fallback[0]
    }
  }

  if (existingContact) {
    contactId = existingContact.id
    await db
      .update(contacts)
      .set({ lastContactAt: new Date(), ...(envelope.pushName ? { whatsappName: envelope.pushName } : {}) })
      .where(eq(contacts.id, contactId))
  } else {
    const created = await db
      .insert(contacts)
      .values({ tenantId, whatsappNumber: phoneNumber, whatsappName: envelope.pushName ?? null, lastContactAt: new Date() })
      .returning({ id: contacts.id })
    contactId = created[0].id
  }

  // Busca ou cria conversa ativa
  const existingConvRows = await db
    .select({ id: conversations.id, status: conversations.status })
    .from(conversations)
    .where(and(eq(conversations.tenantId, tenantId), eq(conversations.contactId, contactId), ne(conversations.status, 'closed')))
    .orderBy(desc(conversations.createdAt))
    .limit(1)

  let conversationId: string
  let conversationStatus: string

  if (existingConvRows[0]) {
    conversationId = existingConvRows[0].id
    conversationStatus = existingConvRows[0].status
    await db.update(conversations).set({ lastMessageAt: new Date() }).where(eq(conversations.id, conversationId))
  } else {
    const agentRes = await pool.query<{ id: string }>(
      `select id from ai_agents where tenant_id = $1 and is_default = true and is_active = true limit 1`,
      [tenantId]
    )
    const stageRes = await pool.query<{ id: string }>(`select id from kanban_stages where tenant_id = $1 and slug = 'novo_lead' limit 1`, [tenantId])

    const created = await db
      .insert(conversations)
      .values({
        tenantId,
        contactId,
        aiAgentId: agentRes.rows[0]?.id ?? null,
        kanbanStageId: stageRes.rows[0]?.id ?? null,
        status: 'ai_handling',
        priority: 'normal',
        metadata: adReferral ? { source: 'ctwa_ad', ad_referral: adReferral } : {},
        lastMessageAt: new Date(),
        createdAt: new Date(),
      })
      .returning({ id: conversations.id, status: conversations.status })

    conversationId = created[0].id
    conversationStatus = created[0].status
  }

  // Para áudio: busca a mídia na Evolution Go e sobe pro Cloudinary
  let finalMediaUrl = mediaUrl
  if (contentType === 'audio' && tenant.evolution_api_url && tenant.evolution_api_key) {
    try {
      const evoUrl = tenant.evolution_api_url.replace(/\/$/, '')
      // tenant.evolution_api_key vem cru da query em findTenantByWebhookSecret — na prática é
      // sempre o texto CIFRADO (pgp_sym_encrypt), não a chave real. Sem descriptografar aqui,
      // o header `apikey` ia com o ciphertext e o fetch quebrava (ou a Evolution rejeitava),
      // então TODO áudio recebido por qualquer tenant com chave criptografada falhava ao baixar
      // a mídia — media_url ficava sempre null e a IA nunca conseguia transcrever nada. Mesma
      // descriptografia (com fallback pro valor cru) já usada em evolution-client.ts.
      let evoApiKey = tenant.evolution_api_key
      try {
        const decrypted = await getDecryptedEvolutionKey(tenantId, ENCRYPTION_KEY)
        if (decrypted) evoApiKey = decrypted
      } catch {
        // chave em texto plano ou sem criptografia — usa valor cru
      }
      const mediaRes = await fetch(`${evoUrl}/message/downloadmedia`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', apikey: evoApiKey },
        body: JSON.stringify({ message: data.Message }),
      })
      if (mediaRes.ok) {
        const mediaBody = (await mediaRes.json()) as any
        const dataUri: string | undefined = mediaBody?.data?.base64
        const match = dataUri?.match(/^data:([^;]+);base64,(.+)$/)
        if (match) {
          const [, mimeType, base64] = match
          const bytes = Buffer.from(base64, 'base64')
          finalMediaUrl = await uploadAudio(tenantId, envelope.id, bytes, mimeType)
        } else {
          console.error('[webhook] Resposta de downloadmedia sem base64 reconhecível:', JSON.stringify(mediaBody).slice(0, 500))
        }
      } else {
        console.error('[webhook] Erro downloadmedia:', await mediaRes.text())
      }
    } catch (err) {
      console.error('[webhook] Erro ao buscar mídia da Evolution Go:', err)
    }
  }

  // Salva mensagem do cliente
  await db.insert(messages).values({
    tenantId,
    conversationId,
    contactId,
    senderType: 'customer',
    content: text,
    contentType,
    mediaUrl: finalMediaUrl,
    whatsappMessageId: envelope.id,
    createdAt: new Date(),
  })

  // Cancela follow-ups pendentes do contato que respondeu
  await pool.query(`update follow_ups set status = 'replied' where contact_id = $1 and status = 'pending'`, [contactId])

  return conversationStatus === 'ai_handling' ? { conversationId, whatsappMessageId: envelope.id } : null
}

async function handleConnectionEvent(tenant: TenantRow, rawEventType: string, data: EvolutionConnectionData): Promise<void> {
  const t = rawEventType.toLowerCase()
  const connected = data.connected === true || data.state === 'open' || (t === 'connected' && data.state !== 'close')
  const disconnected = t === 'loggedout' || t === 'logged_out' || t === 'disconnected' || data.state === 'close'

  await pool.query(`update tenants set whatsapp_connected = $1 where id = $2`, [disconnected ? false : connected, tenant.id])
}

export async function findTenantByWebhookSecret(secret: string): Promise<TenantRow | null> {
  const res = await pool.query<TenantRow>(
    `select id, status, evolution_api_url, evolution_api_key, evolution_instance_name, webhook_secret
     from tenants where webhook_secret = $1`,
    [secret]
  )
  return res.rows[0] ?? null
}

/** Processa um evento já resolvido (tenant + payload) — chamado pela rota Fastify. */
export async function handleWebhookEvent(tenant: TenantRow, rawEventType: string, data: unknown): Promise<void> {
  const eventType = normalizeEventType(rawEventType)

  if (eventType === 'MESSAGE') {
    const result = await handleMessageEvent(tenant, data as EvolutionMessageData)
    if (result) {
      const { conversationId, whatsappMessageId } = result
      // Buffer de 6s pra agrupar mensagens rápidas do mesmo cliente — roda em
      // background, sem bloquear a resposta do webhook.
      setTimeout(() => {
        void (async () => {
          const latest = await pool.query<{ whatsapp_message_id: string | null }>(
            `select whatsapp_message_id from messages where conversation_id = $1 and sender_type = 'customer' order by created_at desc limit 1`,
            [conversationId]
          )
          if (latest.rows[0]?.whatsapp_message_id !== whatsappMessageId) return
          await processMessage(conversationId).catch((err) => console.error('[webhook] Erro ao processar mensagem:', err))
        })()
      }, 6000)
    }
    return
  }

  if (eventType === 'CONNECTION') {
    await handleConnectionEvent(tenant, rawEventType, data as EvolutionConnectionData)
  }
}
