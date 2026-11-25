// Filtra destinatários de push pelas preferências de cada usuário
// (Configurações → Notificações). Função pura — a busca fica em push-context.ts.

export type UserPushPrefs = {
  userId: string
  /** Só recebe push de conversas atribuídas a ele. */
  onlyAssigned: boolean
  /** 'HH:MM' ou 'HH:MM:SS' (formato do Postgres TIME), ou null = sem horário silencioso. */
  quietStart: string | null
  quietEnd: string | null
}

const FALLBACK_TZ = 'America/Sao_Paulo'

function toMinutes(t: string): number | null {
  const m = /^(\d{2}):(\d{2})/.exec(t)
  if (!m) return null
  const h = Number(m[1])
  const min = Number(m[2])
  if (h > 23 || min > 59) return null
  return h * 60 + min
}

/** Minutos desde a meia-noite no fuso informado (fuso inválido cai no padrão do Brasil). */
export function localMinutes(now: Date, timezone: string): number {
  const fmt = (tz: string) =>
    new Intl.DateTimeFormat('en-GB', { timeZone: tz, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(now)
  let parts: Intl.DateTimeFormatPart[]
  try {
    parts = fmt(timezone)
  } catch {
    parts = fmt(FALLBACK_TZ)
  }
  const h = Number(parts.find((p) => p.type === 'hour')?.value ?? 0)
  const m = Number(parts.find((p) => p.type === 'minute')?.value ?? 0)
  return h * 60 + m
}

/**
 * Início incluído, fim excluído. Se o fim for menor que o início, o intervalo
 * atravessa a meia-noite (ex: 22:00–07:00).
 */
export function isWithinQuietHours(nowMinutes: number, start: string | null, end: string | null): boolean {
  if (!start || !end) return false
  const s = toMinutes(start)
  const e = toMinutes(end)
  if (s === null || e === null || s === e) return false
  return s < e ? nowMinutes >= s && nowMinutes < e : nowMinutes >= s || nowMinutes < e
}

export function filterByPreferences(
  prefs: UserPushPrefs[],
  ctx: { assignedUserId: string | null; now: Date; timezone: string }
): string[] {
  const nowMinutes = localMinutes(ctx.now, ctx.timezone)
  return prefs
    .filter((p) => !p.onlyAssigned || p.userId === ctx.assignedUserId)
    .filter((p) => !isWithinQuietHours(nowMinutes, p.quietStart, p.quietEnd))
    .map((p) => p.userId)
}
