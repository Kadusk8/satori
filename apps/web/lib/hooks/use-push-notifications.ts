'use client'

import { useState, useEffect, useCallback } from 'react'
import { toast } from 'sonner'
import * as pushClient from '@/lib/pwa/push-client'

export function usePushNotifications() {
  const [isSupported, setIsSupported] = useState(false)
  const [permission, setPermission] = useState<NotificationPermission>('default')
  const [isSubscribed, setIsSubscribed] = useState(false)
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    if (!pushClient.isPushSupported()) {
      setIsLoading(false)
      return
    }
    setPermission(Notification.permission)

    // Sincroniza navegador ↔ banco a cada abertura (ver syncSubscription).
    pushClient
      .syncSubscription()
      .then((result) => {
        if (cancelled) return
        setIsSupported(result !== 'unsupported')
        setIsSubscribed(result === 'subscribed')
        setPermission(Notification.permission)
      })
      .catch((err) => {
        console.warn('[push] Falha ao verificar inscrição:', err)
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false)
      })

    return () => {
      cancelled = true
    }
  }, [])

  // Chamar direto do onClick: no iOS a permissão só é concedida a partir de um toque.
  const subscribe = useCallback(async () => {
    setIsLoading(true)
    try {
      await pushClient.subscribe()
      setIsSubscribed(true)
      toast.success('Notificações ativadas!')
      return true
    } catch (err) {
      if (err instanceof pushClient.PushPermissionError) {
        if (err.permission === 'denied') {
          toast.error('Notificações bloqueadas. Libere nas configurações do aparelho/navegador.')
        }
      } else {
        console.error('[push] Falha ao inscrever:', err)
        toast.error('Não foi possível ativar as notificações.')
      }
      return false
    } finally {
      setPermission(Notification.permission)
      setIsLoading(false)
    }
  }, [])

  const unsubscribe = useCallback(async () => {
    setIsLoading(true)
    try {
      await pushClient.unsubscribe()
      setIsSubscribed(false)
      toast.info('Notificações desativadas.')
      return true
    } finally {
      setIsLoading(false)
    }
  }, [])

  return {
    isSupported,
    permission,
    isSubscribed,
    isLoading,
    subscribe,
    unsubscribe,
  }
}
