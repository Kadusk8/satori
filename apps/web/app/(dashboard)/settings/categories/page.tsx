export const dynamic = 'force-dynamic'

import Link from 'next/link'
import { asc } from 'drizzle-orm'
import { withClaims } from '@/lib/db'
import { productCategories } from '@/lib/db/schema'
import { getSessionClaims, getDbClaims } from '@/lib/auth/session'
import { isManager } from '@/lib/auth/permissions'
import { Card, CardContent } from '@/components/ui/card'
import { ArrowLeft, ShieldAlert } from 'lucide-react'
import { ProductCategoriesManager } from './product-categories-manager'

export default async function ProductCategoriesPage() {
  const claims = await getSessionClaims()

  if (!claims.tenantId || !isManager(claims.userRole)) {
    return (
      <div className="p-8 max-w-2xl mx-auto">
        <Card>
          <CardContent className="flex items-center gap-3 py-8">
            <ShieldAlert className="h-5 w-5 text-muted-foreground shrink-0" />
            <p className="text-sm text-muted-foreground">
              Apenas o owner ou administradores da empresa podem gerenciar as categorias de produto.
            </p>
          </CardContent>
        </Card>
      </div>
    )
  }

  const dbClaims = (await getDbClaims())!
  const categories = await withClaims(dbClaims, (tx) =>
    tx
      .select({
        id: productCategories.id,
        name: productCategories.name,
        position: productCategories.position,
      })
      .from(productCategories)
      .orderBy(asc(productCategories.position))
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
        <h1 className="text-2xl font-bold">Categorias de produto</h1>
        <p className="text-muted-foreground text-sm mt-1">
          Crie, renomeie, reordene e exclua as categorias usadas no catálogo de produtos.
        </p>
      </div>

      <ProductCategoriesManager initialCategories={categories} />
    </div>
  )
}
