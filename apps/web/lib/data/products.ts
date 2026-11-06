'use server'

import { revalidatePath } from 'next/cache'
import { and, asc, desc, eq } from 'drizzle-orm'
import { withClaims } from '@/lib/db'
import { products, productCategories, tenants } from '@/lib/db/schema'
import { getDbClaims } from '@/lib/auth/session'

export interface DBProductRow {
  id: string
  name: string
  description: string | null
  short_description: string | null
  price: number | null
  price_display: string | null
  category: string | null
  tags: string[]
  characteristics: string[]
  images: { url: string; thumbnailUrl: string; alt: string }[]
  is_available: boolean
  is_featured: boolean
  is_running_ad: boolean
  item_kind: 'product' | 'service'
  duration_minutes: number | null
}

export interface ProductInput {
  id?: string
  name: string
  description: string | null
  shortDescription: string | null
  price: number | null
  priceDisplay: string | null
  category: string | null
  tags: string[]
  characteristics: string[]
  images: { url: string; thumbnailUrl: string; alt: string }[]
  isAvailable: boolean
  isFeatured: boolean
  isRunningAd: boolean
  durationMinutes: number | null
}

async function claimsOrThrow() {
  const c = await getDbClaims()
  if (!c) throw new Error('Sessão inválida.')
  return c
}

function toRow(p: typeof products.$inferSelect): DBProductRow {
  return {
    id: p.id,
    name: p.name,
    description: p.description,
    short_description: p.shortDescription,
    price: p.price === null ? null : Number(p.price),
    price_display: p.priceDisplay,
    category: p.category,
    tags: p.tags ?? [],
    characteristics: p.characteristics ?? [],
    images: (p.images ?? []) as DBProductRow['images'],
    is_available: p.isAvailable,
    is_featured: p.isFeatured,
    is_running_ad: p.isRunningAd,
    item_kind: p.itemKind as 'product' | 'service',
    duration_minutes: p.durationMinutes,
  }
}

export async function getCatalogContext(): Promise<{ businessModel: 'product' | 'service' }> {
  const claims = await claimsOrThrow()
  if (!claims.tenant_id) throw new Error('Tenant não identificado.')
  return withClaims(claims, async (tx) => {
    const [tenant] = await tx.select({ businessModel: tenants.businessModel }).from(tenants).where(eq(tenants.id, claims.tenant_id!)).limit(1)
    return { businessModel: tenant?.businessModel === 'service' ? 'service' : 'product' }
  })
}

export async function listProductCategories(): Promise<string[]> {
  const claims = await claimsOrThrow()
  const rows = await withClaims(claims, (tx) =>
    tx.select({ name: productCategories.name }).from(productCategories).orderBy(asc(productCategories.position))
  )
  return rows.map((r) => r.name)
}

export async function listProducts(): Promise<DBProductRow[]> {
  const claims = await claimsOrThrow()
  if (!claims.tenant_id) throw new Error('Tenant não identificado.')
  const itemKind = await businessModelForClaims(claims)
  const rows = await withClaims(claims, (tx) =>
    tx.select().from(products)
      .where(and(eq(products.tenantId, claims.tenant_id!), eq(products.itemKind, itemKind)))
      .orderBy(desc(products.createdAt))
  )
  return rows.map(toRow)
}

async function businessModelForClaims(claims: Awaited<ReturnType<typeof claimsOrThrow>>): Promise<'product' | 'service'> {
  if (!claims.tenant_id) throw new Error('Tenant não identificado.')
  return withClaims(claims, async (tx) => {
    const [tenant] = await tx.select({ businessModel: tenants.businessModel }).from(tenants).where(eq(tenants.id, claims.tenant_id!)).limit(1)
    return tenant?.businessModel === 'service' ? 'service' : 'product'
  })
}

export async function saveProduct(input: ProductInput): Promise<{ id: string }> {
  const claims = await claimsOrThrow()
  const itemKind = await businessModelForClaims(claims)
  if (itemKind === 'service' && (!input.durationMinutes || input.durationMinutes < 5)) {
    throw new Error('Informe uma duração válida para o serviço.')
  }
  const values = {
    name: input.name,
    description: input.description,
    shortDescription: input.shortDescription,
    price: input.price === null ? null : String(input.price),
    priceDisplay: input.priceDisplay,
    category: input.category,
    tags: input.tags,
    characteristics: input.characteristics,
    images: input.images,
    isAvailable: input.isAvailable,
    isFeatured: input.isFeatured,
    isRunningAd: input.isRunningAd,
    itemKind,
    durationMinutes: itemKind === 'service' ? input.durationMinutes : null,
  }

  const id = await withClaims(claims, async (tx) => {
    if (input.id) {
      const updated = await tx.update(products)
        .set({ ...values, updatedAt: new Date() })
        .where(and(eq(products.id, input.id), eq(products.itemKind, itemKind)))
        .returning({ id: products.id })
      if (!updated[0]) throw new Error('Item não encontrado neste catálogo.')
      return updated[0].id
    }
    if (!claims.tenant_id) throw new Error('Tenant não identificado.')
    const res = await tx
      .insert(products)
      .values({ ...values, tenantId: claims.tenant_id })
      .returning({ id: products.id })
    return res[0].id
  })

  revalidatePath('/products')
  return { id }
}

export async function deleteProduct(id: string): Promise<void> {
  const claims = await claimsOrThrow()
  const itemKind = await businessModelForClaims(claims)
  await withClaims(claims, (tx) => tx.delete(products).where(and(eq(products.id, id), eq(products.itemKind, itemKind))))
  revalidatePath('/products')
}

export async function setProductAvailable(id: string, available: boolean): Promise<void> {
  const claims = await claimsOrThrow()
  const itemKind = await businessModelForClaims(claims)
  await withClaims(claims, (tx) =>
    tx.update(products).set({ isAvailable: available, updatedAt: new Date() }).where(and(eq(products.id, id), eq(products.itemKind, itemKind)))
  )
  revalidatePath('/products')
}
