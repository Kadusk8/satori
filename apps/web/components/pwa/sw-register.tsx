'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'

/**
 * Registra o service worker e trata o que ele pede à página.
 * Componente invisível — renderiza null.
 */
export function ServiceWorkerRegister() {
  const router = useRouter()

  useEffect(() => {
    if (!('serviceWorker' in navigator)) return

    let updateTimer: ReturnType<typeof setInterval> | undefined
    navigator.serviceWorker
      .register('/sw.js', { scope: '/' })
      .then((reg) => {
        // Auto-update: verifica a cada 60 minutos
        updateTimer = setInterval(() => reg.update().catch(() => {}), 60 * 60 * 1000)
      })
      .catch((err) => {
        console.warn('[SW] Falha ao registrar service worker:', err)
      })

    // Clique na notificação com o app já aberto: o SW foca a janela e pede a navegação.
    const onMessage = (event: MessageEvent) => {
      const msg: unknown = event.data
      if (typeof msg !== 'object' || msg === null) return
      const { type, url } = msg as { type?: unknown; url?: unknown }
      if (type !== 'satori:navigate' || typeof url !== 'string') return
      if (!url.startsWith('/') || url.startsWith('//')) return
      router.push(url)
    }
    navigator.serviceWorker.addEventListener('message', onMessage)

    // O número no ícone do app é mantido pela sidebar do dashboard (lib/pwa/app-badge.ts).

    return () => {
      if (updateTimer) clearInterval(updateTimer)
      navigator.serviceWorker.removeEventListener('message', onMessage)
    }
  }, [router])

  return null
}
