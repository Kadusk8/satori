'use server'

import { revalidatePath } from 'next/cache'
import { and, asc, desc, eq, ne, sql } from 'drizzle-orm'
import { withClaims } from '@/lib/db'
import { conversations, contacts, aiAgents, users, kanbanStages } from '@/lib/db/schema'
import { getDbClaims } from '@/lib/auth/session'
import { triggerEvent, tenantChannel } from '@/lib/realtime/server'

export interface DBStage {
  id: string; name: string; slug: string; color: string; position: number; is_closed: boolean
}
export interface DBConversation {
  id: string; status: string; priority: string; last_message_at: string; kanban_stage_id: string | null
  ai_agents: { name: string } | null
  contacts: { id: string; whatsapp_name: string | null; custom_name: string | null; whatsapp_number: string }
  users: { id: string; full_name: string } | null
  messages: { content: string | null }[]
}

async function claimsOrThrow() {
  const c = await getDbClaims()
  if (!c?.tenant_id) throw new Error('Tenant não identificado.')
  return c
}

export async function listKanban(): Promise<{ stages: DBStage[]; conversations: DBConversation[]; tenantId: string }> {
  const claims = await claimsOrThrow()

  return withClaims(claims, async (tx) => {
    const stageRows = await tx
      .select({
        id: kanbanStages.id,
        name: kanbanStages.name,
        slug: kanbanStages.slug,
        color: kanbanStages.color,
        position: kanbanStages.position,
        is_closed: kanbanStages.isClosed,
      })
      .from(kanbanStages)
      .where(eq(kanbanStages.tenantId, claims.tenant_id!))
      .orderBy(asc(kanbanStages.position))

    const convRows = await tx
      .select({
        id: conversations.id,
        status: conversations.status,
        priority: conversations.priority,
        last_message_at: conversations.lastMessageAt,
        kanban_stage_id: conversations.kanbanStageId,
        agent_name: aiAgents.name,
        contact_id: contacts.id,
        whatsapp_name: contacts.whatsappName,
        custom_name: contacts.customName,
        whatsapp_number: contacts.whatsappNumber,
        assigned_id: users.id,
        assigned_name: users.fullName,
        last_message: sql<string | null>`(select content from messages m where m.conversation_id = ${conversations.id} order by m.created_at desc limit 1)`,
      })
      .from(conversations)
      .leftJoin(aiAgents, eq(aiAgents.id, conversations.aiAgentId))
      .innerJoin(contacts, eq(contacts.id, conversations.contactId))
      .leftJoin(users, eq(users.id, conversations.assignedTo))
      .where(and(eq(conversations.tenantId, claims.tenant_id!), ne(conversations.status, 'closed')))
      .orderBy(desc(conversations.lastMessageAt))
      .limit(200)

    const convs: DBConversation[] = convRows.map((r) => ({
      id: r.id,
      status: r.status,
      priority: r.priority,
      last_message_at: (r.last_message_at instanceof Date ? r.last_message_at : new Date(r.last_message_at)).toISOString(),
      kanban_stage_id: r.kanban_stage_id,
      ai_agents: r.agent_name ? { name: r.agent_name } : null,
      contacts: {
        id: r.contact_id,
        whatsapp_name: r.whatsapp_name,
        custom_name: r.custom_name,
        whatsapp_number: r.whatsapp_number,
      },
      users: r.assigned_id ? { id: r.assigned_id, full_name: r.assigned_name! } : null,
      messages: r.last_message !== null ? [{ content: r.last_message }] : [],
    }))

    return { stages: stageRows, conversations: convs, tenantId: claims.tenant_id! }
  })
}

export async function moveConversation(conversationId: string, newStageId: string): Promise<void> {
  const claims = await claimsOrThrow()
  await withClaims(claims, (tx) =>
    tx.update(conversations).set({ kanbanStageId: newStageId }).where(eq(conversations.id, conversationId))
  )
  revalidatePath('/conversations')
  await triggerEvent(tenantChannel(claims.tenant_id!), 'conversation:changed', { conversationId })
}

export async function getWaitingCount(): Promise<number> {
  const claims = await claimsOrThrow()
  const rows = await withClaims(claims, (tx) =>
    tx
      .select({ id: conversations.id })
      .from(conversations)
      .where(and(eq(conversations.tenantId, claims.tenant_id!), eq(conversations.status, 'waiting_human')))
  )
  return rows.length
}
