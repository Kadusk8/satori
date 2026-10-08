export const dynamic = 'force-dynamic'

import Link from 'next/link'
import { asc, eq } from 'drizzle-orm'
import { ArrowLeft, ShieldAlert } from 'lucide-react'
import { withClaims } from '@/lib/db'
import { products } from '@/lib/db/schema'
import { getSessionClaims, getDbClaims } from '@/lib/auth/session'
import { isManager } from '@/lib/auth/permissions'
import { loadScoreRules } from '@/lib/data/client-history'
import { Card, CardContent } from '@/components/ui/card'
import { ScoreRulesManager } from './score-rules-manager'

export default async function ScoreRulesPage() {
  const claims = await getSessionClaims()

  if (!claims.tenantId || !isManager(claims.userRole)) {
    return (
      <div className="p-8 max-w-2xl mx-auto">
        <Card>
          <CardContent className="flex items-center gap-3 py-8">
            <ShieldAlert className="h-5 w-5 text-muted-foreground shrink-0" />
            <p className="text-sm text-muted-foreground">
              Apenas o owner ou administradores da empresa podem alterar as regras de pontuação.
            </p>
          </CardContent>
        </Card>
      </div>
    )
  }

  const tenantId = claims.tenantId
  const dbClaims = (await getDbClaims())!
  const { rules, catalog } = await withClaims(dbClaims, async (tx) => ({
    rules: await loadScoreRules(tx, tenantId),
    catalog: await tx
      .select({ id: products.id, name: products.name })
      .from(products)
      .where(eq(products.tenantId, tenantId))
      .orderBy(asc(products.name)),
  }))

  return (
    <div className="p-8 space-y-6 max-w-3xl mx-auto">
      <div>
        <Link
          href="/settings"
          className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors mb-3"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          Configurações
        </Link>
        <h1 className="text-2xl font-bold">Pontuação de clientes</h1>
        <p className="text-muted-foreground text-sm mt-1">
          Defina como seus clientes acumulam pontos e em quais faixas eles se encaixam — use as faixas pra
          direcionar promoções.
        </p>
      </div>

      <ScoreRulesManager initialRules={rules} products={catalog} />
    </div>
  )
}
