// Cálculo do score e do status do cliente a partir do histórico de
// atendimentos e das regras configuradas pelo tenant (client_score_rules).
// Puro (sem banco) — usado tanto nas páginas quanto na prévia da tela de regras.

export interface ScoreTier {
  name: string
  minPoints: number
}

export interface ServiceBonus {
  productId: string
  points: number
}

export interface ScoreRules {
  pointsPerVisit: number
  spendStep: number
  pointsPerSpendStep: number
  noShowPenalty: number
  windowMonths: number | null
  inactiveAfterDays: number
  serviceBonuses: ServiceBonus[]
  tiers: ScoreTier[]
}

export const DEFAULT_SCORE_RULES: ScoreRules = {
  pointsPerVisit: 10,
  spendStep: 10,
  pointsPerSpendStep: 1,
  noShowPenalty: 5,
  windowMonths: null,
  inactiveAfterDays: 90,
  serviceBonuses: [],
  tiers: [
    { name: 'Bronze', minPoints: 0 },
    { name: 'Prata', minPoints: 100 },
    { name: 'Ouro', minPoints: 300 },
    { name: 'Diamante', minPoints: 600 },
  ],
}

/** Números do cliente dentro da janela de pontuação (ver windowMonths). */
export interface ScoreInput {
  visits: number
  totalSpent: number
  noShows: number
  /** Quantas vezes cada produto foi feito: productId → quantidade */
  servicesCount: Record<string, number>
}

export type ClientStatus = 'novo' | 'ativo' | 'inativo'

export const CLIENT_STATUS_LABEL: Record<ClientStatus, string> = {
  novo: 'Sem visitas',
  ativo: 'Ativo',
  inativo: 'Inativo',
}

export function computeScore(input: ScoreInput, rules: ScoreRules): number {
  const visitPoints = input.visits * rules.pointsPerVisit
  const spendPoints =
    rules.spendStep > 0 ? Math.floor(input.totalSpent / rules.spendStep) * rules.pointsPerSpendStep : 0
  const bonusPoints = rules.serviceBonuses.reduce(
    (sum, b) => sum + (input.servicesCount[b.productId] ?? 0) * b.points,
    0
  )
  const penalty = input.noShows * rules.noShowPenalty
  return Math.max(0, visitPoints + spendPoints + bonusPoints - penalty)
}

/** Maior faixa cujo mínimo o score atinge; null se nenhuma (ou nenhuma configurada). */
export function tierFor(score: number, tiers: ScoreTier[]): ScoreTier | null {
  let best: ScoreTier | null = null
  for (const t of tiers) {
    if (score >= t.minPoints && (!best || t.minPoints > best.minPoints)) best = t
  }
  return best
}

export function clientStatus(lastVisit: string | null, rules: ScoreRules, now = new Date()): ClientStatus {
  if (!lastVisit) return 'novo'
  const days = (now.getTime() - new Date(lastVisit + 'T12:00:00').getTime()) / 86_400_000
  return days > rules.inactiveAfterDays ? 'inativo' : 'ativo'
}

/** Data (YYYY-MM-DD) a partir da qual atendimentos contam pro score, ou null = tudo. */
export function windowStartDate(rules: ScoreRules, now = new Date()): string | null {
  if (!rules.windowMonths) return null
  const d = new Date(now)
  d.setMonth(d.getMonth() - rules.windowMonths)
  return d.toISOString().slice(0, 10)
}

// ── Conversão de/para a linha do banco ───────────────────────────────────────

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null
}

export function parseServiceBonuses(raw: unknown): ServiceBonus[] {
  if (!Array.isArray(raw)) return []
  return raw.flatMap((b) =>
    isRecord(b) && typeof b.product_id === 'string' && Number.isFinite(Number(b.points))
      ? [{ productId: b.product_id, points: Math.trunc(Number(b.points)) }]
      : []
  )
}

export function parseTiers(raw: unknown): ScoreTier[] {
  if (!Array.isArray(raw)) return []
  return raw
    .flatMap((t) =>
      isRecord(t) && typeof t.name === 'string' && Number.isFinite(Number(t.min_points))
        ? [{ name: t.name, minPoints: Math.trunc(Number(t.min_points)) }]
        : []
    )
    .sort((a, b) => a.minPoints - b.minPoints)
}

export function rulesFromRow(
  row: {
    pointsPerVisit: number
    spendStep: string | number
    pointsPerSpendStep: number
    noShowPenalty: number
    windowMonths: number | null
    inactiveAfterDays: number
    serviceBonuses: unknown
    tiers: unknown
  } | null | undefined
): ScoreRules {
  if (!row) return DEFAULT_SCORE_RULES
  return {
    pointsPerVisit: row.pointsPerVisit,
    spendStep: Number(row.spendStep) || DEFAULT_SCORE_RULES.spendStep,
    pointsPerSpendStep: row.pointsPerSpendStep,
    noShowPenalty: row.noShowPenalty,
    windowMonths: row.windowMonths,
    inactiveAfterDays: row.inactiveAfterDays,
    serviceBonuses: parseServiceBonuses(row.serviceBonuses),
    tiers: parseTiers(row.tiers),
  }
}
