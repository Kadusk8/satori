import webpush, { type RequestOptions } from 'web-push'
import {
  countWaitingConversations,
  deleteSubscription,
  loadRecipientPrefs,
  loadSubscriptions,
  loadTenantTimezone,
} from './push-context.js'
import { filterByPreferences } from './push-preferences.js'

// Acesso pelo default: web-push é CommonJS e o import nomeado da classe não é
// garantido em runtime no ESM do Node.
const { WebPushError } = webpush

// Inicializa a configuração do web-push (singleton)
let webpushConfigured = false

function initWebPush() {
  if (webpushConfigured) return

  const publicKey = process.env.VAPID_PUBLIC_KEY || process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY
  const privateKey = process.env.VAPID_PRIVATE_KEY
  // A Apple rejeita subject inválido com 403 BadJwtToken — tem que ser mailto: ou https:.
  // Default no domínio atual (o antigo era mailto:contato@zapagent.com) pra um deploy
  // sem a env nova não derrubar o push.
  const subject = process.env.VAPID_SUBJECT || 'mailto:suporte@satori.ia.br'

  if (!publicKey || !privateKey) {
    console.warn('[push-sender] VAPID_PUBLIC_KEY/VAPID_PRIVATE_KEY não configurados — push desativado.')
    return
  }
  if (!/^(mailto:\S+@\S+|https:\/\/\S+)$/.test(subject)) {
    console.error(`[push-sender] VAPID_SUBJECT inválido ("${subject}") — use mailto: ou https:. Push desativado.`)
    return
  }

  webpush.setVapidDetails(subject, publicKey, privateKey)
  webpushConfigured = true
}

export interface PushPayload {
  title: string
  body: string
  conversationId?: string
  /**
   * escalation: cliente esperando humano — entrega imediata mesmo em economia de
   * bateria, e vale por 24h. message: atualização comum, descartada após 1h.
   */
  kind: 'escalation' | 'message'
}

export interface PushOptions {
  /** Dono da conversa — usado pela preferência "só conversas atribuídas a mim". */
  assignedUserId?: string | null
  /** Injetável nos testes. */
  now?: Date
}

/**
 * Opções de envio por tipo. O `topic` faz o serviço de push substituir uma
 * notificação ainda não entregue da mesma conversa em vez de empilhar várias.
 * Topic aceita no máximo 32 chars do alfabeto base64url — o UUID sem hífens cabe exato.
 */
export function buildSendOptions(payload: PushPayload): RequestOptions {
  const options: RequestOptions =
    payload.kind === 'escalation'
      ? { TTL: 24 * 60 * 60, urgency: 'high' }
      : { TTL: 60 * 60, urgency: 'normal' }
  const topic = payload.conversationId?.replace(/-/g, '')
  if (topic && /^[A-Za-z0-9_-]{1,32}$/.test(topic)) options.topic = topic
  return options
}

/** 404/410: a inscrição não existe mais (usuário revogou, app apagado) — apagar a linha. */
export function isGoneError(err: unknown): boolean {
  return err instanceof WebPushError && (err.statusCode === 404 || err.statusCode === 410)
}

export async function sendPushNotification(
  tenantId: string,
  userIds: string[],
  payload: PushPayload,
  opts: PushOptions = {}
) {
  initWebPush()
  if (!webpushConfigured || userIds.length === 0) return

  try {
    // Preferências de cada usuário (só atribuídas a mim / horário silencioso).
    const [prefs, timezone] = await Promise.all([
      loadRecipientPrefs(tenantId, userIds),
      loadTenantTimezone(tenantId),
    ])
    const recipients = filterByPreferences(prefs, {
      assignedUserId: opts.assignedUserId ?? null,
      now: opts.now ?? new Date(),
      timezone,
    })
    if (recipients.length === 0) return

    const subs = await loadSubscriptions(tenantId, recipients)
    if (subs.length === 0) return

    // Número no ícone do app = conversas esperando atendimento (igual à sidebar).
    const badge = await countWaitingConversations(tenantId).catch(() => null)

    const { kind: _kind, ...body } = payload
    const payloadString = JSON.stringify({ ...body, badge })
    const options = buildSendOptions(payload)

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
          payloadString,
          options
        )
      } catch (err: unknown) {
        if (isGoneError(err)) {
          console.log('[push-sender] Removendo subscription expirada')
          await deleteSubscription(sub.endpoint)
        } else if (err instanceof WebPushError) {
          // 403 = chave VAPID do frontend ≠ do backend, ou subject inválido (Apple).
          // 413 = payload grande demais. O corpo da resposta diz o motivo.
          const host = new URL(sub.endpoint).hostname
          console.error(`[push-sender] Falha ${err.statusCode} em ${host}: ${err.body}`)
        } else {
          console.error('[push-sender] Erro ao enviar notificação:', err instanceof Error ? err.message : err)
        }
      }
    })

    await Promise.allSettled(promises)
  } catch (err) {
    console.error('[push-sender] Erro geral no sendPushNotification:', err)
  }
}
