// Integração com Pusher para realtime — dispara eventos pra atualizar o frontend
// quando mensagens são recebidas, conversas mudam de status, etc.

import Pusher from 'pusher'

const pusherAppId = process.env.PUSHER_APP_ID
const pusherKey = process.env.NEXT_PUBLIC_PUSHER_KEY
const pusherSecret = process.env.PUSHER_SECRET
const pusherCluster = process.env.NEXT_PUBLIC_PUSHER_CLUSTER

let pusherClient: Pusher | null = null

if (pusherAppId && pusherKey && pusherSecret && pusherCluster) {
  try {
    pusherClient = new Pusher({
      appId: pusherAppId,
      key: pusherKey,
      secret: pusherSecret,
      cluster: pusherCluster,
      useTLS: true,
    })
    console.log('[realtime] Pusher configurado com sucesso')
  } catch (err) {
    console.warn('[realtime] Erro ao inicializar Pusher:', err)
    pusherClient = null
  }
} else {
  console.warn('[realtime] Pusher não configurado (faltam variáveis de ambiente). Eventos realtime desabilitados.')
}

// Prefixo `private-` é obrigatório: o frontend assina esses mesmos nomes
// como canais privados autenticados (ver apps/web/lib/realtime/channels.ts
// e app/api/pusher/auth/route.ts) — sem o prefixo, backend e frontend
// publicam/assinam canais diferentes e o evento nunca chega no browser.
export function tenantChannel(tenantId: string): string {
  return `private-tenant-${tenantId}`
}

export function conversationChannel(conversationId: string): string {
  return `private-conversation-${conversationId}`
}

export async function triggerEvent(channel: string, event: string, data: any): Promise<void> {
  if (!pusherClient) {
    console.debug(`[realtime] Evento ignorado (Pusher desabilitado): ${channel}/${event}`)
    return
  }

  try {
    await pusherClient.trigger(channel, event, data)
    console.debug(`[realtime] Evento disparado: ${channel}/${event}`)
  } catch (err) {
    console.error(`[realtime] Erro ao disparar evento ${channel}/${event}:`, err)
  }
}
