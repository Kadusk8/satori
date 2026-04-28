'use client'

export const dynamic = 'force-dynamic'

import { useState, useMemo, useEffect, useCallback } from 'react'
import { Plus, Search, LayoutGrid, LayoutList, Package, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { ProductCard, type Product } from '@/components/products/product-card'
import { ProductForm } from '@/components/products/product-form'
import { cn } from '@/lib/utils'
import { createClient } from '@/lib/supabase/client'
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
  tags: string[]
  images: { url: string; thumbnailUrl: string; alt: string }[]
  is_available: boolean
  is_featured: boolean
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
    tags: row.tags ?? [],
    images: (row.images ?? []) as { url: string; thumbnailUrl: string; alt: string }[],
    isAvailable: row.is_available,
    isFeatured: row.is_featured,
  }
}

type ViewMode = 'grid' | 'list'
type FilterStatus = 'all' | 'available' | 'unavailable' | 'featured'

export default function ProductsPage() {
  const [products, setProducts] = useState<Product[]>([])
  const [categories, setCategories] = useState<string[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [tenantId, setTenantId] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [filterStatus, setFilterStatus] = useState<FilterStatus>('all')
  const [filterCategory, setFilterCategory] = useState('Todas')
  const [viewMode, setViewMode] = useState<ViewMode>('grid')
  const [showForm, setShowForm] = useState(false)
  const [formProduct, setFormProduct] = useState<Product | null>(null)

  // ── Carrega produtos ────────────────────────────────────────────────────────

  const loadProducts = useCallback(async () => {
    const supabase = createClient()

    // Carrega tenant_id do usuário logado (via JWT claims ou tabela users)
    if (!tenantId) {
      const { data: { user } } = await supabase.auth.getUser()
      const tid = (user?.app_metadata?.tenant_id ?? user?.user_metadata?.tenant_id) as string | undefined
      if (tid) setTenantId(tid)
    }

    const { data, error } = await supabase
      .from('products')
      .select('id, name, description, short_description, price, price_display, category, tags, images, is_available, is_featured')
      .order('created_at', { ascending: false })

    if (error) {
      toast.error('Erro ao carregar produtos: ' + error.message)
      return
    }

    const mapped = (data ?? []).map((p) => mapProduct(p as unknown as DBProduct))
    setProducts(mapped)

    // Extrai categorias únicas
    const cats = Array.from(new Set(mapped.map((p) => p.category).filter(Boolean) as string[])).sort()
    setCategories(cats)
  }, [])

  useEffect(() => {
    setIsLoading(true)
    loadProducts().finally(() => setIsLoading(false))
  }, [loadProducts])

  // ── Filtros ─────────────────────────────────────────────────────────────────

  const filtered = useMemo(() => {
    return products.filter((p) => {
      const matchSearch =
        !search ||
        p.name.toLowerCase().includes(search.toLowerCase()) ||
        p.category?.toLowerCase().includes(search.toLowerCase()) ||
        p.tags.some((t) => t.toLowerCase().includes(search.toLowerCase()))

      const matchStatus =
        filterStatus === 'all' ||
        (filterStatus === 'available' && p.isAvailable) ||
        (filterStatus === 'unavailable' && !p.isAvailable) ||
        (filterStatus === 'featured' && p.isFeatured)

      const matchCategory =
        filterCategory === 'Todas' || p.category === filterCategory

      return matchSearch && matchStatus && matchCategory
    })
  }, [products, search, filterStatus, filterCategory])

  // ── CRUD ────────────────────────────────────────────────────────────────────

  const handleSave = useCallback(async (data: Omit<Product, 'id'> & { id?: string }) => {
    const supabase = createClient()

    // Resolve tenant_id: do state ou busca novamente
    let tid = tenantId
    if (!tid) {
      const { data: { user } } = await supabase.auth.getUser()
      tid = (user?.app_metadata?.tenant_id ?? user?.user_metadata?.tenant_id) as string | null
      // Super admin: busca tenant pelo JWT claim is_super_admin (não tem tenant_id próprio)
      // Nesse caso precisa que o produto já exista (update) ou que o super admin acesse via painel admin
      if (!tid) {
        // Tenta extrair do JWT decodificado
        const { data: { session } } = await supabase.auth.getSession()
        const jwt = session?.access_token
        if (jwt) {
          try {
            const payload = JSON.parse(atob(jwt.split('.')[1]))
            tid = payload.tenant_id ?? null
          } catch { /* ignore */ }
        }
      }
    }

    const payload = {
      name: data.name,
      description: data.description,
      short_description: data.shortDescription,
      price: data.price,
      price_display: data.priceDisplay,
      category: data.category,
      tags: data.tags,
      images: data.images,
      is_available: data.isAvailable,
      is_featured: data.isFeatured,
    }

    if (data.id) {
      const { error } = await supabase
        .from('products')
        .update(payload)
        .eq('id', data.id)

      if (error) {
        toast.error('Erro ao salvar produto: ' + error.message)
        return
      }

      setProducts((prev) =>
        prev.map((p) => (p.id === data.id ? { ...p, ...data, id: data.id! } : p))
      )
      toast.success('Produto atualizado.')
    } else {
      if (!tid) {
        toast.error('Não foi possível identificar o tenant. Faça login novamente.')
        return
      }

      const { data: inserted, error } = await supabase
        .from('products')
        .insert({ ...payload, tenant_id: tid })
        .select('id')
        .single()

      if (error || !inserted) {
        toast.error('Erro ao criar produto: ' + (error?.message ?? 'erro desconhecido'))
        return
      }

      setProducts((prev) => [{ ...data, id: inserted.id }, ...prev])
      toast.success('Produto criado.')
    }

    // Atualiza categorias
    setCategories((prev) => {
      if (!data.category) return prev
      return Array.from(new Set([...prev, data.category])).sort()
    })
  }, [])

  const handleDelete = useCallback(async (id: string) => {
    const supabase = createClient()
    const { error } = await supabase.from('products').delete().eq('id', id)

    if (error) {
      toast.error('Erro ao excluir produto: ' + error.message)
      return
    }

    setProducts((prev) => prev.filter((p) => p.id !== id))
    toast.success('Produto excluído.')
  }, [])

  const handleToggleAvailability = useCallback(async (id: string, available: boolean) => {
    const supabase = createClient()
    const { error } = await supabase
      .from('products')
      .update({ is_available: available })
      .eq('id', id)

    if (error) {
      toast.error('Erro ao atualizar disponibilidade: ' + error.message)
      return
    }

    setProducts((prev) => prev.map((p) => (p.id === id ? { ...p, isAvailable: available } : p)))
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
        Carregando produtos...
      </div>
    )
  }

  const allCategories = ['Todas', ...categories]

  return (
    <div className="p-8 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Produtos</h1>
          <p className="text-muted-foreground text-sm mt-1">
            {products.filter((p) => p.isAvailable).length} disponíveis ·{' '}
            {products.length} no total
          </p>
        </div>
        <Button onClick={openNew} className="gap-2">
          <Plus className="h-4 w-4" />
          Novo produto
        </Button>
      </div>

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
            {products.length === 0 ? 'Nenhum produto cadastrado' : 'Nenhum produto encontrado'}
          </p>
          {products.length === 0 && (
            <Button variant="outline" size="sm" onClick={openNew}>
              Cadastrar primeiro produto
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
                <th className="text-left font-medium text-muted-foreground px-4 py-3">Produto</th>
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
                    {p.priceDisplay ?? (p.price != null
                      ? new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(p.price)
                      : 'Sob consulta')}
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
          onSave={handleSave}
          onClose={() => setShowForm(false)}
        />
      )}
    </div>
  )
}
