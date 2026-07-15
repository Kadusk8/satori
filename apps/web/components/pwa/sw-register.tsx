'use client'

import { useEffect } from 'react'

/**
 * Registra o service worker no browser.
 * Componente invisível — renderiza null.
 */
export function ServiceWorkerRegister() {
  useEffect(() => {
    if (typeof window === 'undefined') return
    if (!('serviceWorker' in navigator)) return

    navigator.serviceWorker
      .register('/sw.js', { scope: '/' })
      .then((reg) => {
        // Auto-update: verifica a cada 60 minutos
        setInterval(() => reg.update(), 60 * 60 * 1000)
      })
      .catch((err) => {
        console.warn('[SW] Falha ao registrar service worker:', err)
      })
  }, [])

  return null
}
