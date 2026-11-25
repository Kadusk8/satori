'use client'

import { useState, useEffect } from 'react'
import { usePushNotifications } from '@/lib/hooks/use-push-notifications'
import { detectPlatform, iosSupportsWebPush, type PwaPlatform } from '@/lib/pwa/platform'
import { Bell, X } from 'lucide-react'
import { Button } from '@/components/ui/button'

// "Agora não" esconde por 7 dias, não pra sempre — o push é o principal motivo de ter o app.
const DISMISS_KEY = 'satori-push-banner-dismissed-at'
const DISMISS_MS = 7 * 24 * 60 * 60 * 1000

function recentlyDismissed(): boolean {
  const at = Number(localStorage.getItem(DISMISS_KEY) ?? 0)
  return Date.now() - at < DISMISS_MS
}

export function NotificationPermissionBanner() {
  const { isSupported, permission, isSubscribed, isLoading, subscribe } = usePushNotifications()
  const [platform, setPlatform] = useState<PwaPlatform | null>(null)
  const [dismissed, setDismissed] = useState(true)

  useEffect(() => {
    setPlatform(detectPlatform())
    setDismissed(recentlyDismissed())
  }, [])

  const handleDismiss = () => {
    localStorage.setItem(DISMISS_KEY, String(Date.now()))
    setDismissed(true)
  }

  if (!platform || dismissed) return null

  // iPhone fora do app instalado: aqui o Safari nem expõe PushManager, então esse caso
  // tem que ser avaliado antes de isSupported — senão a instrução nunca aparece.
  if (platform.isIOS && !platform.isStandalone) {
    if (!iosSupportsWebPush(platform)) return null
    return (
      <div className="bg-cyan-900/40 border-b border-cyan-800 p-4 text-sm text-cyan-100 flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <Bell className="h-5 w-5 shrink-0 text-cyan-400" />
          <p>
            {platform.isIOSNonSafari
              ? 'Para receber avisos de novos atendimentos, abra o Satori no Safari e adicione à Tela de Início.'
              : 'Para receber avisos de novos atendimentos, instale o Satori: toque em Compartilhar → Adicionar à Tela de Início.'}
          </p>
        </div>
        <button onClick={handleDismiss} aria-label="Fechar" className="shrink-0 text-cyan-400 hover:text-cyan-300">
          <X className="h-4 w-4" />
        </button>
      </div>
    )
  }

  // 'granted' sem inscrição também entra: acontece quando a inscrição caiu
  // (troca de chave VAPID, iOS revogou, logout de outro usuário no aparelho).
  if (!isSupported || isLoading || isSubscribed || permission === 'denied') return null

  return (
    <div className="bg-zinc-900 border-b border-zinc-800 p-4 text-sm text-zinc-300 flex items-center justify-between gap-3">
      <div className="flex items-center gap-3">
        <Bell className="h-5 w-5 shrink-0 text-zinc-400" />
        <p>Ative as notificações para ser avisado quando um cliente precisar de atendimento, mesmo com o app fechado.</p>
      </div>
      <div className="flex shrink-0 items-center gap-4">
        <Button onClick={subscribe} variant="secondary" size="sm" disabled={isLoading}>
          Ativar notificações
        </Button>
        <button onClick={handleDismiss} aria-label="Agora não" className="text-zinc-500 hover:text-zinc-300">
          <X className="h-4 w-4" />
        </button>
      </div>
    </div>
  )
}
