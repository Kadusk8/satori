// Só pra Server Components (usa withAdmin). Não importar em 'use client'.
import { eq } from 'drizzle-orm'
import { withAdmin } from '@/lib/db'
import { pushSubscriptions } from '@/lib/db/schema'

export type PushDevice = 'iPhone' | 'Android' | 'Computador'

function deviceFromUserAgent(ua: string | null): PushDevice {
  if (!ua) return 'Computador'
  if (/iPhone|iPad|iPod/i.test(ua)) return 'iPhone'
  if (/Android/i.test(ua)) return 'Android'
  return 'Computador'
}

/**
 * Em quais aparelhos cada membro do tenant tem notificação ligada.
 *
 * withAdmin porque a policy de push_subscriptions só mostra as inscrições do
 * próprio usuário (o endpoint é sensível). Aqui devolvemos só o RESUMO — nunca
 * o endpoint nem as chaves — e sempre filtrado pelo tenant de quem chama.
 * Quem chama TEM que ter checado antes que o usuário é owner/admin do tenant.
 */
export async function getTeamPushDevices(tenantId: string): Promise<Map<string, PushDevice[]>> {
  const rows = await withAdmin((tx) =>
    tx
      .select({ userId: pushSubscriptions.userId, userAgent: pushSubscriptions.userAgent })
      .from(pushSubscriptions)
      .where(eq(pushSubscriptions.tenantId, tenantId))
  )

  const byUser = new Map<string, PushDevice[]>()
  for (const r of rows) {
    const device = deviceFromUserAgent(r.userAgent)
    const list = byUser.get(r.userId) ?? []
    if (!list.includes(device)) list.push(device)
    byUser.set(r.userId, list)
  }
  return byUser
}
