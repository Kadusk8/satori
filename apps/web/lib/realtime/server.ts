import Pusher from 'pusher'

export { tenantChannel, conversationChannel } from './channels'

let client: Pusher | null = null
let clientChecked = false

/**
 * Cliente Pusher server-side. Retorna null se as envs não estiverem
 * configuradas — permite rodar localmente sem conta Pusher (realtime vira
 * no-op, telas caem no fallback manual/polling já existente).
 */
export function getPusherServerClient(): Pusher | null {
  if (clientChecked) return client
  clientChecked = true

  // A key/cluster não são secretas (o client-side já as expõe via
  // NEXT_PUBLIC_*) — só appId/secret precisam ficar só no server.
  const { PUSHER_APP_ID, PUSHER_SECRET, NEXT_PUBLIC_PUSHER_KEY, NEXT_PUBLIC_PUSHER_CLUSTER } = process.env
  if (!PUSHER_APP_ID || !PUSHER_SECRET || !NEXT_PUBLIC_PUSHER_KEY || !NEXT_PUBLIC_PUSHER_CLUSTER) return null

  client = new Pusher({
    appId: PUSHER_APP_ID,
    key: NEXT_PUBLIC_PUSHER_KEY,
    secret: PUSHER_SECRET,
    cluster: NEXT_PUBLIC_PUSHER_CLUSTER,
    useTLS: true,
  })
  return client
}

/** Dispara um evento Pusher. Best-effort: sem Pusher configurado ou em caso de erro, não falha o caller. */
export async function triggerEvent(channel: string, event: string, data: unknown): Promise<void> {
  const pusher = getPusherServerClient()
  if (!pusher) return
  try {
    await pusher.trigger(channel, event, data)
  } catch (err) {
    console.error(`[realtime] falha ao disparar "${event}" em "${channel}":`, err)
  }
}
