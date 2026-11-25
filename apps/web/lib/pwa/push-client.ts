// Web Push no browser — funções puras (sem React) usadas pelo hook
// use-push-notifications e pelo logout da sidebar.

const READY_TIMEOUT_MS = 5000

export function isPushSupported(): boolean {
  return typeof window !== 'undefined' && 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window
}

function vapidKeyBytes(): Uint8Array<ArrayBuffer> | null {
  const base64String = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY
  if (!base64String) return null
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4)
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/')
  const raw = window.atob(base64)
  const out = new Uint8Array(new ArrayBuffer(raw.length))
  for (let i = 0; i < raw.length; ++i) out[i] = raw.charCodeAt(i)
  return out
}

function sameKey(a: ArrayBuffer | null | undefined, b: Uint8Array): boolean {
  if (!a) return false
  const av = new Uint8Array(a)
  if (av.length !== b.length) return false
  for (let i = 0; i < av.length; i++) if (av[i] !== b[i]) return false
  return true
}

/**
 * `serviceWorker.ready` nunca resolve se o registro falhou (rede, modo privado,
 * extensão) — sem timeout, quem espera fica "carregando" pra sempre.
 */
export async function getReadyRegistration(timeoutMs = READY_TIMEOUT_MS): Promise<ServiceWorkerRegistration | null> {
  if (!('serviceWorker' in navigator)) return null
  return Promise.race([
    navigator.serviceWorker.ready,
    new Promise<null>((resolve) => setTimeout(() => resolve(null), timeoutMs)),
  ])
}

async function saveOnServer(subscription: PushSubscription): Promise<void> {
  const res = await fetch('/api/push-subscribe', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(subscription),
  })
  if (!res.ok) throw new Error(`push-subscribe respondeu ${res.status}`)
}

async function forgetOnServer(endpoint: string): Promise<void> {
  await fetch('/api/push-unsubscribe', {
    method: 'DELETE',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ endpoint }),
  })
}

export type SyncResult = 'subscribed' | 'not_subscribed' | 'unsupported'

/**
 * Roda ao abrir o app. Garante que a inscrição do navegador e a do banco batem:
 * - inscrição existe e a chave VAPID é a atual → reenvia pro servidor (upsert
 *   idempotente). Corrige quem se inscreveu antes da tabela existir e ficou
 *   "inscrito" só no navegador.
 * - inscrição existe com chave antiga (VAPID trocada) → cancela; se a permissão
 *   já está concedida tenta reinscrever (pode falhar no iOS sem toque — aí o
 *   banner pede de novo).
 */
export async function syncSubscription(): Promise<SyncResult> {
  if (!isPushSupported()) return 'unsupported'
  const reg = await getReadyRegistration()
  if (!reg) return 'unsupported'

  const key = vapidKeyBytes()
  const existing = await reg.pushManager.getSubscription()
  if (!existing) return 'not_subscribed'

  if (key && !sameKey(existing.options.applicationServerKey, key)) {
    await forgetOnServer(existing.endpoint).catch(() => {})
    await existing.unsubscribe().catch(() => {})
    if (Notification.permission !== 'granted') return 'not_subscribed'
    try {
      const fresh = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: key })
      await saveOnServer(fresh)
      return 'subscribed'
    } catch (err) {
      console.warn('[push] Reinscrição após troca de chave VAPID falhou:', err)
      return 'not_subscribed'
    }
  }

  try {
    await saveOnServer(existing)
  } catch (err) {
    // Falha de rede não desfaz a inscrição — tenta de novo na próxima abertura.
    console.warn('[push] Falha ao sincronizar inscrição com o servidor:', err)
  }
  return 'subscribed'
}

/** Precisa ser chamada a partir de um toque do usuário (exigência do iOS). */
export async function subscribe(): Promise<void> {
  if (!isPushSupported()) throw new Error('Push não suportado neste navegador')
  const key = vapidKeyBytes()
  if (!key) throw new Error('NEXT_PUBLIC_VAPID_PUBLIC_KEY ausente no build')

  const permission = await Notification.requestPermission()
  if (permission !== 'granted') throw new PushPermissionError(permission)

  const reg = await getReadyRegistration()
  if (!reg) throw new Error('Service worker não ficou pronto')

  // Inscrição com chave antiga faz subscribe() lançar InvalidStateError.
  const existing = await reg.pushManager.getSubscription()
  if (existing && !sameKey(existing.options.applicationServerKey, key)) await existing.unsubscribe()

  const subscription = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: key })
  await saveOnServer(subscription)
}

export class PushPermissionError extends Error {
  constructor(public readonly permission: NotificationPermission) {
    super(`Permissão de notificação: ${permission}`)
    this.name = 'PushPermissionError'
  }
}

/**
 * Cancela a inscrição deste navegador (banco + navegador). Usada no logout pra
 * que o próximo usuário do mesmo aparelho não receba os pushes do anterior.
 * Nunca lança e nunca demora mais que `timeoutMs` — o logout não pode travar aqui.
 */
export async function unsubscribe(timeoutMs = 3000): Promise<void> {
  if (!isPushSupported()) return
  const work = (async () => {
    const reg = await getReadyRegistration(timeoutMs)
    const sub = reg ? await reg.pushManager.getSubscription() : null
    if (!sub) return
    await forgetOnServer(sub.endpoint).catch(() => {})
    await sub.unsubscribe().catch(() => {})
  })()
  await Promise.race([work.catch(() => {}), new Promise<void>((r) => setTimeout(r, timeoutMs))])
}
