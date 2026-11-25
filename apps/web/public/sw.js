/// <reference lib="webworker" />

// ─── Service Worker — Satori PWA ────────────────────────────────────────────
// Estratégias:
//   • Precache: só a página /offline (nada autenticado vai pro cache — o
//     aparelho pode ser compartilhado e o HTML do painel tem dados de clientes)
//   • Stale-while-revalidate: assets estáticos (/_next/static/, com hash no nome)
//   • Network-only: APIs, auth e todo o resto
//   • Push: notificação nativa; SEMPRE exibe algo (o iOS revoga a inscrição de
//     quem recebe push sem mostrar notificação)
//
// Ao alterar este arquivo, suba SW_VERSION — é o que descarta o cache antigo.

const SW_VERSION = 'satori-sw-v2'
const CACHE_NAME = `satori-shell-${SW_VERSION}`

const SHELL_URLS = ['/offline']

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

// ─── Install ─────────────────────────────────────────────────────────────────

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(SHELL_URLS))
  )
  self.skipWaiting()
})

// ─── Activate ────────────────────────────────────────────────────────────────

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter((k) => k.startsWith('satori-shell-') && k !== CACHE_NAME)
          .map((k) => caches.delete(k))
      )
    )
  )
  self.clients.claim()
})

// ─── Fetch ───────────────────────────────────────────────────────────────────

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return
  const url = new URL(event.request.url)
  if (url.origin !== self.location.origin) return

  // Network-only para APIs, dados dinâmicos e auth
  if (
    url.pathname.startsWith('/api/') ||
    url.pathname.startsWith('/_next/data/') ||
    url.pathname.startsWith('/auth/')
  ) {
    return
  }

  // Stale-while-revalidate para assets estáticos do Next.js
  if (url.pathname.startsWith('/_next/static/')) {
    event.respondWith(staleWhileRevalidate(event.request))
    return
  }

  // Navegação: sempre rede; sem conexão, cai na página offline
  if (event.request.mode === 'navigate') {
    event.respondWith(
      fetch(event.request).catch(() =>
        caches.match('/offline').then((r) => r || new Response('Offline', { status: 503 }))
      )
    )
  }
})

async function staleWhileRevalidate(request) {
  const cache = await caches.open(CACHE_NAME)
  const cached = await cache.match(request)

  const networkFetch = fetch(request)
    .then((response) => {
      if (response.ok) {
        cache.put(request, response.clone())
      }
      return response
    })
    .catch(() => cached)

  return cached || networkFetch
}

// ─── Push Notifications ──────────────────────────────────────────────────────

self.addEventListener('push', (event) => {
  let data = {}
  if (event.data) {
    try {
      data = event.data.json()
    } catch {
      data = { body: event.data.text() }
    }
  }

  const conversationId = typeof data.conversationId === 'string' && UUID_RE.test(data.conversationId)
    ? data.conversationId
    : null

  const options = {
    body: typeof data.body === 'string' ? data.body : 'Você tem uma nova atualização no Satori.',
    icon: '/icons/icon-192.png',
    badge: '/icons/badge-72.png',
    // Mesma conversa substitui a notificação anterior em vez de empilhar
    tag: conversationId || 'satori-geral',
    renotify: true,
    vibrate: [200, 100, 200],
    data: {
      url: conversationId ? `/chat/${conversationId}` : '/conversations',
    },
  }

  const title = typeof data.title === 'string' && data.title ? data.title : 'Satori'

  event.waitUntil(
    Promise.all([
      self.registration.showNotification(title, options),
      // Bolinha no ícone do app (iOS 16.4+ instalado, Android). Zerada ao abrir o app.
      self.navigator && 'setAppBadge' in self.navigator
        ? self.navigator.setAppBadge().catch(() => {})
        : Promise.resolve(),
    ])
  )
})

// ─── Notification Click ──────────────────────────────────────────────────────

self.addEventListener('notificationclick', (event) => {
  event.notification.close()

  const raw = event.notification.data && event.notification.data.url
  const targetUrl = typeof raw === 'string' && raw.startsWith('/') && !raw.startsWith('//') ? raw : '/conversations'

  event.waitUntil(
    (async () => {
      const clientList = await self.clients.matchAll({ type: 'window', includeUncontrolled: true })
      const client = clientList.find((c) => new URL(c.url).origin === self.location.origin)

      if (client) {
        // client.navigate() lança em janela não controlada e não é confiável no
        // Safari — a própria página navega (listener em components/pwa/sw-register.tsx).
        await client.focus().catch(() => {})
        client.postMessage({ type: 'satori:navigate', url: targetUrl })
        return
      }
      await self.clients.openWindow(targetUrl)
    })()
  )
})
