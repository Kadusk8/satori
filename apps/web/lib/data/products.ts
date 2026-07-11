'use server'

import { revalidatePath } from 'next/cache'
import { desc, eq } from 'drizzle-orm'
import { withClaims } from '@/lib/db'
import { products } from '@/lib/db/schema'
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
  images: { url: string; thumbnailUrl: string; alt: string }[]
  is_available: boolean
  is_featured: boolean
  is_running_ad: boolean
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
  images: { url: string; thumbnailUrl: string; alt: string }[]
  isAvailable: boolean
  isFeatured: boolean
  isRunningAd: boolean
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
    images: (p.images ?? []) as DBProductRow['images'],
    is_available: p.isAvailable,
    is_featured: p.isFeatured,
    is_running_ad: p.isRunningAd,
  }
}

export async function listProducts(): Promise<DBProductRow[]> {
  const claims = await claimsOrThrow()
  const rows = await withClaims(claims, (tx) =>
    tx.select().from(products).orderBy(desc(products.createdAt))
  )
  return rows.map(toRow)
}

export async function saveProduct(input: ProductInput): Promise<{ id: string }> {
  const claims = await claimsOrThrow()
  const values = {
    name: input.name,
    description: input.description,
    shortDescription: input.shortDescription,
    price: input.price === null ? null : String(input.price),
    priceDisplay: input.priceDisplay,
    category: input.category,
    tags: input.tags,
    images: input.images,
    isAvailable: input.isAvailable,
    isFeatured: input.isFeatured,
    isRunningAd: input.isRunningAd,
  }

  const id = await withClaims(claims, async (tx) => {
    if (input.id) {
      await tx.update(products).set({ ...values, updatedAt: new Date() }).where(eq(products.id, input.id))
      return input.id
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
  await withClaims(claims, (tx) => tx.delete(products).where(eq(products.id, id)))
  revalidatePath('/products')
}

export async function setProductAvailable(id: string, available: boolean): Promise<void> {
  const claims = await claimsOrThrow()
  await withClaims(claims, (tx) =>
    tx.update(products).set({ isAvailable: available, updatedAt: new Date() }).where(eq(products.id, id))
  )
  revalidatePath('/products')
}
