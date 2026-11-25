'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { usePushNotifications } from '@/lib/hooks/use-push-notifications'
import { detectPlatform, iosSupportsWebPush, type PwaPlatform } from '@/lib/pwa/platform'
import { getInstallPrompt, onInstallPromptChange, promptInstall } from '@/lib/pwa/install-event'
import { Bell, Download, X } from 'lucide-react'
import { Button } from '@/components/ui/button'

// "Agora não" esconde por 7 dias, não pra sempre — o push é o principal motivo de ter o app.
const DISMISS_MS = 7 * 24 * 60 * 60 * 1000
const PUSH_DISMISS_KEY = 'satori-push-banner-dismissed-at'
const INSTALL_DISMISS_KEY = 'satori-install-banner-dismissed-at'

function recentlyDismissed(key: string): boolean {
  const at = Number(localStorage.getItem(key) ?? 0)
  return Date.now() - at < DISMISS_MS
}

/**
 * Banner do topo do painel, em ordem de prioridade:
 * 1. Celular fora do app instalado → "Instale o app" (no iPhone é o único jeito
 *    de ter push; no Android o app instalado é mais confiável que a aba).
 * 2. App instalado (ou desktop) sem push → "Ativar notificações".
 */
export function NotificationPermissionBanner() {
  const { isSupported, permission, isSubscribed, isLoading, subscribe } = usePushNotifications()
  const [platform, setPlatform] = useState<PwaPlatform | null>(null)
  const [pushDismissed, setPushDismissed] = useState(true)
  const [installDismissed, setInstallDismissed] = useState(true)
  const [canPrompt, setCanPrompt] = useState(false)

  useEffect(() => {
    setPlatform(detectPlatform())
    setPushDismissed(recentlyDismissed(PUSH_DISMISS_KEY))
    setInstallDismissed(recentlyDismissed(INSTALL_DISMISS_KEY))
    setCanPrompt(getInstallPrompt() !== null)
    return onInstallPromptChange(() => {
      setCanPrompt(getInstallPrompt() !== null)
      setPlatform(detectPlatform())
    })
  }, [])

  if (!platform) return null

  const dismiss = (key: string, set: (v: boolean) => void) => () => {
    localStorage.setItem(key, String(Date.now()))
    set(true)
  }

  const isMobile = platform.isIOS || platform.isAndroid

  // ── 1. Instalar o app ──────────────────────────────────────────────────────
  if (isMobile && !platform.isStandalone) {
    // iPhone antigo: o app não teria push mesmo instalado — nada a oferecer aqui.
    if (installDismissed || (platform.isIOS && !iosSupportsWebPush(platform))) return null
    return (
      <div className="bg-cyan-900/40 border-b border-cyan-800 p-3 text-sm text-cyan-100 flex items-center justify-between gap-3">
        <div className="flex items-center gap-3 min-w-0">
          <Download className="h-5 w-5 shrink-0 text-cyan-400" />
          <p>Instale o app do Satori para ser avisado quando um cliente precisar de você.</p>
        </div>
        <div className="flex shrink-0 items-center gap-3">
          {canPrompt ? (
            <Button size="sm" onClick={() => void promptInstall()}>
              Instalar
            </Button>
          ) : (
            <Button size="sm" render={<Link href="/instalar" />} nativeButton={false}>
              Como instalar
            </Button>
          )}
          <button
            onClick={dismiss(INSTALL_DISMISS_KEY, setInstallDismissed)}
            aria-label="Agora não"
            className="text-cyan-400 hover:text-cyan-300"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      </div>
    )
  }

  // ── 2. Ativar notificações ─────────────────────────────────────────────────
  // 'granted' sem inscrição também entra: acontece quando a inscrição caiu
  // (troca de chave VAPID, iOS revogou, logout de outro usuário no aparelho).
  if (pushDismissed || !isSupported || isLoading || isSubscribed || permission === 'denied') return null

  return (
    <div className="bg-zinc-900 border-b border-zinc-800 p-3 text-sm text-zinc-300 flex items-center justify-between gap-3">
      <div className="flex items-center gap-3 min-w-0">
        <Bell className="h-5 w-5 shrink-0 text-zinc-400" />
        <p>Ative as notificações para ser avisado quando um cliente precisar de atendimento, mesmo com o app fechado.</p>
      </div>
      <div className="flex shrink-0 items-center gap-3">
        <Button onClick={subscribe} variant="secondary" size="sm" disabled={isLoading}>
          Ativar
        </Button>
        <button
          onClick={dismiss(PUSH_DISMISS_KEY, setPushDismissed)}
          aria-label="Agora não"
          className="text-zinc-500 hover:text-zinc-300"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
    </div>
  )
}
