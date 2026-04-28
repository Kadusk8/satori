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
  tags: string[]
  images: { url: string; thumbnailUrl: string; alt: string }[]
  isAvailable: boolean
  isFeatured: boolean
}

interface ProductCardProps {
  product: Product
  onEdit: (product: Product) => void
  onDelete: (id: string) => void
  onToggleAvailability: (id: string, available: boolean) => void
}

function formatPrice(price: number | null, display: string | null): string {
  if (display) return display
  if (price == null) return 'Sob consulta'
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
      {/* Imagem */}
      <div className="relative h-44 bg-muted overflow-hidden">
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
          <span className="text-sm font-semibold text-primary shrink-0">
            {formatPrice(product.price, product.priceDisplay)}
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
      </div>
    </div>
  )
}
