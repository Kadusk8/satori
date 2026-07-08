export const dynamic = 'force-dynamic'

import Link from 'next/link'
import { Bot, MessagesSquare, UserCog, ArrowRight, ShieldAlert } from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import { getSessionClaims } from '@/lib/auth/session'
import { isManager } from '@/lib/auth/permissions'

const managedSections = [
  {
    icon: Bot,
    title: 'Agente de IA',
    description: 'Prompt, personalidade, mensagens automáticas e regras de escalação do seu assistente.',
  },
  {
    icon: MessagesSquare,
    title: 'Conexão do WhatsApp',
    description: 'URL, token e instância da Evolution Go usados para enviar e receber mensagens.',
  },
]

export default async function SettingsPage() {
  const claims = await getSessionClaims()

  if (!isManager(claims.userRole)) {
    return (
      <div className="p-8 max-w-2xl mx-auto">
        <Card>
          <CardContent className="flex items-center gap-3 py-8">
            <ShieldAlert className="h-5 w-5 text-muted-foreground shrink-0" />
            <p className="text-sm text-muted-foreground">
              Apenas o owner ou administradores da empresa podem ver as configurações.
            </p>
          </CardContent>
        </Card>
      </div>
    )
  }

  return (
    <div className="p-8 space-y-6 max-w-2xl mx-auto">
      <div>
        <h1 className="text-2xl font-bold">Configurações</h1>
        <p className="text-muted-foreground text-sm mt-1">
          Configurações da sua empresa no Satori
        </p>
      </div>

      <div className="border rounded-lg divide-y">
        {managedSections.map((section) => (
          <div key={section.title} className="p-6 flex gap-4 items-start">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-muted shrink-0">
              <section.icon className="h-5 w-5 text-muted-foreground" />
            </div>
            <div>
              <h2 className="font-semibold">{section.title}</h2>
              <p className="text-sm text-muted-foreground mt-1">{section.description}</p>
              <p className="text-xs text-muted-foreground mt-2">
                Gerenciado pelo administrador da plataforma — entre em contato com o suporte para alterar.
              </p>
            </div>
          </div>
        ))}
      </div>

      <Link
        href="/team"
        className="border rounded-lg p-6 flex gap-4 items-start hover:bg-accent/50 transition-colors group"
      >
        <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 shrink-0">
          <UserCog className="h-5 w-5 text-primary" />
        </div>
        <div className="flex-1">
          <h2 className="font-semibold">Equipe</h2>
          <p className="text-sm text-muted-foreground mt-1">
            Convide vendedores e gerencie quem tem acesso ao painel — isso você já pode fazer direto por aqui.
          </p>
        </div>
        <ArrowRight className="h-4 w-4 text-muted-foreground shrink-0 mt-2 group-hover:translate-x-0.5 transition-transform" />
      </Link>
    </div>
  )
}
