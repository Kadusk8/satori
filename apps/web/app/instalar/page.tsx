import type { Metadata } from 'next'
import { InstallGuide, InstallGuideShell } from '@/components/pwa/install-guide'

// Página pública (sem login): é o link mandado pro operador junto com o convite.
// O middleware só protege /diagnostico e o dashboard se protege no próprio
// layout, então não há nada a liberar.
export const metadata: Metadata = {
  title: 'Instalar o app — Satori',
  description: 'Instale o Satori no celular e receba avisos de novos atendimentos.',
}

export default function InstalarPage() {
  return (
    <InstallGuideShell>
      <InstallGuide />
    </InstallGuideShell>
  )
}
