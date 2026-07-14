'use server'

import { revalidatePath } from 'next/cache'
import { eq } from 'drizzle-orm'
import { withClaims } from '@/lib/db'
import { productCategories } from '@/lib/db/schema'
import { getSessionClaims, getDbClaims } from '@/lib/auth/session'
import { isManager } from '@/lib/auth/permissions'

async function requireManagerClaims() {
  const claims = await getSessionClaims()
  if (!claims.tenantId || !isManager(claims.userRole)) {
    throw new Error('Sem permissão para gerenciar as categorias de produto.')
  }
  const dbClaims = (await getDbClaims())!
  return { tenantId: claims.tenantId, dbClaims }
}

function revalidateCategoryPaths() {
  revalidatePath('/settings/categories')
  revalidatePath('/products')
}

export async function createProductCategory(input: { name: string }) {
  const { tenantId, dbClaims } = await requireManagerClaims()
  const name = input.name.trim()
  if (!name) throw new Error('Nome é obrigatório.')

  await withClaims(dbClaims, async (tx) => {
    const existing = await tx
      .select({ position: productCategories.position, name: productCategories.name })
      .from(productCategories)
      .where(eq(productCategories.tenantId, tenantId))

    if (existing.some((c) => c.name.toLowerCase() === name.toLowerCase())) {
      throw new Error('Já existe uma categoria com esse nome.')
    }

    const maxPosition = existing.reduce((m, c) => Math.max(m, c.position), -1)
    await tx.insert(productCategories).values({ tenantId, name, position: maxPosition + 1 })
  })

  revalidateCategoryPaths()
}

export async function updateProductCategory(id: string, input: { name: string }) {
  const { dbClaims } = await requireManagerClaims()
  const name = input.name.trim()
  if (!name) throw new Error('Nome é obrigatório.')

  await withClaims(dbClaims, async (tx) => {
    // RLS (tenant_isolation) já restringe esse update ao tenant da sessão.
    await tx.update(productCategories).set({ name }).where(eq(productCategories.id, id))
  })

  revalidateCategoryPaths()
}

export async function reorderProductCategories(orderedIds: string[]) {
  const { tenantId, dbClaims } = await requireManagerClaims()

  await withClaims(dbClaims, async (tx) => {
    // RLS já restringe a leitura/escrita ao tenant da sessão — confere aqui só
    // pra ignorar ids que não pertencem a essa lista (defesa em profundidade).
    const rows = await tx
      .select({ id: productCategories.id })
      .from(productCategories)
      .where(eq(productCategories.tenantId, tenantId))
    const validIds = new Set(rows.map((r) => r.id))
    for (let i = 0; i < orderedIds.length; i++) {
      if (!validIds.has(orderedIds[i])) continue
      await tx.update(productCategories).set({ position: i }).where(eq(productCategories.id, orderedIds[i]))
    }
  })

  revalidateCategoryPaths()
}

export async function deleteProductCategory(id: string) {
  const { dbClaims } = await requireManagerClaims()

  await withClaims(dbClaims, async (tx) => {
    // Produtos que já usam essa categoria (campo texto livre) não são
    // afetados — só deixam de aparecer na lista de categorias cadastradas.
    await tx.delete(productCategories).where(eq(productCategories.id, id))
  })

  revalidateCategoryPaths()
}
