import webpush from 'web-push'
import { db } from '../db/index.js'
import { pushSubscriptions } from '../db/schema.js'
import { eq, inArray, and } from 'drizzle-orm'

// Inicializa a configuração do web-push (singleton)
let webpushConfigured = false

function initWebPush() {
  if (webpushConfigured) return
  
  const publicKey = process.env.VAPID_PUBLIC_KEY || process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY
  const privateKey = process.env.VAPID_PRIVATE_KEY
  
  if (!publicKey || !privateKey) {
    console.warn('[push-sender] VAPID keys not configured, push notifications will be disabled.')
    return
  }

  webpush.setVapidDetails(
    'mailto:contato@zapagent.com',
    publicKey,
    privateKey
  )
  webpushConfigured = true
}

interface PushPayload {
  title: string
  body: string
  conversationId?: string
}

export async function sendPushNotification(tenantId: string, userIds: string[], payload: PushPayload) {
  initWebPush()
  if (!webpushConfigured) return

  try {
    // Busca todas as subscriptions dos usuários especificados neste tenant
    const subs = await db
      .select()
      .from(pushSubscriptions)
      .where(
        and(
          eq(pushSubscriptions.tenantId, tenantId),
          inArray(pushSubscriptions.userId, userIds)
        )
      )

    if (subs.length === 0) return

    const payloadString = JSON.stringify(payload)

    const promises = subs.map(async (sub) => {
      try {
        await webpush.sendNotification(
          {
            endpoint: sub.endpoint,
            keys: {
              p256dh: sub.keysP256dh,
              auth: sub.keysAuth,
            },
          },
          payloadString
        )
      } catch (err: any) {
        // Se a subscription expirou ou o usuário revogou (410 Gone)
        if (err.statusCode === 410 || err.statusCode === 404) {
          console.log(`[push-sender] Removendo subscription expirada: ${sub.endpoint}`)
          await db.delete(pushSubscriptions).where(eq(pushSubscriptions.endpoint, sub.endpoint))
        } else {
          console.error('[push-sender] Erro ao enviar notificação:', err)
        }
      }
    })

    await Promise.allSettled(promises)
  } catch (err) {
    console.error('[push-sender] Erro geral no sendPushNotification:', err)
  }
}
