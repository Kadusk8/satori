import { NextRequest, NextResponse } from 'next/server'
import { and, eq } from 'drizzle-orm'
import { withClaims } from '@/lib/db'
import { conversations, contacts, messages } from '@/lib/db/schema'
import { getDbClaims } from '@/lib/auth/session'
import { triggerEvent, tenantChannel, conversationChannel } from '@/lib/realtime/server'

// Envio ao WhatsApp fica no serviço backend (Portainer, Fase 5). Guardado por
// env: se não configurado, a mensagem é salva mas não sai pelo WhatsApp.
const BACKEND_URL = process.env.BACKEND_URL
const BACKEND_TOKEN = process.env.BACKEND_TOKEN

export async function POST(request: NextRequest) {
  const claims = await getDbClaims()
  if (!claims?.tenant_id) {
    return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })
  }

  const body = await request.json()
  const { conversationId, text } = body
  if (!conversationId || !text?.trim()) {
    return NextResponse.json({ error: 'conversationId e text são obrigatórios' }, { status: 400 })
  }

  const result = await withClaims(claims, async (tx) => {
    const conv = await tx
      .select({
        id: conversations.id,
        status: conversations.status,
        tenantId: conversations.tenantId,
        contactId: conversations.contactId,
        whatsappNumber: contacts.whatsappNumber,
      })
      .from(conversations)
      .innerJoin(contacts, eq(contacts.id, conversations.contactId))
      .where(and(eq(conversations.id, conversationId), eq(conversations.tenantId, claims.tenant_id!)))
      .limit(1)

    if (!conv[0]) return { error: 'Conversa não encontrada', status: 404 as const }
    if (conv[0].status === 'closed') return { error: 'Conversa encerrada', status: 400 as const }

    const inserted = await tx
      .insert(messages)
      .values({
        tenantId: conv[0].tenantId,
        conversationId,
        contactId: conv[0].contactId,
        senderType: 'human',
        senderId: claims.sub,
        content: text.trim(),
        contentType: 'text',
      })
      .returning({
        id: messages.id,
        sender_type: messages.senderType,
        content: messages.content,
        content_type: messages.contentType,
        media_url: messages.mediaUrl,
        created_at: messages.createdAt,
        contact_id: messages.contactId,
      })

    await tx
      .update(conversations)
      .set({ lastMessageAt: new Date() })
      .where(eq(conversations.id, conversationId))

    return {
      tenantId: conv[0].tenantId,
      whatsappNumber: conv[0].whatsappNumber,
      message: { ...inserted[0], created_at: inserted[0].created_at.toISOString() },
    }
  })

  if ('error' in result) {
    return NextResponse.json({ error: result.error }, { status: result.status })
  }

  await triggerEvent(conversationChannel(conversationId), 'message:new', result.message)
  await triggerEvent(tenantChannel(result.tenantId), 'conversation:changed', { conversationId })

  // Dispara o envio ao WhatsApp pelo serviço backend (best-effort).
  if (BACKEND_URL) {
    try {
      await fetch(`${BACKEND_URL}/send-whatsapp`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(BACKEND_TOKEN ? { Authorization: `Bearer ${BACKEND_TOKEN}` } : {}),
        },
        body: JSON.stringify({
          tenantId: result.tenantId,
          to: result.whatsappNumber,
          type: 'text',
          text: text.trim(),
        }),
      })
    } catch (err) {
      console.error('[send-message] falha ao enviar WhatsApp:', err)
      // Mensagem já salva — não falha a request.
    }
  }

  return NextResponse.json({ success: true })
}
