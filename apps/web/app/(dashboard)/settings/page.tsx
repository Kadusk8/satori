'use client'

export const dynamic = 'force-dynamic'

import { Settings, ShieldCheck } from 'lucide-react'

export default function SettingsPage() {
  return (
    <div className="p-8 space-y-6 max-w-2xl">
      <div>
        <h1 className="text-2xl font-bold">Configurações</h1>
        <p className="text-muted-foreground text-sm mt-1">
          Configurações da plataforma
        </p>
      </div>

      <div className="border rounded-lg p-6 flex gap-4 items-start">
        <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-muted shrink-0">
          <ShieldCheck className="h-5 w-5 text-muted-foreground" />
        </div>
        <div>
          <h2 className="font-semibold">Gerenciado pelo administrador</h2>
          <p className="text-sm text-muted-foreground mt-1">
            As configurações de IA, WhatsApp e integrações são gerenciadas pelo administrador da plataforma.
            Entre em contato com o suporte caso precise alterar alguma configuração.
          </p>
        </div>
      </div>
    </div>
  )
}
