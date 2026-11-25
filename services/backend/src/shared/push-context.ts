// Leituras de banco usadas pelo envio de push. Separadas do push-sender pra
// serem substituíveis nos testes. Todas filtram por tenantId — o backend roda
// como service_role (BYPASSRLS), então o isolamento é responsabilidade daqui.

import { and, eq, inArray, sql } from 'drizzle-orm'
import { db } from '../db/index.js'
import { conversations, pushSubscriptions, tenants, users } from '../db/schema.js'
import type { UserPushPrefs } from './push-preferences.js'

export async function loadRecipientPrefs(tenantId: string, userIds: string[]): Promise<UserPushPrefs[]> {
  const rows = await db
    .select({
      userId: users.id,
      onlyAssigned: users.pushOnlyAssigned,
      quietStart: users.pushQuietStart,
      quietEnd: users.pushQuietEnd,
    })
    .from(users)
    .where(and(eq(users.tenantId, tenantId), eq(users.active, true), inArray(users.id, userIds)))
  return rows
}

export async function loadTenantTimezone(tenantId: string): Promise<string> {
  const [row] = await db.select({ timezone: tenants.timezone }).from(tenants).where(eq(tenants.id, tenantId)).limit(1)
  return row?.timezone ?? 'America/Sao_Paulo'
}

/** Mesma contagem do badge da sidebar (getWaitingCount no apps/web). */
export async function countWaitingConversations(tenantId: string): Promise<number> {
  const [row] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(conversations)
    .where(and(eq(conversations.tenantId, tenantId), eq(conversations.status, 'waiting_human')))
  return row?.n ?? 0
}

export type StoredSubscription = { endpoint: string; keysP256dh: string; keysAuth: string }

export async function loadSubscriptions(tenantId: string, userIds: string[]): Promise<StoredSubscription[]> {
  return db
    .select({ endpoint: pushSubscriptions.endpoint, keysP256dh: pushSubscriptions.keysP256dh, keysAuth: pushSubscriptions.keysAuth })
    .from(pushSubscriptions)
    .where(and(eq(pushSubscriptions.tenantId, tenantId), inArray(pushSubscriptions.userId, userIds)))
}

export async function deleteSubscription(endpoint: string): Promise<void> {
  await db.delete(pushSubscriptions).where(eq(pushSubscriptions.endpoint, endpoint))
}
