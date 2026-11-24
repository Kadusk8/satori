// Limitador de tentativas de login em memória (janela deslizante). Protege contra força bruta
// por e-mail e por IP. É por processo: com mais de uma réplica do apps/web cada uma conta
// separado (continua limitando, só com folga maior). Para limite global, trocar por Redis.

const WINDOW_MS = 15 * 60 * 1000
const MAX_PER_EMAIL = 5
const MAX_PER_IP = 30

const failures = new Map<string, number[]>()

function recent(key: string, now: number): number[] {
  const list = (failures.get(key) ?? []).filter((t) => now - t < WINDOW_MS)
  if (list.length > 0) failures.set(key, list)
  else failures.delete(key)
  return list
}

/** true se o e-mail ou o IP já estourou o limite de falhas na janela. */
export function isLoginBlocked(email: string, ip: string | null): boolean {
  const now = Date.now()
  if (recent(`e:${email}`, now).length >= MAX_PER_EMAIL) return true
  if (ip && recent(`i:${ip}`, now).length >= MAX_PER_IP) return true
  return false
}

export function recordLoginFailure(email: string, ip: string | null): void {
  const now = Date.now()
  failures.set(`e:${email}`, [...recent(`e:${email}`, now), now])
  if (ip) failures.set(`i:${ip}`, [...recent(`i:${ip}`, now), now])
  // Evita crescimento sem limite sob ataque com muitos e-mails distintos.
  if (failures.size > 10_000) {
    for (const k of failures.keys()) recent(k, now)
  }
}

export function clearLoginFailures(email: string): void {
  failures.delete(`e:${email}`)
}

export function clientIp(headers: Headers): string | null {
  return headers.get('x-forwarded-for')?.split(',')[0]?.trim() || headers.get('x-real-ip') || null
}
