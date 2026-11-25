export const dynamic = 'force-dynamic'

import Link from 'next/link'
import { Bell, Bot, MessagesSquare, UserCog, ArrowRight, Kanban, UserRound, Tags, Trophy } from 'lucide-react'
import { getSessionClaims } from '@/lib/auth/session'
import { isManager } from '@/lib/auth/permissions'
import { ChangePasswordDialog } from './change-password-dialog'
import { NotificationSettings } from './notification-settings'
import { getMyNotificationPreferences } from '@/lib/actions/notification-preferences'
import { getCatalogContext } from '@/lib/data/products'

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
  const canManage = isManager(claims.userRole)
  const { businessModel } = claims.tenantId ? await getCatalogContext() : { businessModel: 'product' as const }
  // Push é por usuário de tenant (super admin puro não recebe push).
  const notificationPrefs = claims.tenantId ? await getMyNotificationPreferences() : null

  return (
    <div className="p-4 md:p-8 space-y-6 max-w-2xl mx-auto">
      <div>
        <h1 className="text-2xl font-bold">Configurações</h1>
        <p className="text-muted-foreground text-sm mt-1">
          Configurações da sua empresa no Satori
        </p>
      </div>

      {/* Minha conta — disponível pra qualquer papel */}
      <div className="border rounded-lg p-6 flex gap-4 items-start">
        <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 shrink-0">
          <UserRound className="h-5 w-5 text-primary" />
        </div>
        <div className="flex-1">
          <h2 className="font-semibold">Minha conta</h2>
          <p className="text-sm text-muted-foreground mt-1 mb-3">
            Troque sua senha de acesso ao painel.
          </p>
          <ChangePasswordDialog />
        </div>
      </div>

      {/* Notificações — disponível pra qualquer papel (cada um ajusta as próprias) */}
      {notificationPrefs && (
        <div className="border rounded-lg p-6 flex gap-4 items-start">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 shrink-0">
            <Bell className="h-5 w-5 text-primary" />
          </div>
          <div className="flex-1 min-w-0">
            <h2 className="font-semibold">Notificações</h2>
            <p className="text-sm text-muted-foreground mt-1 mb-4">
              Avisos de cliente esperando atendimento no celular ou no computador.
            </p>
            <NotificationSettings initial={notificationPrefs} />
          </div>
        </div>
      )}

      {canManage && (
        <>
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

          <Link
            href="/settings/kanban"
            className="border rounded-lg p-6 flex gap-4 items-start hover:bg-accent/50 transition-colors group"
          >
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 shrink-0">
              <Kanban className="h-5 w-5 text-primary" />
            </div>
            <div className="flex-1">
              <h2 className="font-semibold">Colunas do Kanban</h2>
              <p className="text-sm text-muted-foreground mt-1">
                Crie, renomeie, reordene e exclua as colunas do seu funil de atendimento.
              </p>
            </div>
            <ArrowRight className="h-4 w-4 text-muted-foreground shrink-0 mt-2 group-hover:translate-x-0.5 transition-transform" />
          </Link>

          <Link
            href="/settings/categories"
            className="border rounded-lg p-6 flex gap-4 items-start hover:bg-accent/50 transition-colors group"
          >
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 shrink-0">
              <Tags className="h-5 w-5 text-primary" />
            </div>
            <div className="flex-1">
              <h2 className="font-semibold">Categorias de {businessModel === 'service' ? 'serviço' : 'produto'}</h2>
              <p className="text-sm text-muted-foreground mt-1">
                Crie, renomeie, reordene e exclua as categorias usadas no catálogo de {businessModel === 'service' ? 'serviços' : 'produtos'}.
              </p>
            </div>
            <ArrowRight className="h-4 w-4 text-muted-foreground shrink-0 mt-2 group-hover:translate-x-0.5 transition-transform" />
          </Link>

          <Link
            href="/settings/score"
            className="border rounded-lg p-6 flex gap-4 items-start hover:bg-accent/50 transition-colors group"
          >
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 shrink-0">
              <Trophy className="h-5 w-5 text-primary" />
            </div>
            <div className="flex-1">
              <h2 className="font-semibold">Pontuação de clientes</h2>
              <p className="text-sm text-muted-foreground mt-1">
                Defina as regras de pontos e as faixas (bronze, prata, ouro…) usadas pra promoções.
              </p>
            </div>
            <ArrowRight className="h-4 w-4 text-muted-foreground shrink-0 mt-2 group-hover:translate-x-0.5 transition-transform" />
          </Link>
        </>
      )}
    </div>
  )
}
