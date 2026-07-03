// Lógica de envio de mensagem via Evolution + registro no banco.
// Porta de supabase/functions/send-whatsapp/index.ts. Usada tanto pela rota
// HTTP (POST /send-whatsapp, chamada pelo Next.js) quanto internamente pelo
// cron de follow-ups — nesse caso, chamada de função direta, sem HTTP hop.

import { eq } from 'drizzle-orm'
import { db } from '../db/index.js'
import { conversations, messages } from '../db/schema.js'
import { getEvolutionClient } from '../shared/evolution-client.js'

export interface SendWhatsAppPayload {
  tenantId: string
  to: string
  type: 'text' | 'image'
  text?: string
  imageUrl?: string
  caption?: string
  conversationId?: string
}

export async function sendWhatsAppMessage(payload: SendWhatsAppPayload): Promise<{ whatsappMessageId: string | null }> {
  const { tenantId, to, type, text, imageUrl, caption, conversationId } = payload

  const evo = await getEvolutionClient(tenantId)

  let whatsappMessageId: string | null = null
  if (type === 'text') {
    if (!text) throw new Error('text obrigatório para type=text')
    whatsappMessageId = await evo.sendText(to, text)
  } else if (type === 'image') {
    if (!imageUrl) throw new Error('imageUrl obrigatório para type=image')
    whatsappMessageId = await evo.sendMedia(to, imageUrl, caption)
  } else {
    throw new Error('type deve ser text ou image')
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
        content: type === 'text' ? (text ?? null) : caption ?? null,
        contentType: type === 'text' ? 'text' : 'image',
        mediaUrl: type === 'image' ? imageUrl ?? null : null,
        whatsappMessageId,
      })

      await db.update(conversations).set({ lastMessageAt: new Date() }).where(eq(conversations.id, conversationId))
    }
  }

  return { whatsappMessageId }
}
