'use client'

import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { X, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { ImageUploader, type UploadedImage } from './image-uploader'
import type { Product } from './product-card'
import { cn } from '@/lib/utils'

const schema = z.object({
  name: z.string().min(1, 'Nome obrigatório'),
  description: z.string().optional(),
  shortDescription: z.string().max(120, 'Máx 120 caracteres').optional(),
  price: z.string().optional(),
  priceDisplay: z.string().optional(),
  category: z.string().optional(),
  tags: z.string().optional(), // CSV
  isAvailable: z.boolean(),
  isFeatured: z.boolean(),
})

type FormData = z.infer<typeof schema>

/**
 * Converte texto de preço em BRL (com ou sem separador de milhar) pra number.
 * Ex: "57.900,00" → 57900, "99,90" → 99.9, "57900" → 57900.
 * Regra: só trata a última vírgula/ponto como separador decimal se tiver 1-2
 * dígitos depois — senão, é separador de milhar (removido).
 */
function parseBRLPrice(raw: string): number | null {
  const cleaned = raw.trim().replace(/[^\d.,]/g, '')
  if (!cleaned) return null

  const decimalIndex = Math.max(cleaned.lastIndexOf(','), cleaned.lastIndexOf('.'))
  const afterDecimal = decimalIndex === -1 ? '' : cleaned.slice(decimalIndex + 1)
  const isDecimalSeparator = afterDecimal.length > 0 && afterDecimal.length <= 2

  const intPart = isDecimalSeparator ? cleaned.slice(0, decimalIndex) : cleaned
  const intDigits = intPart.replace(/[.,]/g, '')
  const normalized = isDecimalSeparator ? `${intDigits}.${afterDecimal}` : intDigits

  const value = parseFloat(normalized)
  return Number.isNaN(value) ? null : value
}

interface ProductFormProps {
  product?: Product | null
  cloudName: string
  uploadPreset: string
  onSave: (data: Omit<Product, 'id'> & { id?: string }) => Promise<void>
  onClose: () => void
}

export function ProductForm({
  product,
  cloudName,
  uploadPreset,
  onSave,
  onClose,
}: ProductFormProps) {
  const [images, setImages] = useState<UploadedImage[]>(
    product?.images.map((img) => ({
      url: img.url,
      thumbnailUrl: img.thumbnailUrl,
      publicId: img.url, // publicId não armazenado no mock
      alt: img.alt,
    })) ?? []
  )
  const [saving, setSaving] = useState(false)

  const {
    register,
    handleSubmit,
    watch,
    formState: { errors },
  } = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: {
      name: product?.name ?? '',
      description: product?.description ?? '',
      shortDescription: product?.shortDescription ?? '',
      price: product?.price != null ? String(product.price) : '',
      priceDisplay: product?.priceDisplay ?? '',
      category: product?.category ?? '',
      tags: product?.tags.join(', ') ?? '',
      isAvailable: product?.isAvailable ?? true,
      isFeatured: product?.isFeatured ?? false,
    },
  })

  const onSubmit = async (data: FormData) => {
    setSaving(true)
    try {
      await onSave({
        id: product?.id,
        name: data.name,
        description: data.description ?? null,
        shortDescription: data.shortDescription ?? null,
        price: data.price ? parseBRLPrice(data.price) : null,
        priceDisplay: data.priceDisplay ?? null,
        category: data.category ?? null,
        tags: data.tags
          ? data.tags.split(',').map((t) => t.trim()).filter(Boolean)
          : [],
        images: images.map((img) => ({
          url: img.url,
          thumbnailUrl: img.thumbnailUrl,
          alt: img.alt,
        })),
        isAvailable: data.isAvailable,
        isFeatured: data.isFeatured,
      })
      onClose()
    } finally {
      setSaving(false)
    }
  }

  return (
    /* Overlay */
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40">
      <div className="relative w-full max-w-2xl max-h-[90vh] overflow-y-auto rounded-2xl bg-background shadow-2xl">
        {/* Header */}
        <div className="sticky top-0 z-10 flex items-center justify-between border-b bg-background px-6 py-4">
          <h2 className="text-lg font-semibold">
            {product ? 'Editar produto' : 'Novo produto'}
          </h2>
          <button
            onClick={onClose}
            className="rounded-lg p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit(onSubmit)} className="p-6 space-y-5">
          {/* Imagens */}
          <div>
            <label className="block text-sm font-medium mb-2">Imagens</label>
            <ImageUploader
              images={images}
              onChange={setImages}
              cloudName={cloudName}
              uploadPreset={uploadPreset}
            />
          </div>

          {/* Nome */}
          <div>
            <label className="block text-sm font-medium mb-1.5">
              Nome <span className="text-destructive">*</span>
            </label>
            <Input {...register('name')} placeholder="Ex: Camiseta Básica" />
            {errors.name && (
              <p className="text-xs text-destructive mt-1">{errors.name.message}</p>
            )}
          </div>

          {/* Descrição curta (pra WhatsApp) */}
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="block text-sm font-medium">
                Descrição curta{' '}
                <span className="text-muted-foreground font-normal">(exibida no WhatsApp)</span>
              </label>
              <span className={cn(
                'text-xs tabular-nums',
                (watch('shortDescription')?.length ?? 0) >= 120 ? 'text-destructive' : 'text-muted-foreground'
              )}>
                {watch('shortDescription')?.length ?? 0}/120
              </span>
            </div>
            <Input
              {...register('shortDescription')}
              placeholder="Ex: Algodão 100%, disponível em P/M/G"
              maxLength={120}
            />
            <p className="text-xs text-muted-foreground mt-1">
              Texto longo é cortado ao chegar em 120 caracteres — pra descrições completas, use o campo
              &quot;Descrição completa&quot; abaixo.
            </p>
            {errors.shortDescription && (
              <p className="text-xs text-destructive mt-1">{errors.shortDescription.message}</p>
            )}
          </div>

          {/* Descrição completa */}
          <div>
            <label className="block text-sm font-medium mb-1.5">Descrição completa</label>
            <Textarea
              {...register('description')}
              placeholder="Descrição detalhada do produto..."
              rows={3}
            />
          </div>

          {/* Preço */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium mb-1.5">Preço (R$)</label>
              <Input
                {...register('price')}
                placeholder="57.900,00"
                type="text"
                inputMode="decimal"
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1.5">
                Exibição do preço{' '}
                <span className="text-muted-foreground font-normal">(sobrescreve)</span>
              </label>
              <Input
                {...register('priceDisplay')}
                placeholder="A partir de R$ 99,90"
              />
            </div>
          </div>

          {/* Categoria e tags */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium mb-1.5">Categoria</label>
              <Input {...register('category')} placeholder="Ex: Roupas" />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1.5">
                Tags{' '}
                <span className="text-muted-foreground font-normal">(vírgula)</span>
              </label>
              <Input {...register('tags')} placeholder="promo, novo, destaque" />
            </div>
          </div>

          {/* Switches */}
          <div className="flex gap-6">
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                {...register('isAvailable')}
                className="h-4 w-4 rounded accent-primary"
              />
              <span className="text-sm">Disponível</span>
            </label>
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                {...register('isFeatured')}
                className="h-4 w-4 rounded accent-primary"
              />
              <span className="text-sm">Produto em destaque</span>
            </label>
          </div>

          {/* Ações */}
          <div className="flex justify-end gap-3 pt-2 border-t">
            <Button type="button" variant="outline" onClick={onClose} disabled={saving}>
              Cancelar
            </Button>
            <Button type="submit" disabled={saving} className="gap-2">
              {saving && <Loader2 className="h-4 w-4 animate-spin" />}
              {product ? 'Salvar alterações' : 'Criar produto'}
            </Button>
          </div>
        </form>
      </div>
    </div>
  )
}
