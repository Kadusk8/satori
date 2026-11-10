'use client'

import { MoreVertical, Edit, Trash2, Eye, EyeOff, Image as ImageIcon } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'

export interface Product {
  id: string
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
  priceWholesale: number | null
  priceReseller: number | null
  variants: Array<{ id?: string; size: string; color: string; sku: string; stock: number }>
  tags: string[]
  characteristics: string[]
  priceTiers: Array<{ label: string; minQuantity: number; unitPrice: number }>
  images: { url: string; thumbnailUrl: string; alt: string }[]
  isAvailable: boolean
  isFeatured: boolean
  isRunningAd: boolean
  itemKind: 'product' | 'service'
  durationMinutes: number | null
}

interface ProductCardProps {
  product: Product
  onEdit: (product: Product) => void
  onDelete: (id: string) => void
  onToggleAvailability: (id: string, available: boolean) => void
}

function formatPrice(price: number | null, display: string | null): string {
  if (display) return display
  if (price == null) return ''
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(price)
}

export function ProductCard({ product, onEdit, onDelete, onToggleAvailability }: ProductCardProps) {
  const thumbnail = product.images[0]?.thumbnailUrl ?? product.images[0]?.url ?? null

  return (
    <div
      className={cn(
        'group relative rounded-xl border bg-background overflow-hidden transition-all hover:shadow-md',
        !product.isAvailable && 'opacity-60'
      )}
    >
      {/* Imagem (quadrada) */}
      <div className="relative aspect-square bg-muted overflow-hidden">
        {thumbnail ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={thumbnail}
            alt={product.images[0].alt || product.name}
            className="h-full w-full object-cover transition-transform group-hover:scale-105"
          />
        ) : (
          <div className="flex h-full items-center justify-center text-muted-foreground">
            <ImageIcon className="h-10 w-10 opacity-30" />
          </div>
        )}

        {/* Badges */}
        <div className="absolute top-2 left-2 flex gap-1">
          {product.isFeatured && (
            <Badge className="text-[10px] px-1.5 py-0 bg-amber-500 text-white border-0">
              Destaque
            </Badge>
          )}
          {product.isRunningAd && (
            <Badge className="text-[10px] px-1.5 py-0 bg-blue-600 text-white border-0">
              Em anúncio
            </Badge>
          )}
          {!product.isAvailable && (
            <Badge variant="secondary" className="text-[10px] px-1.5 py-0">
              Indisponível
            </Badge>
          )}
        </div>

        {/* Menu */}
        <div className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity">
          <div className="relative">
            <details className="group/menu">
              <summary className="flex h-7 w-7 cursor-pointer list-none items-center justify-center rounded-lg bg-background/90 text-foreground shadow-sm hover:bg-background">
                <MoreVertical className="h-3.5 w-3.5" />
              </summary>
              <div className="absolute right-0 top-8 z-10 min-w-[140px] rounded-lg border bg-background shadow-lg py-1">
                <button
                  onClick={() => onEdit(product)}
                  className="flex w-full items-center gap-2 px-3 py-1.5 text-xs hover:bg-muted transition-colors"
                >
                  <Edit className="h-3.5 w-3.5" /> Editar
                </button>
                <button
                  onClick={() => onToggleAvailability(product.id, !product.isAvailable)}
                  className="flex w-full items-center gap-2 px-3 py-1.5 text-xs hover:bg-muted transition-colors"
                >
                  {product.isAvailable ? (
                    <><EyeOff className="h-3.5 w-3.5" /> Desativar</>
                  ) : (
                    <><Eye className="h-3.5 w-3.5" /> Ativar</>
                  )}
                </button>
                <button
                  onClick={() => onDelete(product.id)}
                  className="flex w-full items-center gap-2 px-3 py-1.5 text-xs text-destructive hover:bg-destructive/10 transition-colors"
                >
                  <Trash2 className="h-3.5 w-3.5" /> Excluir
                </button>
              </div>
            </details>
          </div>
        </div>
      </div>

      {/* Conteúdo */}
      <div className="p-3 space-y-1">
        <div className="flex items-start justify-between gap-2">
          <h3 className="font-medium text-sm leading-tight line-clamp-1">{product.name}</h3>
          <span className="shrink-0 text-right">
            {product.promotionalPrice !== null && product.price !== null && (
              <span className="block text-[10px] text-muted-foreground line-through">{formatPrice(product.price, null)}</span>
            )}
            {/* Sem preço cadastrado não mostra nada (varejo pode não ter preço definido) */}
            {(product.promotionalPrice ?? product.price) !== null || (product.promotionalPrice === null && product.priceDisplay) ? (
              <span className="block text-sm font-semibold text-primary">
                {formatPrice(product.promotionalPrice ?? product.price, product.promotionalPrice === null ? product.priceDisplay : null)}
              </span>
            ) : null}
          </span>
        </div>

        {product.shortDescription && (
          <p className="text-xs text-muted-foreground line-clamp-2">{product.shortDescription}</p>
        )}

        {product.category && (
          <span className="inline-block text-xs text-muted-foreground bg-muted rounded px-1.5 py-0.5">
            {product.category}
          </span>
        )}
        {product.additionalCategories.length > 0 && (
          <div className="flex flex-wrap gap-1 pt-1">
            {product.additionalCategories.map((category) => (
              <span key={category} className="text-[10px] bg-orange-500/10 text-orange-700 rounded px-1.5 py-0.5">
                {category}
              </span>
            ))}
          </div>
        )}

        {(product.priceWholesale !== null || product.priceReseller !== null) && (
          <p className="text-[11px] text-muted-foreground">
            {[
              product.priceWholesale !== null ? `Atacado: ${formatPrice(product.priceWholesale, null)}` : null,
              product.priceReseller !== null ? `Revenda: ${formatPrice(product.priceReseller, null)}` : null,
            ].filter(Boolean).join(' · ')}
          </p>
        )}

        {product.priceTiers.length > 0 && (
          <p className="text-[11px] text-muted-foreground">
            {[...product.priceTiers]
              .sort((a, b) => a.minQuantity - b.minQuantity)
              .map((tier) => `${tier.label}: ${tier.minQuantity}+ por ${formatPrice(tier.unitPrice, null)}`)
              .join(' · ')}
          </p>
        )}

        {product.brand && <span className="ml-1 text-xs text-muted-foreground">{product.brand}</span>}
        {product.variants.length > 0 && (
          <p className="text-xs text-muted-foreground">
            {product.variants.length} variações · {product.variants.reduce((total, variant) => total + variant.stock, 0)} em estoque
          </p>
        )}

        {product.itemKind === 'service' && product.durationMinutes && (
          <span className="inline-block text-xs text-muted-foreground ml-1">
            {product.durationMinutes} min
          </span>
        )}

        {product.tags.length > 0 && (
          <div className="flex flex-wrap gap-1 pt-1">
            {product.tags.slice(0, 3).map((tag) => (
              <span key={tag} className="text-[10px] bg-primary/10 text-primary rounded px-1.5 py-0.5">
                {tag}
              </span>
            ))}
            {product.tags.length > 3 && (
              <span className="text-[10px] text-muted-foreground">+{product.tags.length - 3}</span>
            )}
          </div>
        )}

        {product.characteristics.length > 0 && (
          <div className="flex flex-wrap gap-1 pt-1">
            {product.characteristics.slice(0, 3).map((c) => (
              <span key={c} className="text-[10px] bg-muted text-muted-foreground rounded px-1.5 py-0.5">
                {c}
              </span>
            ))}
            {product.characteristics.length > 3 && (
              <span className="text-[10px] text-muted-foreground">+{product.characteristics.length - 3}</span>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
