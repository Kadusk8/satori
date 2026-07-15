'use server'

import { and, eq, gte, isNull } from 'drizzle-orm'
import { sql } from 'drizzle-orm'
import { withClaims } from '@/lib/db'
import { getDbClaims } from '@/lib/auth/session'
import {
  conversations,
  contacts,
  messages,
  products,
  users,
  tenants as tenantsTable,
} from '@/lib/db/schema'

export interface DashboardMetrics {
  conversasHoje: number
  novosLeads: number
  atendidasIaPct: number
  tempoMedioResposta: string
  uso: {
    mensagens: { used: number; max: number }
    produtos: { used: number; max: number }
    operadores: { used: number; max: number }
  }
  conversasRecentes: Array<{
    id: string
    name: string
    phone: string
    lastMessage: string | null
    status: string
    time: string
  }>
  leadsAnuncio: number
}

async function claimsOrThrow() {
  const c = await getDbClaims()
  if (!c) throw new Error('Sessão inválida.')
  return c
}

/**
 * Formata tempo relativo em português (ex: "2 min atrás", "1h atrás").
 * Simplificado pra não depender de date-fns aqui (já é usado em outros lugares).
 */
function formatTimeAgo(date: Date): string {
  const now = new Date()
  const diffMs = now.getTime() - date.getTime()
  const diffSecs = Math.floor(diffMs / 1000)
  const diffMins = Math.floor(diffSecs / 60)
  const diffHours = Math.floor(diffMins / 60)

  if (diffSecs < 60) return 'agora'
  if (diffMins < 60) return `${diffMins} min`
  if (diffHours < 24) return `${diffHours}h`
  const diffDays = Math.floor(diffHours / 24)
  return `${diffDays}d`
}

/**
 * Formata segundos em formato "Xm YYs" ou aproximado (ex: "4m 32s").
 * Se muito pequeno, retorna "< 1s".
 */
function formatSeconds(seconds: number): string {
  if (seconds < 1) return '< 1s'
  const mins = Math.floor(seconds / 60)
  const secs = Math.floor(seconds % 60)
  if (mins === 0) return `${secs}s`
  return `${mins}m ${secs}s`
}

/**
 * Retorna as métricas do dashboard do tenant (dados reais do banco).
 *
 * Métricas calculadas:
 * - conversasHoje: count de conversations com last_message_at >= início do dia (timezone tenant)
 * - novosLeads: count de contacts com first_contact_at >= início do dia
 * - atendidasIaPct: % de conversations sem assigned_to (IA tratou sozinha) hoje
 * - tempoMedioResposta: média do intervalo entre msg customer → msg ai/human
 *   Simplificação: se a query ficar cara, aproximar pela média de intervalo entre
 *   mensagens consecutivas do mesmo tipo em conversas do dia.
 * - uso: ler direto de tenants (max_*) e fazer count(*) das tabelas
 * - conversasRecentes: últimas 5 conversations JOIN contacts do dia
 * - leadsAnuncio: count de conversations com metadata->>'source'='ctwa_ad' hoje
 */
export async function getTenantDashboardMetrics(): Promise<DashboardMetrics> {
  const claims = await claimsOrThrow()

  // Buscar tenant pra obter timezone, limites e status
  const tenantData = await withClaims(claims, (tx) =>
    tx
      .select({
        timezone: tenantsTable.timezone,
        maxMessagesMonth: tenantsTable.maxMessagesMonth,
        messagesUsedMonth: tenantsTable.messagesUsedMonth,
        maxProducts: tenantsTable.maxProducts,
        maxOperators: tenantsTable.maxOperators,
      })
      .from(tenantsTable)
      .where(eq(tenantsTable.id, claims.tenant_id!))
      .limit(1)
  )

  if (!tenantData.length) {
    throw new Error('Tenant não encontrado.')
  }

  const tenant = tenantData[0]
  const tz = tenant.timezone

  // Calcular início do dia no timezone do tenant
  // Simplificação: usar Intl para converter "agora" pro timezone, depois zerar horas
  const now = new Date()
  const formatterTz = new Intl.DateTimeFormat('pt-BR', {
    timeZone: tz,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  })
  const partsTz = formatterTz.formatToParts(now)
  const dayTz = partsTz.find((p) => p.type === 'day')?.value || '01'
  const monthTz = partsTz.find((p) => p.type === 'month')?.value || '01'
  const yearTz = partsTz.find((p) => p.type === 'year')?.value || '2024'

  // Reconstruir data de início do dia em UTC
  // (não é 100% preciso, mas é simples e funciona pra a maioria dos timezones)
  const todayLocalStr = `${yearTz}-${monthTz}-${dayTz}T00:00:00`
  const todayLocal = new Date(todayLocalStr)
  // Estimar offset (simplificado — usar moment/date-fns em produção seria melhor)
  const offsetMs = now.getTime() - new Date(now.toLocaleString('en-US', { timeZone: tz })).getTime()
  const todayUtc = new Date(todayLocal.getTime() + offsetMs)

  // Conversas com última msg hoje
  const conversasHoje = await withClaims(claims, (tx) =>
    tx
      .select({ count: sql<number>`COUNT(*)` })
      .from(conversations)
      .where(
        and(
          eq(conversations.tenantId, claims.tenant_id!),
          gte(conversations.lastMessageAt, todayUtc)
        )
      )
  )

  // Novos leads (contacts com first_contact_at >= hoje)
  const novosLeads = await withClaims(claims, (tx) =>
    tx
      .select({ count: sql<number>`COUNT(*)` })
      .from(contacts)
      .where(
        and(
          eq(contacts.tenantId, claims.tenant_id!),
          gte(contacts.firstContactAt, todayUtc)
        )
      )
  )

  // % atendidas pela IA (conversas sem assigned_to) hoje
  const totalConvsHoje = conversasHoje[0]?.count || 0
  const aiHandledConvs = await withClaims(claims, (tx) =>
    tx
      .select({ count: sql<number>`COUNT(*)` })
      .from(conversations)
      .where(
        and(
          eq(conversations.tenantId, claims.tenant_id!),
          gte(conversations.lastMessageAt, todayUtc),
          isNull(conversations.assignedTo)
        )
      )
  )
  const atendidasIaPct =
    totalConvsHoje > 0
      ? Math.round(((aiHandledConvs[0]?.count || 0) / totalConvsHoje) * 100)
      : 0

  // Tempo médio de resposta (simplificado: média de intervalo entre mensagens)
  // Buscar todas as msgs de hoje e calcular intervalos
  const allMsgsToday = await withClaims(claims, (tx) =>
    tx
      .select({
        conversationId: messages.conversationId,
        senderType: messages.senderType,
        createdAt: messages.createdAt,
      })
      .from(messages)
      .where(
        and(
          eq(messages.tenantId, claims.tenant_id!),
          gte(messages.createdAt, todayUtc)
        )
      )
      .orderBy(messages.conversationId, messages.createdAt)
  )

  let totalResponseTimeMs = 0
  let responseCount = 0

  for (let i = 0; i < allMsgsToday.length - 1; i++) {
    const current = allMsgsToday[i]
    const next = allMsgsToday[i + 1]

    // Se atual é customer e próxima é ai/human na mesma conversa, contar intervalo
    if (
      current.conversationId === next.conversationId &&
      current.senderType === 'customer' &&
      (next.senderType === 'ai' || next.senderType === 'human')
    ) {
      const intervalMs = next.createdAt.getTime() - current.createdAt.getTime()
      if (intervalMs > 0) {
        totalResponseTimeMs += intervalMs
        responseCount++
      }
    }
  }

  const avgResponseTimeSecs = responseCount > 0 ? totalResponseTimeMs / responseCount / 1000 : 0
  const tempoMedioResposta = formatSeconds(avgResponseTimeSecs)

  // Uso do plano
  const prodCount = await withClaims(claims, (tx) =>
    tx
      .select({ count: sql<number>`COUNT(*)` })
      .from(products)
      .where(eq(products.tenantId, claims.tenant_id!))
  )

  const operatorCount = await withClaims(claims, (tx) =>
    tx
      .select({ count: sql<number>`COUNT(*)` })
      .from(users)
      .where(
        and(
          eq(users.tenantId, claims.tenant_id!),
          eq(users.role, 'operator')
        )
      )
  )

  const uso = {
    mensagens: {
      used: tenant.messagesUsedMonth,
      max: tenant.maxMessagesMonth,
    },
    produtos: {
      used: prodCount[0]?.count || 0,
      max: tenant.maxProducts,
    },
    operadores: {
      used: operatorCount[0]?.count || 0,
      max: tenant.maxOperators,
    },
  }

  // Conversas recentes (últimas 5 de hoje)
  const recentConvsRaw = await withClaims(claims, (tx) =>
    tx
      .select({
        conversationId: conversations.id,
        contactId: conversations.contactId,
        status: conversations.status,
        lastMessageAt: conversations.lastMessageAt,
        contactName: contacts.customName,
        contactWhatsapp: contacts.whatsappName,
        contactPhone: contacts.whatsappNumber,
      })
      .from(conversations)
      .innerJoin(contacts, eq(conversations.contactId, contacts.id))
      .where(
        and(
          eq(conversations.tenantId, claims.tenant_id!),
          gte(conversations.lastMessageAt, todayUtc)
        )
      )
      .orderBy(sql`${conversations.lastMessageAt} DESC`)
      .limit(5)
  )

  // Pra cada conversa, buscar última mensagem
  const conversasRecentes: DashboardMetrics['conversasRecentes'] = []
  for (const conv of recentConvsRaw) {
    const lastMsg = await withClaims(claims, (tx) =>
      tx
        .select({ content: messages.content })
        .from(messages)
        .where(
          and(
            eq(messages.conversationId, conv.conversationId),
            eq(messages.tenantId, claims.tenant_id!)
          )
        )
        .orderBy(sql`${messages.createdAt} DESC`)
        .limit(1)
    )

    conversasRecentes.push({
      id: conv.conversationId,
      name: conv.contactName || conv.contactWhatsapp || 'Contato',
      phone: conv.contactPhone,
      lastMessage: lastMsg[0]?.content || '(sem mensagens)',
      status: conv.status,
      time: formatTimeAgo(conv.lastMessageAt),
    })
  }

  // Leads de anúncio (metadata->>'source' = 'ctwa_ad' hoje)
  const leadsAnuncio = await withClaims(claims, (tx) =>
    tx
      .select({ count: sql<number>`COUNT(*)` })
      .from(conversations)
      .where(
        and(
          eq(conversations.tenantId, claims.tenant_id!),
          gte(conversations.lastMessageAt, todayUtc),
          eq(sql<string>`${conversations.metadata}->>'source'`, 'ctwa_ad')
        )
      )
  )

  return {
    conversasHoje: conversasHoje[0]?.count || 0,
    novosLeads: novosLeads[0]?.count || 0,
    atendidasIaPct,
    tempoMedioResposta,
    uso,
    conversasRecentes,
    leadsAnuncio: leadsAnuncio[0]?.count || 0,
  }
}
