'use client'

import { useState, useEffect } from 'react'
import { Download } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog'

interface BeforeInstallPromptEvent extends Event {
  readonly platforms: string[]
  readonly userChoice: Promise<{
    outcome: 'accepted' | 'dismissed'
    platform: string
  }>
  prompt(): Promise<void>
}

export function InstallPrompt() {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null)
  const [isIOS, setIsIOS] = useState(false)
  const [isStandalone, setIsStandalone] = useState(false)
  const [isOpen, setIsOpen] = useState(false)

  useEffect(() => {
    // Detect iOS
    const iOS = /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)
    setIsIOS(iOS)

    // Detect if already installed
    const standalone = window.matchMedia('(display-mode: standalone)').matches || (window.navigator as unknown as { standalone: boolean }).standalone === true
    setIsStandalone(standalone)

    // Chrome / Android WebAPK prompt
    const handleBeforeInstallPrompt = (e: Event) => {
      e.preventDefault()
      setDeferredPrompt(e as BeforeInstallPromptEvent)
    }

    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt)

    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt)
    }
  }, [])

  const handleInstallClick = async () => {
    if (deferredPrompt) {
      deferredPrompt.prompt()
      const { outcome } = await deferredPrompt.userChoice
      if (outcome === 'accepted') {
        setDeferredPrompt(null)
      }
      setIsOpen(false)
    } else if (isIOS) {
      setIsOpen(true)
    } else {
      // Navegador não suporta prompt de instalação e não é iOS
      setIsOpen(true)
    }
  }

  // Se já está instalado, não mostra botão extra (isso pode ser deixado pro sidebar decidir
  // mas aqui só expomos a função caso precisem).
  if (isStandalone) {
    return null
  }

  // O componente pode ser usado de duas formas:
  // 1. Um botão explícito exportado
  // 2. O Modal/Dialog de instrução
  return (
    <>
      <Button
        variant="outline"
        size="sm"
        className="w-full justify-start gap-2"
        onClick={handleInstallClick}
      >
        <Download className="h-4 w-4" />
        Instalar App
      </Button>

      <Dialog open={isOpen} onOpenChange={setIsOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Instalar o SATORI</DialogTitle>
            <DialogDescription>
              Instale nosso app para ter uma experiência nativa e receber notificações push.
            </DialogDescription>
          </DialogHeader>

          {isIOS ? (
            <div className="space-y-4 py-4 text-sm text-zinc-300">
              <p>No seu iPhone ou iPad:</p>
              <ol className="list-decimal list-inside space-y-2">
                <li>
                  Toque no botão <strong>Compartilhar</strong> na barra inferior do Safari
                  (um quadrado com uma seta para cima).
                </li>
                <li>
                  Role para baixo e toque em <strong>&quot;Adicionar à Tela de Início&quot;</strong>.
                </li>
                <li>
                  Toque em <strong>&quot;Adicionar&quot;</strong> no canto superior direito.
                </li>
              </ol>
            </div>
          ) : (
            <div className="space-y-4 py-4 text-sm text-zinc-300">
              <p>Para instalar neste navegador:</p>
              <p>
                Acesse o menu do seu navegador (geralmente três pontos no canto superior direito) 
                e clique em <strong>&quot;Instalar aplicativo&quot;</strong> ou <strong>&quot;Adicionar à tela inicial&quot;</strong>.
              </p>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  )
}
