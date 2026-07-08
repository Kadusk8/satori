'use server'

import { revalidatePath } from 'next/cache'
import { and, asc, desc, eq, inArray, isNull, ne, or, sql } from 'drizzle-orm'
import { withClaims } from '@/lib/db'
import { conversations, contacts, aiAgents, users, kanbanStages } from '@/lib/db/schema'
import { getDbClaims } from '@/lib/auth/session'
import { isManager } from '@/lib/auth/permissions'
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

export interface KanbanViewer {
  id: string
  role: string
  isAvailable: boolean
}

export async function listKanban(): Promise<{
  stages: DBStage[]
  conversations: DBConversation[]
  tenantId: string
  viewer: KanbanViewer
}> {
  const claims = await claimsOrThrow()

  return withClaims(claims, async (tx) => {
    const viewerRows = await tx
      .select({ id: users.id, role: users.role, isAvailable: users.isAvailable })
      .from(users)
      .where(eq(users.id, claims.sub))
      .limit(1)
    const viewer: KanbanViewer = viewerRows[0]
      ? viewerRows[0]
      : { id: claims.sub, role: claims.user_role ?? 'operator', isAvailable: false }

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
      .where(
        and(
          eq(conversations.tenantId, claims.tenant_id!),
          ne(conversations.status, 'closed'),
          // Vendedor só vê as suas + escaladas sem dono ainda (fallback de time
          // pequeno) — nunca as que a IA ainda está atendendo sem dono nem as
          // de outro vendedor. Owner/admin veem tudo.
          isManager(viewer.role)
            ? undefined
            : or(
                eq(conversations.assignedTo, claims.sub),
                and(isNull(conversations.assignedTo), inArray(conversations.status, ['waiting_human', 'human_handling']))
              )
        )
      )
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

    return { stages: stageRows, conversations: convs, tenantId: claims.tenant_id!, viewer }
  })
}

/** Vendedor só move card de conversa própria ou sem dono; manager move qualquer uma. */
async function assertCanTouchConversation(
  tx: Parameters<Parameters<typeof withClaims>[1]>[0],
  claims: Awaited<ReturnType<typeof claimsOrThrow>>,
  conversationId: string
): Promise<void> {
  if (isManager(claims.user_role)) return
  const rows = await tx
    .select({ assignedTo: conversations.assignedTo, tenantId: conversations.tenantId })
    .from(conversations)
    .where(eq(conversations.id, conversationId))
    .limit(1)
  const conv = rows[0]
  if (!conv || conv.tenantId !== claims.tenant_id) throw new Error('Conversa não encontrada.')
  if (conv.assignedTo && conv.assignedTo !== claims.sub) throw new Error('Esta conversa está com outro vendedor.')
}

export async function moveConversation(conversationId: string, newStageId: string): Promise<void> {
  const claims = await claimsOrThrow()
  await withClaims(claims, async (tx) => {
    await assertCanTouchConversation(tx, claims, conversationId)
    await tx.update(conversations).set({ kanbanStageId: newStageId }).where(eq(conversations.id, conversationId))
  })
  revalidatePath('/conversations')
  await triggerEvent(tenantChannel(claims.tenant_id!), 'conversation:changed', { conversationId })
}

/** Reatribui manualmente uma conversa a um vendedor — só owner/admin. */
export async function reassignConversation(conversationId: string, userId: string | null): Promise<void> {
  const claims = await claimsOrThrow()
  if (!isManager(claims.user_role)) throw new Error('Sem permissão para reatribuir conversas.')
  await withClaims(claims, (tx) =>
    tx
      .update(conversations)
      .set({ assignedTo: userId, autonomousMode: false })
      .where(and(eq(conversations.id, conversationId), eq(conversations.tenantId, claims.tenant_id!)))
  )
  revalidatePath('/conversations')
  await triggerEvent(tenantChannel(claims.tenant_id!), 'conversation:changed', { conversationId })
}

/** Lista vendedores ativos do tenant, pra popular o seletor de reatribuição manual. */
export async function listVendors(): Promise<Array<{ id: string; fullName: string; isAvailable: boolean }>> {
  const claims = await claimsOrThrow()
  return withClaims(claims, (tx) =>
    tx
      .select({ id: users.id, fullName: users.fullName, isAvailable: users.isAvailable })
      .from(users)
      .where(and(eq(users.tenantId, claims.tenant_id!), eq(users.role, 'operator'), eq(users.active, true)))
      .orderBy(asc(users.fullName))
  )
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
