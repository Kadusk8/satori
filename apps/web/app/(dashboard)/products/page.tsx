'use client'

export const dynamic = 'force-dynamic'

import { useState, useMemo, useEffect, useCallback } from 'react'
import { Plus, Search, LayoutGrid, LayoutList, Package, Loader2, FileSpreadsheet } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { ProductCard, type Product } from '@/components/products/product-card'
import { ProductForm } from '@/components/products/product-form'
import { ImportDialog } from '@/components/products/import-dialog'
import { cn } from '@/lib/utils'
import { getCatalogContext, listProducts, listProductCategories, saveProduct, deleteProduct, setProductAvailable } from '@/lib/data/products'
import { toast } from 'sonner'

// Configuração Cloudinary — vem do tenant no banco (fallback para dev)
const CLOUDINARY_CLOUD_NAME = process.env.NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME ?? 'demo'
const CLOUDINARY_UPLOAD_PRESET = process.env.NEXT_PUBLIC_CLOUDINARY_UPLOAD_PRESET ?? 'ml_default'

// ── Tipos do banco ────────────────────────────────────────────────────────────

interface DBProduct {
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
  price_wholesale: number | null
  price_reseller: number | null
  variants: Array<{ id?: string; size: string; color: string; sku: string; stock: number }>
  tags: string[]
  characteristics: string[]
  price_tiers: Array<{ label: string; minQuantity: number; unitPrice: number }>
  images: { url: string; thumbnailUrl: string; alt: string }[]
  is_available: boolean
  is_featured: boolean
  is_running_ad: boolean
  item_kind: 'product' | 'service'
  duration_minutes: number | null
}

function mapProduct(row: DBProduct): Product {
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    shortDescription: row.short_description,
    price: row.price,
    priceDisplay: row.price_display,
    category: row.category,
    additionalCategories: row.additional_categories ?? [],
    subcategory: row.subcategory,
    brand: row.brand,
    audience: row.audience,
    promotionalPrice: row.promotional_price,
    priceWholesale: row.price_wholesale,
    priceReseller: row.price_reseller,
    variants: row.variants ?? [],
    tags: row.tags ?? [],
    characteristics: row.characteristics ?? [],
    priceTiers: row.price_tiers ?? [],
    images: (row.images ?? []) as { url: string; thumbnailUrl: string; alt: string }[],
    isAvailable: row.is_available,
    isFeatured: row.is_featured,
    isRunningAd: row.is_running_ad,
    itemKind: row.item_kind,
    durationMinutes: row.duration_minutes,
  }
}

type ViewMode = 'grid' | 'list'
type FilterStatus = 'all' | 'available' | 'unavailable' | 'featured' | 'running_ad'

export default function ProductsPage() {
  const [businessModel, setBusinessModel] = useState<'product' | 'fashion' | 'service'>('product')
  const [priceTypes, setPriceTypes] = useState(false)
  const [products, setProducts] = useState<Product[]>([])
  const [categories, setCategories] = useState<string[]>([])
  const [registeredCategories, setRegisteredCategories] = useState<string[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [filterStatus, setFilterStatus] = useState<FilterStatus>('all')
  const [filterCategory, setFilterCategory] = useState('Todas')
  const [viewMode, setViewMode] = useState<ViewMode>('grid')
  const [showForm, setShowForm] = useState(false)
  const [showImport, setShowImport] = useState(false)
  const [formProduct, setFormProduct] = useState<Product | null>(null)

  // ── Carrega produtos ────────────────────────────────────────────────────────

  const loadProducts = useCallback(async () => {
    try {
      const data = await listProducts()
      const mapped = data.map((p) => mapProduct(p as unknown as DBProduct))
      setProducts(mapped)
      const cats = Array.from(new Set(mapped.flatMap((p) => [p.category, ...p.additionalCategories]).filter(Boolean) as string[])).sort()
      setCategories(cats)
    } catch (err) {
      toast.error(`Erro ao carregar ${businessModel === 'service' ? 'serviços' : 'produtos'}: ` + (err instanceof Error ? err.message : 'erro'))
    }
  }, [businessModel])

  useEffect(() => {
    setIsLoading(true)
    loadProducts().finally(() => setIsLoading(false))
  }, [loadProducts])

  useEffect(() => { getCatalogContext().then((ctx) => { setBusinessModel(ctx.businessModel); setPriceTypes(ctx.priceTypes) }).catch(() => {}) }, [])

  useEffect(() => {
    listProductCategories()
      .then(setRegisteredCategories)
      .catch(() => {})
  }, [])

  // ── Filtros ─────────────────────────────────────────────────────────────────

  const filtered = useMemo(() => {
    return products.filter((p) => {
      const matchSearch =
        !search ||
        p.name.toLowerCase().includes(search.toLowerCase()) ||
        p.category?.toLowerCase().includes(search.toLowerCase()) ||
        p.additionalCategories.some((category) => category.toLowerCase().includes(search.toLowerCase())) ||
        p.subcategory?.toLowerCase().includes(search.toLowerCase()) ||
        p.brand?.toLowerCase().includes(search.toLowerCase()) ||
        p.tags.some((t) => t.toLowerCase().includes(search.toLowerCase())) ||
        p.characteristics.some((c) => c.toLowerCase().includes(search.toLowerCase())) ||
        p.variants.some((variant) => [variant.size, variant.color, variant.sku].some((value) => value.toLowerCase().includes(search.toLowerCase())))

      const matchStatus =
        filterStatus === 'all' ||
        (filterStatus === 'available' && p.isAvailable) ||
        (filterStatus === 'unavailable' && !p.isAvailable) ||
        (filterStatus === 'featured' && p.isFeatured) ||
        (filterStatus === 'running_ad' && p.isRunningAd)

      const matchCategory =
        filterCategory === 'Todas' || p.category === filterCategory || p.additionalCategories.includes(filterCategory)

      return matchSearch && matchStatus && matchCategory
    })
  }, [products, search, filterStatus, filterCategory])

  // ── CRUD ────────────────────────────────────────────────────────────────────

  const handleSave = useCallback(async (data: Omit<Product, 'id'> & { id?: string }) => {
    try {
      const { id } = await saveProduct({
        id: data.id,
        name: data.name,
        description: data.description,
        shortDescription: data.shortDescription,
        price: data.price,
        priceDisplay: data.priceDisplay,
        category: data.category,
        additionalCategories: data.additionalCategories,
        subcategory: data.subcategory,
        brand: data.brand,
        audience: data.audience,
        promotionalPrice: data.promotionalPrice,
        priceWholesale: data.priceWholesale,
        priceReseller: data.priceReseller,
        variants: data.variants,
        tags: data.tags,
        characteristics: data.characteristics,
        priceTiers: data.priceTiers,
        images: data.images,
        isAvailable: data.isAvailable,
        isFeatured: data.isFeatured,
        isRunningAd: data.isRunningAd,
        durationMinutes: data.durationMinutes,
      })

      if (data.id) {
        setProducts((prev) => prev.map((p) => (p.id === data.id ? { ...p, ...data, id: data.id! } : p)))
        toast.success(`${businessModel === 'service' ? 'Serviço' : 'Produto'} atualizado.`)
      } else {
        setProducts((prev) => [{ ...data, id }, ...prev])
        toast.success(`${businessModel === 'service' ? 'Serviço' : 'Produto'} criado.`)
      }

      setCategories((prev) => {
        return Array.from(new Set([...prev, ...(data.category ? [data.category] : []), ...data.additionalCategories])).sort()
      })
    } catch (err) {
      toast.error(`Erro ao salvar ${businessModel === 'service' ? 'serviço' : 'produto'}: ` + (err instanceof Error ? err.message : 'erro'))
    }
  }, [businessModel])

  const handleDelete = useCallback(async (id: string) => {
    try {
      await deleteProduct(id)
      setProducts((prev) => prev.filter((p) => p.id !== id))
      toast.success(`${businessModel === 'service' ? 'Serviço' : 'Produto'} excluído.`)
    } catch (err) {
      toast.error(`Erro ao excluir ${businessModel === 'service' ? 'serviço' : 'produto'}: ` + (err instanceof Error ? err.message : 'erro'))
    }
  }, [businessModel])

  const handleToggleAvailability = useCallback(async (id: string, available: boolean) => {
    try {
      await setProductAvailable(id, available)
      setProducts((prev) => prev.map((p) => (p.id === id ? { ...p, isAvailable: available } : p)))
    } catch (err) {
      toast.error('Erro ao atualizar disponibilidade: ' + (err instanceof Error ? err.message : 'erro'))
    }
  }, [])

  const openNew = () => {
    setFormProduct(null)
    setShowForm(true)
  }

  const openEdit = (product: Product) => {
    setFormProduct(product)
    setShowForm(true)
  }

  // ── Render ──────────────────────────────────────────────────────────────────

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-screen text-muted-foreground text-sm gap-2">
        <Loader2 className="h-4 w-4 animate-spin" />
        Carregando {businessModel === 'service' ? 'serviços' : 'produtos'}...
      </div>
    )
  }

  const allCategories = ['Todas', ...categories]
  const singularLabel = businessModel === 'service' ? 'serviço' : businessModel === 'fashion' ? 'roupa' : 'produto'
  const pluralLabel = businessModel === 'service' ? 'Serviços' : businessModel === 'fashion' ? 'Roupas' : 'Produtos'
  const newItemLabel = businessModel === 'fashion' ? 'Nova roupa' : `Novo ${singularLabel}`

  return (
    <div className="p-8 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">{pluralLabel}</h1>
          <p className="text-muted-foreground text-sm mt-1">
            {products.filter((p) => p.isAvailable).length} disponíveis ·{' '}
            {products.length} no total
          </p>
        </div>
        <div className="flex items-center gap-2">
          {businessModel === 'product' && (
            <Button variant="outline" onClick={() => setShowImport(true)} className="gap-2">
              <FileSpreadsheet className="h-4 w-4" />
              Importar planilha
            </Button>
          )}
          <Button onClick={openNew} className="gap-2">
            <Plus className="h-4 w-4" />
            {newItemLabel}
          </Button>
        </div>
      </div>

      {businessModel === 'product' && (
        <ImportDialog
          open={showImport}
          priceTypes={priceTypes}
          onClose={() => setShowImport(false)}
          onImported={() => { void loadProducts() }}
        />
      )}

      {/* Barra de filtros */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-[200px] max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Buscar por nome, categoria ou tag..."
            className="pl-9"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>

        {/* Status */}
        <div className="flex rounded-lg border overflow-hidden text-sm">
          {([
            { value: 'all', label: 'Todos' },
            { value: 'available', label: 'Disponíveis' },
            { value: 'unavailable', label: 'Indisponíveis' },
            { value: 'featured', label: 'Destaques' },
            { value: 'running_ad', label: 'Em anúncio' },
          ] as const).map((opt) => (
            <button
              key={opt.value}
              onClick={() => setFilterStatus(opt.value)}
              className={cn(
                'px-3 py-1.5 transition-colors',
                filterStatus === opt.value
                  ? 'bg-primary text-primary-foreground'
                  : 'hover:bg-muted text-muted-foreground'
              )}
            >
              {opt.label}
            </button>
          ))}
        </div>

        {/* Categoria */}
        {allCategories.length > 1 && (
          <div className="flex rounded-lg border overflow-hidden text-sm">
            {allCategories.map((cat) => (
              <button
                key={cat}
                onClick={() => setFilterCategory(cat)}
                className={cn(
                  'px-3 py-1.5 transition-colors',
                  filterCategory === cat
                    ? 'bg-primary text-primary-foreground'
                    : 'hover:bg-muted text-muted-foreground'
                )}
              >
                {cat}
              </button>
            ))}
          </div>
        )}

        {/* View toggle */}
        <div className="ml-auto flex rounded-lg border overflow-hidden">
          <button
            onClick={() => setViewMode('grid')}
            className={cn(
              'p-1.5 transition-colors',
              viewMode === 'grid' ? 'bg-primary text-primary-foreground' : 'hover:bg-muted text-muted-foreground'
            )}
          >
            <LayoutGrid className="h-4 w-4" />
          </button>
          <button
            onClick={() => setViewMode('list')}
            className={cn(
              'p-1.5 transition-colors',
              viewMode === 'list' ? 'bg-primary text-primary-foreground' : 'hover:bg-muted text-muted-foreground'
            )}
          >
            <LayoutList className="h-4 w-4" />
          </button>
        </div>
      </div>

      {/* Grid / Lista */}
      {filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-muted-foreground gap-3">
          <Package className="h-12 w-12 opacity-30" />
          <p className="text-sm">
            {products.length === 0 ? `Nenhum item cadastrado em ${pluralLabel.toLowerCase()}` : `Nenhum item encontrado em ${pluralLabel.toLowerCase()}`}
          </p>
          {products.length === 0 && (
            <Button variant="outline" size="sm" onClick={openNew}>
              Cadastrar {singularLabel}
            </Button>
          )}
        </div>
      ) : viewMode === 'grid' ? (
        <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-4">
          {filtered.map((product) => (
            <ProductCard
              key={product.id}
              product={product}
              onEdit={openEdit}
              onDelete={handleDelete}
              onToggleAvailability={handleToggleAvailability}
            />
          ))}
        </div>
      ) : (
        <div className="rounded-lg border bg-background overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-muted/30">
                <th className="text-left font-medium text-muted-foreground px-4 py-3">{singularLabel[0].toUpperCase() + singularLabel.slice(1)}</th>
                <th className="text-left font-medium text-muted-foreground px-4 py-3">Categoria</th>
                <th className="text-left font-medium text-muted-foreground px-4 py-3">Preço</th>
                <th className="text-left font-medium text-muted-foreground px-4 py-3">Status</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y">
              {filtered.map((p) => (
                <tr key={p.id} className="hover:bg-muted/30 transition-colors">
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-3">
                      <div className="h-10 w-10 rounded-lg bg-muted overflow-hidden shrink-0">
                        {p.images[0] ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            src={p.images[0].thumbnailUrl || p.images[0].url}
                            alt={p.images[0].alt}
                            className="h-full w-full object-cover"
                          />
                        ) : (
                          <div className="h-full w-full flex items-center justify-center">
                            <Package className="h-4 w-4 text-muted-foreground" />
                          </div>
                        )}
                      </div>
                      <div>
                        <p className="font-medium">{p.name}</p>
                        {p.shortDescription && (
                          <p className="text-xs text-muted-foreground line-clamp-1">{p.shortDescription}</p>
                        )}
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">{p.category ?? '—'}</td>
                  <td className="px-4 py-3 font-medium">
                    {p.promotionalPrice != null
                      ? new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(p.promotionalPrice)
                      : p.priceDisplay ?? (p.price != null
                      ? new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(p.price)
                      : '—')}
                  </td>
                  <td className="px-4 py-3">
                    <span className={cn(
                      'rounded-full px-2 py-0.5 text-xs font-medium',
                      p.isAvailable
                        ? 'bg-green-500/10 text-green-600'
                        : 'bg-muted text-muted-foreground'
                    )}>
                      {p.isAvailable ? 'Disponível' : 'Indisponível'}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <Button variant="ghost" size="sm" onClick={() => openEdit(p)}>
                      Editar
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Modal de produto */}
      {showForm && (
        <ProductForm
          product={formProduct}
          cloudName={CLOUDINARY_CLOUD_NAME}
          uploadPreset={CLOUDINARY_UPLOAD_PRESET}
          categories={registeredCategories}
        businessModel={businessModel}
        priceTypes={priceTypes}
          onSave={handleSave}
          onClose={() => setShowForm(false)}
        />
      )}
    </div>
  )
}
