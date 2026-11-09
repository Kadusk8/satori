'use client'

import { useState, type KeyboardEvent } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { X, Loader2, Plus } from 'lucide-react'
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
  subcategory: z.string().optional(),
  brand: z.string().optional(),
  audience: z.enum(['female', 'male', 'kids', 'unisex']).optional(),
  promotionalPrice: z.string().optional(),
  tags: z.string().optional(), // CSV
  isAvailable: z.boolean(),
  isFeatured: z.boolean(),
  isRunningAd: z.boolean(),
  durationMinutes: z.number().int().min(5).optional(),
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
  categories: string[]
  businessModel: 'product' | 'fashion' | 'service'
  onSave: (data: Omit<Product, 'id'> & { id?: string }) => Promise<void>
  onClose: () => void
}

export function ProductForm({
  product,
  cloudName,
  uploadPreset,
  categories,
  businessModel,
  onSave,
  onClose,
}: ProductFormProps) {
  const itemLabel = businessModel === 'service' ? 'serviço' : businessModel === 'fashion' ? 'roupa' : 'produto'
  const newItemLabel = businessModel === 'fashion' ? 'Nova roupa' : `Novo ${itemLabel}`
  const [images, setImages] = useState<UploadedImage[]>(
    product?.images.map((img) => ({
      url: img.url,
      thumbnailUrl: img.thumbnailUrl,
      publicId: img.url, // publicId não armazenado no mock
      alt: img.alt,
    })) ?? []
  )
  const [saving, setSaving] = useState(false)
  const [characteristics, setCharacteristics] = useState<string[]>(product?.characteristics ?? [])
  const [characteristicInput, setCharacteristicInput] = useState('')
  const [additionalCategories, setAdditionalCategories] = useState<string[]>(product?.additionalCategories ?? [])
  const [additionalCategoryInput, setAdditionalCategoryInput] = useState('')
  const [priceTiers, setPriceTiers] = useState(product?.priceTiers ?? [])
  const [variants, setVariants] = useState(product?.variants ?? [])

  const addCharacteristic = () => {
    const value = characteristicInput.trim()
    if (!value || characteristics.includes(value)) return
    setCharacteristics((prev) => [...prev, value])
    setCharacteristicInput('')
  }

  const removeCharacteristic = (value: string) => {
    setCharacteristics((prev) => prev.filter((c) => c !== value))
  }

  const onCharacteristicKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' || e.key === ',') {
      e.preventDefault()
      addCharacteristic()
    }
  }

  const addAdditionalCategory = () => {
    const value = additionalCategoryInput.trim()
    if (!value || additionalCategories.some((category) => category.toLowerCase() === value.toLowerCase())) return
    setAdditionalCategories((prev) => [...prev, value])
    setAdditionalCategoryInput('')
  }

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
      subcategory: product?.subcategory ?? '',
      brand: product?.brand ?? '',
      audience: product?.audience ?? undefined,
      promotionalPrice: product?.promotionalPrice != null ? String(product.promotionalPrice) : '',
      tags: product?.tags.join(', ') ?? '',
      isAvailable: product?.isAvailable ?? true,
      isFeatured: product?.isFeatured ?? false,
      isRunningAd: product?.isRunningAd ?? false,
      durationMinutes: product?.durationMinutes ?? 30,
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
        additionalCategories,
        subcategory: businessModel === 'fashion' ? data.subcategory ?? null : null,
        brand: businessModel === 'fashion' ? data.brand ?? null : null,
        audience: businessModel === 'fashion' ? data.audience ?? null : null,
        promotionalPrice: businessModel === 'fashion' && data.promotionalPrice ? parseBRLPrice(data.promotionalPrice) : null,
        variants: businessModel === 'fashion' ? variants : [],
        tags: data.tags
          ? data.tags.split(',').map((t) => t.trim()).filter(Boolean)
          : [],
        characteristics,
        priceTiers,
        images: images.map((img) => ({
          url: img.url,
          thumbnailUrl: img.thumbnailUrl,
          alt: img.alt,
        })),
        isAvailable: data.isAvailable,
        isFeatured: data.isFeatured,
        isRunningAd: data.isRunningAd,
        itemKind: businessModel === 'service' ? 'service' : 'product',
        durationMinutes: businessModel === 'service' ? (data.durationMinutes ?? 30) : null,
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
            {product ? `Editar ${itemLabel}` : newItemLabel}
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
            <Input {...register('name')} placeholder={businessModel === 'service' ? 'Ex: Consulta dermatológica' : 'Ex: Camiseta Básica'} />
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
              placeholder={businessModel === 'service' ? 'Ex: Avaliação completa com duração de 30 minutos' : 'Ex: Algodão 100%, disponível em P/M/G'}
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
              placeholder={`Descrição detalhada do ${businessModel === 'service' ? 'serviço' : 'produto'}...`}
              rows={3}
            />
          </div>

          {/* Características */}
          <div>
            <label className="block text-sm font-medium mb-1.5">Características</label>
            <p className="text-xs text-muted-foreground mb-2">
              Cadastre quantas forem necessárias (cor, tamanho, modelo, voltagem, ano, material...).
              A IA usa isso pra identificar {businessModel === 'service' ? 'o serviço' : 'o produto'} certo mesmo quando o cliente pergunta por um
              detalhe que não está na descrição.
            </p>
            <div className="flex gap-2">
              <Input
                value={characteristicInput}
                onChange={(e) => setCharacteristicInput(e.target.value)}
                onKeyDown={onCharacteristicKeyDown}
                placeholder="Ex: Cor preta"
              />
              <Button type="button" variant="outline" size="icon" onClick={addCharacteristic}>
                <Plus className="h-4 w-4" />
              </Button>
            </div>
            {characteristics.length > 0 && (
              <div className="flex flex-wrap gap-1.5 mt-2">
                {characteristics.map((c) => (
                  <span
                    key={c}
                    className="inline-flex items-center gap-1 text-xs bg-muted rounded-full pl-2.5 pr-1 py-1"
                  >
                    {c}
                    <button
                      type="button"
                      onClick={() => removeCharacteristic(c)}
                      className="rounded-full p-0.5 hover:bg-background transition-colors"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </span>
                ))}
              </div>
            )}
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

          {businessModel !== 'service' && (
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <div>
                  <label className="block text-sm font-medium">Faixas de preço por quantidade</label>
                  <p className="text-xs text-muted-foreground">A IA aplica a faixa com a maior quantidade mínima atendida pelo pedido.</p>
                </div>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setPriceTiers((prev) => [...prev, { label: '', minQuantity: 1, unitPrice: 0 }])}
                >
                  <Plus className="h-3.5 w-3.5 mr-1" /> Adicionar faixa
                </Button>
              </div>
              {priceTiers.map((tier, index) => (
                <div key={index} className="grid grid-cols-[1fr_110px_130px_36px] gap-2 items-end rounded-lg border p-3">
                  <div>
                    <label className="text-xs text-muted-foreground">Modalidade</label>
                    <Input
                      value={tier.label}
                      placeholder="Ex: Atacado"
                      onChange={(e) => setPriceTiers((prev) => prev.map((item, i) => i === index ? { ...item, label: e.target.value } : item))}
                    />
                  </div>
                  <div>
                    <label className="text-xs text-muted-foreground">Mínimo</label>
                    <Input
                      type="number"
                      min={1}
                      value={tier.minQuantity}
                      onChange={(e) => setPriceTiers((prev) => prev.map((item, i) => i === index ? { ...item, minQuantity: Number(e.target.value) } : item))}
                    />
                  </div>
                  <div>
                    <label className="text-xs text-muted-foreground">Preço unitário</label>
                    <Input
                      type="number"
                      min={0}
                      step="0.01"
                      value={tier.unitPrice}
                      onChange={(e) => setPriceTiers((prev) => prev.map((item, i) => i === index ? { ...item, unitPrice: Number(e.target.value) } : item))}
                    />
                  </div>
                  <Button type="button" variant="ghost" size="icon" onClick={() => setPriceTiers((prev) => prev.filter((_, i) => i !== index))}>
                    <X className="h-4 w-4" />
                  </Button>
                </div>
              ))}
            </div>
          )}

          {businessModel === 'fashion' && (
            <>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium mb-1.5">Subcategoria</label>
                  <Input {...register('subcategory')} placeholder="Ex: Camisetas" />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1.5">Marca</label>
                  <Input {...register('brand')} placeholder="Ex: Nike" />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1.5">Público</label>
                  <select {...register('audience')} className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm">
                    <option value="">Selecione</option>
                    <option value="female">Feminino</option>
                    <option value="male">Masculino</option>
                    <option value="kids">Infantil</option>
                    <option value="unisex">Unissex</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1.5">Preço promocional (R$)</label>
                  <Input {...register('promotionalPrice')} placeholder="79,90" inputMode="decimal" />
                </div>
              </div>

              <div className="space-y-3 rounded-lg border p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="text-sm font-semibold">Variações de tamanho e cor</h3>
                    <p className="text-xs text-muted-foreground">Cada combinação possui SKU e estoque próprios.</p>
                  </div>
                  <Button type="button" variant="outline" size="sm" onClick={() => setVariants((current) => [...current, { size: '', color: '', sku: '', stock: 0 }])}>
                    <Plus className="mr-1 h-3.5 w-3.5" /> Adicionar
                  </Button>
                </div>
                {variants.map((variant, index) => (
                  <div key={variant.id ?? index} className="grid grid-cols-2 sm:grid-cols-[1fr_1fr_1.4fr_0.8fr_auto] gap-2 items-end">
                    <div><label className="text-xs">Tamanho</label><Input value={variant.size} placeholder="M" onChange={(e) => setVariants((current) => current.map((item, i) => i === index ? { ...item, size: e.target.value } : item))} /></div>
                    <div><label className="text-xs">Cor</label><Input value={variant.color} placeholder="Preta" onChange={(e) => setVariants((current) => current.map((item, i) => i === index ? { ...item, color: e.target.value } : item))} /></div>
                    <div><label className="text-xs">SKU</label><Input value={variant.sku} placeholder="CAM-PRE-M" onChange={(e) => setVariants((current) => current.map((item, i) => i === index ? { ...item, sku: e.target.value } : item))} /></div>
                    <div><label className="text-xs">Estoque</label><Input type="number" min={0} value={variant.stock} onChange={(e) => setVariants((current) => current.map((item, i) => i === index ? { ...item, stock: Number(e.target.value) } : item))} /></div>
                    <Button type="button" variant="ghost" size="icon" aria-label="Remover variação" onClick={() => setVariants((current) => current.filter((_, i) => i !== index))}><X className="h-4 w-4" /></Button>
                  </div>
                ))}
                {variants.length === 0 && <p className="text-xs text-muted-foreground">Nenhuma variação cadastrada.</p>}
              </div>
            </>
          )}

          {businessModel === 'service' && (
            <div>
              <label className="block text-sm font-medium mb-1.5">Duração do serviço (minutos)</label>
              <Input {...register('durationMinutes', { valueAsNumber: true })} type="number" min={5} step={5} />
              {errors.durationMinutes && <p className="text-xs text-destructive mt-1">Informe no mínimo 5 minutos.</p>}
            </div>
          )}

          {/* Categorias */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium mb-1.5">Categoria</label>
              <Input {...register('category')} placeholder="Ex: Roupas" list="product-categories-list" />
              <datalist id="product-categories-list">
                {categories.map((c) => (
                  <option key={c} value={c} />
                ))}
              </datalist>
            </div>
            <div>
              <label className="block text-sm font-medium mb-1.5">Outras categorias</label>
              <div className="flex gap-2">
                <Input
                  value={additionalCategoryInput}
                  placeholder="Ex: Lançamentos"
                  onChange={(e) => setAdditionalCategoryInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ',') {
                      e.preventDefault()
                      addAdditionalCategory()
                    }
                  }}
                />
                <Button type="button" variant="outline" size="icon" onClick={addAdditionalCategory}><Plus className="h-4 w-4" /></Button>
              </div>
              {additionalCategories.length > 0 && (
                <div className="flex flex-wrap gap-1.5 mt-2">
                  {additionalCategories.map((category) => (
                    <span key={category} className="inline-flex items-center gap-1 text-xs bg-orange-500/10 text-orange-700 rounded-full pl-2.5 pr-1 py-1">
                      {category}
                      <button type="button" onClick={() => setAdditionalCategories((prev) => prev.filter((item) => item !== category))} className="rounded-full p-0.5 hover:bg-background">
                        <X className="h-3 w-3" />
                      </button>
                    </span>
                  ))}
                </div>
              )}
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium mb-1.5">
              Tags internas <span className="text-muted-foreground font-normal">(separadas por vírgula)</span>
            </label>
            <Input {...register('tags')} placeholder="promo, destaque" />
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
              <span className="text-sm">{businessModel === 'service' ? 'Serviço em destaque' : 'Produto em destaque'}</span>
            </label>
            {businessModel !== 'service' && <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                {...register('isRunningAd')}
                className="h-4 w-4 rounded accent-primary"
              />
              <span className="text-sm">Em anúncio (Facebook/Instagram Ads)</span>
            </label>}
          </div>

          {/* Ações */}
          <div className="flex justify-end gap-3 pt-2 border-t">
            <Button type="button" variant="outline" onClick={onClose} disabled={saving}>
              Cancelar
            </Button>
            <Button type="submit" disabled={saving} className="gap-2">
              {saving && <Loader2 className="h-4 w-4 animate-spin" />}
              {product ? 'Salvar alterações' : `Criar ${itemLabel}`}
            </Button>
          </div>
        </form>
      </div>
    </div>
  )
}
