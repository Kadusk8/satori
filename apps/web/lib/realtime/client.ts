'use client'

import PusherClient from 'pusher-js'

export { tenantChannel, conversationChannel } from './channels'

let client: PusherClient | null = null
let clientChecked = false

/**
 * Cliente Pusher browser-side. Retorna null se NEXT_PUBLIC_PUSHER_KEY/CLUSTER
 * não estiverem configuradas — quem chama deve cair num fallback (polling ou
 * refresh manual) nesse caso.
 */
export function getPusherClient(): PusherClient | null {
  if (clientChecked) return client
  clientChecked = true

  const key = process.env.NEXT_PUBLIC_PUSHER_KEY
  const cluster = process.env.NEXT_PUBLIC_PUSHER_CLUSTER
  if (!key || !cluster) return null

  client = new PusherClient(key, {
    cluster,
    authEndpoint: '/api/pusher/auth',
  })
  return client
}
