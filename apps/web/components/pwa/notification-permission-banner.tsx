'use client'

import { useState, useEffect } from 'react'
import { usePushNotifications } from '@/lib/hooks/use-push-notifications'
import { Bell, X } from 'lucide-react'
import { Button } from '@/components/ui/button'

export function NotificationPermissionBanner() {
  const { isSupported, permission, isSubscribed, isLoading, subscribe } = usePushNotifications()
  const [isVisible, setIsVisible] = useState(false)
  const [isIOS, setIsIOS] = useState(false)
  const [isStandalone, setIsStandalone] = useState(false)

  useEffect(() => {
    // Check if device is iOS
    const iOS = /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)
    setIsIOS(iOS)

    const standalone = window.matchMedia('(display-mode: standalone)').matches || (window.navigator as unknown as { standalone: boolean }).standalone === true
    setIsStandalone(standalone)

    // Show banner if supported, not loading, not subscribed, and permission is default
    if (isSupported && !isLoading && !isSubscribed && permission === 'default') {
      const dismissed = localStorage.getItem('satori-push-banner-dismissed')
      if (!dismissed) {
        setIsVisible(true)
      }
    }
  }, [isSupported, isLoading, isSubscribed, permission])

  const handleDismiss = () => {
    localStorage.setItem('satori-push-banner-dismissed', 'true')
    setIsVisible(false)
  }

  if (!isVisible) return null

  // iOS Safari requires PWA installation before requesting push permission
  if (isIOS && !isStandalone) {
    return (
      <div className="bg-cyan-900/40 border-b border-cyan-800 p-4 text-sm text-cyan-100 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Bell className="h-5 w-5 text-cyan-400" />
          <p>
            Deseja receber notificações nativas? No iOS, primeiro adicione o SATORI à Tela de Início (Compartilhar &rarr; Adicionar à Tela de Início).
          </p>
        </div>
        <button onClick={handleDismiss} className="text-cyan-400 hover:text-cyan-300">
          <X className="h-4 w-4" />
        </button>
      </div>
    )
  }

  return (
    <div className="bg-zinc-900 border-b border-zinc-800 p-4 text-sm text-zinc-300 flex items-center justify-between">
      <div className="flex items-center gap-3">
        <Bell className="h-5 w-5 text-zinc-400" />
        <p>Ative as notificações push para ser avisado quando novas mensagens chegarem, mesmo com a aba fechada.</p>
      </div>
      <div className="flex items-center gap-4">
        <Button onClick={subscribe} variant="secondary" size="sm" disabled={isLoading}>
          Ativar notificações
        </Button>
        <button onClick={handleDismiss} className="text-zinc-500 hover:text-zinc-300">
          <X className="h-4 w-4" />
        </button>
      </div>
    </div>
  )
}
