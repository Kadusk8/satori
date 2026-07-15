/// <reference lib="webworker" />

// ─── Service Worker — SATORI PWA ────────────────────────────────────────────
// Estratégias:
//   • Precache: app shell (página de conversas + offline fallback)
//   • Stale-while-revalidate: assets estáticos (/_next/static/)
//   • Network-only: APIs e dados dinâmicos
//   • Push: notificações nativas de novas mensagens

const SW_VERSION = 'satori-sw-v1'
const CACHE_NAME = `satori-shell-${SW_VERSION}`

const SHELL_URLS = ['/conversations', '/offline']

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
  const url = new URL(event.request.url)

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

  // Navigation requests: network-first com fallback offline
  if (event.request.mode === 'navigate') {
    event.respondWith(
      fetch(event.request).catch(() =>
        caches.match('/offline').then((r) => r || new Response('Offline', { status: 503 }))
      )
    )
    return
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
  if (!event.data) return

  let data
  try {
    data = event.data.json()
  } catch {
    data = { title: 'Nova mensagem', body: event.data.text() }
  }

  const options = {
    body: data.body || '',
    icon: '/icons/icon-192.png',
    badge: '/icons/badge-72.png',
    tag: data.conversationId || 'general',
    renotify: true,
    vibrate: [200, 100, 200],
    data: {
      url: data.conversationId
        ? `/chat/${data.conversationId}`
        : '/conversations',
    },
  }

  event.waitUntil(
    self.registration.showNotification(data.title || 'SATORI', options)
  )
})

// ─── Notification Click ──────────────────────────────────────────────────────

self.addEventListener('notificationclick', (event) => {
  event.notification.close()

  const targetUrl = event.notification.data?.url || '/conversations'

  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      // Se já tem uma janela aberta, foca nela e navega
      for (const client of clientList) {
        if ('focus' in client) {
          client.focus()
          client.navigate(targetUrl)
          return
        }
      }
      // Senão, abre nova janela
      return self.clients.openWindow(targetUrl)
    })
  )
})
