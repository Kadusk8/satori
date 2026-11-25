'use client'

import { useEffect } from 'react'

const REFRESH_EVERY_MS = 60 * 60 * 1000 // = updateAge em auth.config.ts
const KEY = 'satori-session-refreshed-at'

/**
 * Mantém a sessão deslizante. Server Components não conseguem regravar o cookie
 * do Auth.js, e nada mais no app chama /api/auth/session — sem isto a sessão
 * venceria 7 dias depois do login mesmo com uso diário. O GET nessa rota renova
 * o cookie quando passou o updateAge (e revalida os claims no callback jwt).
 */
export function SessionRefresh() {
  useEffect(() => {
    const refresh = () => {
      if (document.visibilityState !== 'visible') return
      const last = Number(sessionStorage.getItem(KEY) ?? 0)
      if (Date.now() - last < REFRESH_EVERY_MS) return
      sessionStorage.setItem(KEY, String(Date.now()))
      fetch('/api/auth/session', { credentials: 'same-origin', cache: 'no-store' }).catch(() => {})
    }
    refresh()
    document.addEventListener('visibilitychange', refresh)
    return () => document.removeEventListener('visibilitychange', refresh)
  }, [])

  return null
}
