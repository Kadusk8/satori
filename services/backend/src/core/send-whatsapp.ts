// Lógica de envio de mensagem via Evolution + registro no banco.
// Porta de supabase/functions/send-whatsapp/index.ts. Usada tanto pela rota
// HTTP (POST /send-whatsapp, chamada pelo Next.js) quanto internamente pelo
// cron de follow-ups — nesse caso, chamada de função direta, sem HTTP hop.

import { eq } from 'drizzle-orm'
import { db } from '../db/index.js'
import { conversations, messages } from '../db/schema.js'
import { getEvolutionClient } from '../shared/evolution-client.js'

const ENCRYPTION_KEY = process.env.ENCRYPTION_KEY ?? null

export interface SendWhatsAppPayload {
  tenantId: string
  to: string
  type: 'text' | 'image' | 'document' | 'audio' | 'location'
  text?: string
  /** URL pública da mídia (Cloudinary) — usado para image/document/audio. */
  mediaUrl?: string
  caption?: string
  /** Usado só para type=location. */
  latitude?: number
  longitude?: number
  locationName?: string
  conversationId?: string
}

export async function sendWhatsAppMessage(payload: SendWhatsAppPayload): Promise<{ whatsappMessageId: string | null }> {
  const { tenantId, to, type, text, mediaUrl, caption, latitude, longitude, locationName, conversationId } = payload

  const evo = await getEvolutionClient(tenantId, ENCRYPTION_KEY)

  let whatsappMessageId: string | null = null
  if (type === 'text') {
    if (!text) throw new Error('text obrigatório para type=text')
    whatsappMessageId = await evo.sendText(to, text)
  } else if (type === 'image' || type === 'document' || type === 'audio') {
    if (!mediaUrl) throw new Error(`mediaUrl obrigatório para type=${type}`)
    whatsappMessageId = await evo.sendMedia(to, mediaUrl, caption, type)
  } else if (type === 'location') {
    if (latitude == null || longitude == null) throw new Error('latitude e longitude obrigatórios para type=location')
    whatsappMessageId = await evo.sendLocation(to, latitude, longitude, locationName, caption)
  } else {
    throw new Error('type deve ser text, image, document, audio ou location')
  }

  if (conversationId) {
    const conv = await db
      .select({ contactId: conversations.contactId })
      .from(conversations)
      .where(eq(conversations.id, conversationId))
      .limit(1)

    if (conv[0]) {
      await db.insert(messages).values({
        tenantId,
        conversationId,
        contactId: conv[0].contactId,
        senderType: 'ai',
        content: type === 'text' ? (text ?? null) : type === 'location' ? `📍 ${locationName ?? caption ?? 'Localização enviada'}` : caption ?? null,
        contentType: type,
        mediaUrl: type === 'text' || type === 'location' ? null : mediaUrl ?? null,
        whatsappMessageId,
      })

      await db.update(conversations).set({ lastMessageAt: new Date() }).where(eq(conversations.id, conversationId))
    }
  }

  return { whatsappMessageId }
}
