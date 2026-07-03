'use server'

import { revalidatePath } from 'next/cache'
import { and, asc, eq } from 'drizzle-orm'
import { withClaims } from '@/lib/db'
import { conversations, contacts, aiAgents, users, messages } from '@/lib/db/schema'
import { getDbClaims } from '@/lib/auth/session'
import { triggerEvent, tenantChannel } from '@/lib/realtime/server'

export interface ChatConversation {
  id: string; status: string; priority: string
  ai_agents: { name: string } | null
  contacts: { id: string; whatsapp_name: string | null; custom_name: string | null; whatsapp_number: string }
  users: { id: string; full_name: string } | null
}
export interface ChatMessageRow {
  id: string; sender_type: string; content: string | null; content_type: string
  media_url: string | null; created_at: string; contact_id: string
}

async function claimsOrThrow() {
  const c = await getDbClaims()
  if (!c?.tenant_id) throw new Error('Tenant não identificado.')
  return c
}

export async function getChat(conversationId: string): Promise<{ conversation: ChatConversation; messages: ChatMessageRow[] } | null> {
  const claims = await claimsOrThrow()
  return withClaims(claims, async (tx) => {
    const convRows = await tx
      .select({
        id: conversations.id,
        status: conversations.status,
        priority: conversations.priority,
        agent_name: aiAgents.name,
        contact_id: contacts.id,
        whatsapp_name: contacts.whatsappName,
        custom_name: contacts.customName,
        whatsapp_number: contacts.whatsappNumber,
        assigned_id: users.id,
        assigned_name: users.fullName,
      })
      .from(conversations)
      .leftJoin(aiAgents, eq(aiAgents.id, conversations.aiAgentId))
      .innerJoin(contacts, eq(contacts.id, conversations.contactId))
      .leftJoin(users, eq(users.id, conversations.assignedTo))
      .where(eq(conversations.id, conversationId))
      .limit(1)

    if (!convRows[0]) return null
    const r = convRows[0]
    const conversation: ChatConversation = {
      id: r.id,
      status: r.status,
      priority: r.priority,
      ai_agents: r.agent_name ? { name: r.agent_name } : null,
      contacts: { id: r.contact_id, whatsapp_name: r.whatsapp_name, custom_name: r.custom_name, whatsapp_number: r.whatsapp_number },
      users: r.assigned_id ? { id: r.assigned_id, full_name: r.assigned_name! } : null,
    }

    const msgRows = await tx
      .select({
        id: messages.id,
        sender_type: messages.senderType,
        content: messages.content,
        content_type: messages.contentType,
        media_url: messages.mediaUrl,
        created_at: messages.createdAt,
        contact_id: messages.contactId,
      })
      .from(messages)
      .where(eq(messages.conversationId, conversationId))
      .orderBy(asc(messages.createdAt))
      .limit(100)

    const rows: ChatMessageRow[] = msgRows.map((m) => ({
      ...m,
      created_at: (m.created_at instanceof Date ? m.created_at : new Date(m.created_at)).toISOString(),
    }))

    return { conversation, messages: rows }
  })
}

export async function assumeConversation(conversationId: string): Promise<void> {
  const claims = await claimsOrThrow()
  await withClaims(claims, (tx) =>
    tx.update(conversations).set({ status: 'human_handling' }).where(eq(conversations.id, conversationId))
  )
  revalidatePath(`/chat/${conversationId}`)
  await triggerEvent(tenantChannel(claims.tenant_id!), 'conversation:changed', { conversationId })
}

export async function closeConversation(conversationId: string): Promise<void> {
  const claims = await claimsOrThrow()
  await withClaims(claims, (tx) =>
    tx.update(conversations).set({ status: 'closed', closedAt: new Date() }).where(eq(conversations.id, conversationId))
  )
  revalidatePath('/conversations')
  await triggerEvent(tenantChannel(claims.tenant_id!), 'conversation:changed', { conversationId })
}

export interface DrawerDetail {
  id: string; status: string; started_at: string; last_message_at: string
  ai_agents: { name: string } | null
  contacts: {
    id: string; whatsapp_number: string; whatsapp_name: string | null; custom_name: string | null
    email: string | null; tags: string[] | null; first_contact_at: string | null
    last_contact_at: string | null; notes: string | null
  }
}

/** Detalhe da conversa + contato + mensagens, para o drawer do kanban. */
export async function getConversationDrawer(conversationId: string): Promise<{ detail: DrawerDetail; messages: ChatMessageRow[] } | null> {
  const claims = await claimsOrThrow()
  return withClaims(claims, async (tx) => {
    const rows = await tx
      .select({
        id: conversations.id,
        status: conversations.status,
        started_at: conversations.startedAt,
        last_message_at: conversations.lastMessageAt,
        agent_name: aiAgents.name,
        c_id: contacts.id,
        c_number: contacts.whatsappNumber,
        c_wname: contacts.whatsappName,
        c_custom: contacts.customName,
        c_email: contacts.email,
        c_tags: contacts.tags,
        c_first: contacts.firstContactAt,
        c_last: contacts.lastContactAt,
        c_notes: contacts.notes,
      })
      .from(conversations)
      .leftJoin(aiAgents, eq(aiAgents.id, conversations.aiAgentId))
      .innerJoin(contacts, eq(contacts.id, conversations.contactId))
      .where(eq(conversations.id, conversationId))
      .limit(1)

    if (!rows[0]) return null
    const r = rows[0]
    const iso = (d: Date | string | null) => (d === null ? null : (d instanceof Date ? d : new Date(d)).toISOString())
    const detail: DrawerDetail = {
      id: r.id,
      status: r.status,
      started_at: iso(r.started_at)!,
      last_message_at: iso(r.last_message_at)!,
      ai_agents: r.agent_name ? { name: r.agent_name } : null,
      contacts: {
        id: r.c_id, whatsapp_number: r.c_number, whatsapp_name: r.c_wname, custom_name: r.c_custom,
        email: r.c_email, tags: r.c_tags ?? null, first_contact_at: iso(r.c_first),
        last_contact_at: iso(r.c_last), notes: r.c_notes,
      },
    }

    const msgs = await getMessagesInTx(tx, conversationId)
    return { detail, messages: msgs }
  })
}

// helper interno pra reusar a query de mensagens dentro de uma transação
async function getMessagesInTx(tx: Parameters<Parameters<typeof withClaims>[1]>[0], conversationId: string): Promise<ChatMessageRow[]> {
  const rows = await tx
    .select({
      id: messages.id,
      sender_type: messages.senderType,
      content: messages.content,
      content_type: messages.contentType,
      media_url: messages.mediaUrl,
      created_at: messages.createdAt,
      contact_id: messages.contactId,
    })
    .from(messages)
    .where(eq(messages.conversationId, conversationId))
    .orderBy(asc(messages.createdAt))
    .limit(100)
  return rows.map((m) => ({
    ...m,
    created_at: (m.created_at instanceof Date ? m.created_at : new Date(m.created_at)).toISOString(),
  }))
}

// Polling leve das mensagens até o realtime (Fase 4) — o chat pode chamar
// periodicamente pra trazer mensagens novas sem websocket.
export async function getMessagesSince(conversationId: string): Promise<ChatMessageRow[]> {
  const claims = await claimsOrThrow()
  const rows = await withClaims(claims, (tx) =>
    tx
      .select({
        id: messages.id,
        sender_type: messages.senderType,
        content: messages.content,
        content_type: messages.contentType,
        media_url: messages.mediaUrl,
        created_at: messages.createdAt,
        contact_id: messages.contactId,
      })
      .from(messages)
      .where(and(eq(messages.conversationId, conversationId)))
      .orderBy(asc(messages.createdAt))
      .limit(100)
  )
  return rows.map((m) => ({
    ...m,
    created_at: (m.created_at instanceof Date ? m.created_at : new Date(m.created_at)).toISOString(),
  }))
}
