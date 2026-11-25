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
import { detectPlatform } from '@/lib/pwa/platform'
import { getInstallPrompt, promptInstall } from '@/lib/pwa/install-event'
import { InstallGuide } from '@/components/pwa/install-guide'

/** Botão "Instalar App" da sidebar. Some quando o app já está instalado. */
export function InstallPrompt() {
  const [isStandalone, setIsStandalone] = useState(true)
  const [isOpen, setIsOpen] = useState(false)

  useEffect(() => {
    setIsStandalone(detectPlatform().isStandalone)
  }, [])

  if (isStandalone) return null

  const handleInstallClick = async () => {
    // Diálogo nativo (Chrome/Edge/Samsung) quando disponível — evento capturado
    // no <head> do layout raiz, então não se perde antes da hidratação.
    if (getInstallPrompt()) {
      await promptInstall()
      return
    }
    // iPhone, Firefox, navegador embutido etc.: mesmo guia da página /instalar.
    setIsOpen(true)
  }

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
            <DialogTitle>Instalar o Satori</DialogTitle>
            <DialogDescription>
              Instale o app para ser avisado quando um cliente precisar de atendimento.
            </DialogDescription>
          </DialogHeader>
          <div className="py-2">
            <InstallGuide />
          </div>
        </DialogContent>
      </Dialog>
    </>
  )
}
