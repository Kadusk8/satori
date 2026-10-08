// Histórico do cliente: visitas, valores, quem atendeu e score.
// Chamado só por Server Components (página de contatos e detalhe do contato).

import { and, desc, eq, inArray, sql } from 'drizzle-orm'
import { withClaims, type DbClaims } from '@/lib/db'
import {
  appointments,
  appointmentServices,
  clientScoreRules,
  contacts,
  users,
} from '@/lib/db/schema'
import {
  clientStatus,
  computeScore,
  rulesFromRow,
  tierFor,
  windowStartDate,
  type ClientStatus,
  type ScoreRules,
  type ScoreTier,
} from '@/lib/client-score'

type Tx = Parameters<Parameters<typeof withClaims>[1]>[0]

export interface ClientSummary {
  visits: number
  noShows: number
  totalSpent: number
  averageTicket: number
  firstVisit: string | null
  lastVisit: string | null
  score: number
  tier: ScoreTier | null
  status: ClientStatus
}

export async function loadScoreRules(tx: Tx, tenantId: string): Promise<ScoreRules> {
  const rows = await tx
    .select()
    .from(clientScoreRules)
    .where(eq(clientScoreRules.tenantId, tenantId))
    .limit(1)
  return rulesFromRow(rows[0])
}

/**
 * Resumo de cada contato do tenant (ou só dos `contactIds` informados).
 * Contatos sem nenhum atendimento ficam de fora do Map — use `summaryOrEmpty`.
 */
async function computeSummaries(
  tx: Tx,
  tenantId: string,
  contactIds?: string[]
): Promise<{ rules: ScoreRules; summaries: Map<string, ClientSummary> }> {
  const rules = await loadScoreRules(tx, tenantId)
  // Sem janela: data mínima, pra usar o mesmo FILTER nos dois casos.
  const cutoff = windowStartDate(rules) ?? '0001-01-01'

  const contactFilter = contactIds ? inArray(appointments.contactId, contactIds) : undefined

  const visitRows = await tx
    .select({
      contactId: appointments.contactId,
      visits: sql<number>`count(*) filter (where ${appointments.status} = 'completed')::int`,
      noShows: sql<number>`count(*) filter (where ${appointments.status} = 'no_show')::int`,
      wVisits: sql<number>`count(*) filter (where ${appointments.status} = 'completed' and ${appointments.date} >= ${cutoff})::int`,
      wNoShows: sql<number>`count(*) filter (where ${appointments.status} = 'no_show' and ${appointments.date} >= ${cutoff})::int`,
      firstVisit: sql<string | null>`min(${appointments.date}) filter (where ${appointments.status} = 'completed')`,
      lastVisit: sql<string | null>`max(${appointments.date}) filter (where ${appointments.status} = 'completed')`,
    })
    .from(appointments)
    .where(and(eq(appointments.tenantId, tenantId), contactFilter))
    .groupBy(appointments.contactId)

  const serviceRows = await tx
    .select({
      contactId: appointments.contactId,
      productId: appointmentServices.productId,
      total: sql<string>`coalesce(sum(${appointmentServices.price}), 0)`,
      wTotal: sql<string>`coalesce(sum(${appointmentServices.price}) filter (where ${appointments.date} >= ${cutoff}), 0)`,
      wCount: sql<number>`count(*) filter (where ${appointments.date} >= ${cutoff})::int`,
    })
    .from(appointmentServices)
    .innerJoin(appointments, eq(appointments.id, appointmentServices.appointmentId))
    .where(and(eq(appointments.tenantId, tenantId), eq(appointments.status, 'completed'), contactFilter))
    .groupBy(appointments.contactId, appointmentServices.productId)

  const spend = new Map<string, { total: number; wTotal: number; servicesCount: Record<string, number> }>()
  for (const r of serviceRows) {
    const acc = spend.get(r.contactId) ?? { total: 0, wTotal: 0, servicesCount: {} }
    acc.total += Number(r.total)
    acc.wTotal += Number(r.wTotal)
    if (r.productId) acc.servicesCount[r.productId] = (acc.servicesCount[r.productId] ?? 0) + r.wCount
    spend.set(r.contactId, acc)
  }

  const summaries = new Map<string, ClientSummary>()
  for (const v of visitRows) {
    const s = spend.get(v.contactId) ?? { total: 0, wTotal: 0, servicesCount: {} }
    const score = computeScore(
      { visits: v.wVisits, noShows: v.wNoShows, totalSpent: s.wTotal, servicesCount: s.servicesCount },
      rules
    )
    summaries.set(v.contactId, {
      visits: v.visits,
      noShows: v.noShows,
      totalSpent: s.total,
      averageTicket: v.visits > 0 ? s.total / v.visits : 0,
      firstVisit: v.firstVisit,
      lastVisit: v.lastVisit,
      score,
      tier: tierFor(score, rules.tiers),
      status: clientStatus(v.lastVisit, rules),
    })
  }

  return { rules, summaries }
}

export function summaryOrEmpty(summary: ClientSummary | undefined, rules: ScoreRules): ClientSummary {
  if (summary) return summary
  // Sem atendimento nenhum: score 0 (penalidades nunca deixam negativo)
  const score = 0
  return {
    visits: 0,
    noShows: 0,
    totalSpent: 0,
    averageTicket: 0,
    firstVisit: null,
    lastVisit: null,
    score,
    tier: tierFor(score, rules.tiers),
    status: 'novo',
  }
}

export async function getClientSummaries(claims: DbClaims) {
  return withClaims(claims, (tx) => computeSummaries(tx, claims.tenant_id!))
}

// ── Detalhe de um contato ─────────────────────────────────────────────────────

export interface ClientHistoryEntry {
  appointmentId: string
  date: string
  startTime: string
  title: string | null
  status: string
  notes: string | null
  total: number
  services: { name: string; price: number; professionalName: string | null }[]
}

export interface ClientDetail {
  contact: {
    id: string
    name: string
    whatsappNumber: string
    whatsappName: string | null
    customName: string | null
    email: string | null
    phone: string | null
    birthDate: string | null
    document: string | null
    address: string | null
    notes: string | null
    tags: string[]
    firstContactAt: string
  }
  summary: ClientSummary
  topService: string | null
  topProfessional: string | null
  history: ClientHistoryEntry[]
}

export async function getClientDetail(claims: DbClaims, contactId: string): Promise<ClientDetail | null> {
  return withClaims(claims, async (tx) => {
    const [c] = await tx
      .select()
      .from(contacts)
      .where(and(eq(contacts.id, contactId), eq(contacts.tenantId, claims.tenant_id!)))
      .limit(1)
    if (!c) return null

    const { rules, summaries } = await computeSummaries(tx, claims.tenant_id!, [contactId])

    const appts = await tx
      .select({
        id: appointments.id,
        date: appointments.date,
        startTime: appointments.startTime,
        title: appointments.title,
        status: appointments.status,
        notes: appointments.notes,
      })
      .from(appointments)
      .where(and(eq(appointments.contactId, contactId), eq(appointments.tenantId, claims.tenant_id!)))
      .orderBy(desc(appointments.date), desc(appointments.startTime))

    const services = appts.length
      ? await tx
          .select({
            appointmentId: appointmentServices.appointmentId,
            name: appointmentServices.serviceName,
            price: appointmentServices.price,
            professionalName: users.fullName,
          })
          .from(appointmentServices)
          .leftJoin(users, eq(users.id, appointmentServices.professionalId))
          .where(inArray(appointmentServices.appointmentId, appts.map((a) => a.id)))
      : []

    const byAppt = new Map<string, ClientHistoryEntry['services']>()
    const serviceFreq = new Map<string, number>()
    const proFreq = new Map<string, number>()
    const completedIds = new Set(appts.filter((a) => a.status === 'completed').map((a) => a.id))
    for (const s of services) {
      const list = byAppt.get(s.appointmentId) ?? []
      list.push({ name: s.name, price: Number(s.price), professionalName: s.professionalName })
      byAppt.set(s.appointmentId, list)
      if (completedIds.has(s.appointmentId)) {
        serviceFreq.set(s.name, (serviceFreq.get(s.name) ?? 0) + 1)
        if (s.professionalName) proFreq.set(s.professionalName, (proFreq.get(s.professionalName) ?? 0) + 1)
      }
    }

    const mostFrequent = (m: Map<string, number>) =>
      [...m.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null

    return {
      contact: {
        id: c.id,
        name: c.customName ?? c.whatsappName ?? c.whatsappNumber,
        whatsappNumber: c.whatsappNumber,
        whatsappName: c.whatsappName,
        customName: c.customName,
        email: c.email,
        phone: c.phone,
        birthDate: c.birthDate,
        document: c.document,
        address: c.address,
        notes: c.notes,
        tags: c.tags ?? [],
        firstContactAt: (c.firstContactAt instanceof Date ? c.firstContactAt : new Date(c.firstContactAt)).toISOString(),
      },
      summary: summaryOrEmpty(summaries.get(contactId), rules),
      topService: mostFrequent(serviceFreq),
      topProfessional: mostFrequent(proFreq),
      history: appts.map((a) => {
        const list = byAppt.get(a.id) ?? []
        return {
          appointmentId: a.id,
          date: a.date,
          startTime: a.startTime.slice(0, 5),
          title: a.title,
          status: a.status,
          notes: a.notes,
          total: list.reduce((sum, s) => sum + s.price, 0),
          services: list,
        }
      }),
    }
  })
}
