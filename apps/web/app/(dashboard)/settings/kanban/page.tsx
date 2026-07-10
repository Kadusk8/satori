export const dynamic = 'force-dynamic'

import Link from 'next/link'
import { asc } from 'drizzle-orm'
import { withClaims } from '@/lib/db'
import { kanbanStages } from '@/lib/db/schema'
import { getSessionClaims, getDbClaims } from '@/lib/auth/session'
import { isManager } from '@/lib/auth/permissions'
import { Card, CardContent } from '@/components/ui/card'
import { ArrowLeft, ShieldAlert } from 'lucide-react'
import { KanbanStagesManager } from './kanban-stages-manager'

export default async function KanbanStagesPage() {
  const claims = await getSessionClaims()

  if (!claims.tenantId || !isManager(claims.userRole)) {
    return (
      <div className="p-8 max-w-2xl mx-auto">
        <Card>
          <CardContent className="flex items-center gap-3 py-8">
            <ShieldAlert className="h-5 w-5 text-muted-foreground shrink-0" />
            <p className="text-sm text-muted-foreground">
              Apenas o owner ou administradores da empresa podem gerenciar as colunas do kanban.
            </p>
          </CardContent>
        </Card>
      </div>
    )
  }

  const dbClaims = (await getDbClaims())!
  const stages = await withClaims(dbClaims, (tx) =>
    tx
      .select({
        id: kanbanStages.id,
        name: kanbanStages.name,
        slug: kanbanStages.slug,
        color: kanbanStages.color,
        position: kanbanStages.position,
        isDefault: kanbanStages.isDefault,
        isClosed: kanbanStages.isClosed,
      })
      .from(kanbanStages)
      .orderBy(asc(kanbanStages.position))
  )

  return (
    <div className="p-8 space-y-6 max-w-2xl mx-auto">
      <div>
        <Link
          href="/settings"
          className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors mb-3"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          Configurações
        </Link>
        <h1 className="text-2xl font-bold">Colunas do Kanban</h1>
        <p className="text-muted-foreground text-sm mt-1">
          Crie, renomeie, reordene e exclua as colunas do seu funil de atendimento.
        </p>
      </div>

      <KanbanStagesManager initialStages={stages} />
    </div>
  )
}
