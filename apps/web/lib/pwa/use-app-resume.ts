'use client'

import { useEffect, useRef } from 'react'

const MIN_HIDDEN_MS = 30_000

/**
 * Chama `onResume` quando o app volta do segundo plano depois de ficar oculto
 * por pelo menos 30s, ou quando a conexão volta.
 *
 * Por quê: no iPhone (e no Android em economia de bateria) o sistema derruba o
 * WebSocket do Pusher com o app em segundo plano. Os eventos desse intervalo se
 * perdem, e a tela ficaria desatualizada até o próximo evento chegar.
 */
export function useOnAppResume(onResume: () => void) {
  // Ref pra não re-registrar os listeners a cada render (callbacks inline).
  const cb = useRef(onResume)
  useEffect(() => {
    cb.current = onResume
  }, [onResume])

  useEffect(() => {
    let hiddenAt: number | null = document.visibilityState === 'hidden' ? Date.now() : null

    const onVisibility = () => {
      if (document.visibilityState === 'hidden') {
        hiddenAt = Date.now()
        return
      }
      const wasHiddenFor = hiddenAt ? Date.now() - hiddenAt : 0
      hiddenAt = null
      // 1s de respiro: ao voltar do segundo plano o rádio/Wi-Fi ainda está
      // reativando, e a recarga imediata falharia (e mostraria toast de erro).
      if (wasHiddenFor >= MIN_HIDDEN_MS) setTimeout(() => cb.current(), 1000)
    }
    const onOnline = () => cb.current()

    document.addEventListener('visibilitychange', onVisibility)
    window.addEventListener('online', onOnline)
    return () => {
      document.removeEventListener('visibilitychange', onVisibility)
      window.removeEventListener('online', onOnline)
    }
  }, [])
}
