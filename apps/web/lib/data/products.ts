'use server'

import { revalidatePath } from 'next/cache'
import { and, asc, desc, eq } from 'drizzle-orm'
import { withClaims } from '@/lib/db'
import { products, productCategories, productVariants, tenants } from '@/lib/db/schema'
import { getDbClaims } from '@/lib/auth/session'

export interface DBProductRow {
  id: string
  name: string
  description: string | null
  short_description: string | null
  price: number | null
  price_display: string | null
  category: string | null
  additional_categories: string[]
  subcategory: string | null
  brand: string | null
  audience: 'female' | 'male' | 'kids' | 'unisex' | null
  promotional_price: number | null
  variants: ProductVariantInput[]
  tags: string[]
  characteristics: string[]
  price_tiers: ProductPriceTier[]
  images: { url: string; thumbnailUrl: string; alt: string }[]
  is_available: boolean
  is_featured: boolean
  is_running_ad: boolean
  item_kind: 'product' | 'service'
  duration_minutes: number | null
}

export interface ProductVariantInput {
  id?: string
  size: string
  color: string
  sku: string
  stock: number
}

export interface ProductPriceTier {
  label: string
  minQuantity: number
  unitPrice: number
}

export interface ProductInput {
  id?: string
  name: string
  description: string | null
  shortDescription: string | null
  price: number | null
  priceDisplay: string | null
  category: string | null
  additionalCategories: string[]
  subcategory: string | null
  brand: string | null
  audience: 'female' | 'male' | 'kids' | 'unisex' | null
  promotionalPrice: number | null
  variants: ProductVariantInput[]
  tags: string[]
  characteristics: string[]
  priceTiers: ProductPriceTier[]
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

function toRow(p: typeof products.$inferSelect, variants: ProductVariantInput[] = []): DBProductRow {
  return {
    id: p.id,
    name: p.name,
    description: p.description,
    short_description: p.shortDescription,
    price: p.price === null ? null : Number(p.price),
    price_display: p.priceDisplay,
    category: p.category,
    additional_categories: p.additionalCategories ?? [],
    subcategory: p.subcategory,
    brand: p.brand,
    audience: p.audience as DBProductRow['audience'],
    promotional_price: p.promotionalPrice === null ? null : Number(p.promotionalPrice),
    variants,
    tags: p.tags ?? [],
    characteristics: p.characteristics ?? [],
    price_tiers: (p.priceTiers ?? []) as ProductPriceTier[],
    images: (p.images ?? []) as DBProductRow['images'],
    is_available: p.isAvailable,
    is_featured: p.isFeatured,
    is_running_ad: p.isRunningAd,
    item_kind: p.itemKind as 'product' | 'service',
    duration_minutes: p.durationMinutes,
  }
}

export async function getCatalogContext(): Promise<{ businessModel: 'product' | 'fashion' | 'service' }> {
  const claims = await claimsOrThrow()
  if (!claims.tenant_id) throw new Error('Tenant não identificado.')
  return withClaims(claims, async (tx) => {
    const [tenant] = await tx.select({ businessModel: tenants.businessModel }).from(tenants).where(eq(tenants.id, claims.tenant_id!)).limit(1)
    const model = tenant?.businessModel
    return { businessModel: model === 'service' || model === 'fashion' ? model : 'product' }
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
  const result = await withClaims(claims, async (tx) => {
    const rows = await tx.select().from(products)
      .where(and(eq(products.tenantId, claims.tenant_id!), eq(products.itemKind, itemKind)))
      .orderBy(desc(products.createdAt))
    const variants = itemKind === 'product'
      ? await tx.select().from(productVariants).where(eq(productVariants.tenantId, claims.tenant_id!))
      : []
    return { rows, variants }
  })
  return result.rows.map((product) => toRow(product, result.variants.filter((variant) => variant.productId === product.id)))
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
  const context = await getCatalogContext()
  const itemKind = await businessModelForClaims(claims)
  if (itemKind === 'service' && (!input.durationMinutes || input.durationMinutes < 5)) {
    throw new Error('Informe uma duração válida para o serviço.')
  }
  if (context.businessModel === 'fashion') {
    if (!input.category?.trim() || !input.subcategory?.trim() || !input.brand?.trim() || !input.audience) {
      throw new Error('Informe categoria, subcategoria, marca e público da roupa.')
    }
    if (input.variants.length === 0) throw new Error('Cadastre pelo menos uma variação de tamanho e cor.')
    if (input.promotionalPrice !== null && (input.price === null || input.promotionalPrice >= input.price)) {
      throw new Error('O preço promocional deve ser menor que o preço normal.')
    }
    const combinations = input.variants.map((variant) => `${variant.size.trim().toLowerCase()}::${variant.color.trim().toLowerCase()}`)
    const skus = input.variants.map((variant) => variant.sku.trim().toLowerCase())
    if (input.variants.some((variant) => !variant.size.trim() || !variant.color.trim() || !variant.sku.trim() || variant.stock < 0)) {
      throw new Error('Preencha tamanho, cor, SKU e estoque de todas as variações.')
    }
    if (new Set(combinations).size !== combinations.length || new Set(skus).size !== skus.length) {
      throw new Error('Não repita combinações de tamanho/cor nem códigos SKU.')
    }
  }
  const normalizedTiers = [...input.priceTiers]
    .map((tier) => ({ label: tier.label.trim(), minQuantity: Number(tier.minQuantity), unitPrice: Number(tier.unitPrice) }))
    .sort((a, b) => a.minQuantity - b.minQuantity)
  if (normalizedTiers.some((tier) => !tier.label || !Number.isInteger(tier.minQuantity) || tier.minQuantity < 1 || !Number.isFinite(tier.unitPrice) || tier.unitPrice < 0)) {
    throw new Error('Preencha modalidade, quantidade mínima e preço válido em todas as faixas.')
  }
  if (new Set(normalizedTiers.map((tier) => tier.minQuantity)).size !== normalizedTiers.length) {
    throw new Error('Não repita a mesma quantidade mínima em faixas de preço diferentes.')
  }
  const values = {
    name: input.name,
    description: input.description,
    shortDescription: input.shortDescription,
    price: input.price === null ? null : String(input.price),
    priceDisplay: input.priceDisplay,
    category: input.category,
    additionalCategories: Array.from(new Set(input.additionalCategories.map((category) => category.trim()).filter(Boolean))),
    subcategory: context.businessModel === 'fashion' ? input.subcategory : null,
    brand: context.businessModel === 'fashion' ? input.brand : null,
    audience: context.businessModel === 'fashion' ? input.audience : null,
    promotionalPrice: context.businessModel === 'fashion' && input.promotionalPrice !== null ? String(input.promotionalPrice) : null,
    tags: input.tags,
    characteristics: input.characteristics,
    priceTiers: normalizedTiers,
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
      await tx.delete(productVariants).where(eq(productVariants.productId, updated[0].id))
      if (context.businessModel === 'fashion' && input.variants.length > 0 && claims.tenant_id) {
        await tx.insert(productVariants).values(input.variants.map((variant) => ({
          tenantId: claims.tenant_id!, productId: updated[0].id, size: variant.size.trim(), color: variant.color.trim(),
          sku: variant.sku.trim(), stock: variant.stock,
        })))
      }
      return updated[0].id
    }
    if (!claims.tenant_id) throw new Error('Tenant não identificado.')
    const res = await tx
      .insert(products)
      .values({ ...values, tenantId: claims.tenant_id })
      .returning({ id: products.id })
    if (context.businessModel === 'fashion' && input.variants.length > 0) {
      await tx.insert(productVariants).values(input.variants.map((variant) => ({
        tenantId: claims.tenant_id!, productId: res[0].id, size: variant.size.trim(), color: variant.color.trim(),
        sku: variant.sku.trim(), stock: variant.stock,
      })))
    }
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
