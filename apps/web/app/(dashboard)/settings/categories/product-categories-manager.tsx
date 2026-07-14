'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog'
import { toast } from 'sonner'
import { ArrowUp, ArrowDown, Pencil, Trash2, Plus } from 'lucide-react'
import {
  createProductCategory,
  updateProductCategory,
  reorderProductCategories,
  deleteProductCategory,
} from '@/lib/actions/product-categories'

interface Category {
  id: string
  name: string
  position: number
}

export function ProductCategoriesManager({ initialCategories }: { initialCategories: Category[] }) {
  const router = useRouter()
  const [categories, setCategories] = useState(initialCategories)
  const [busyId, setBusyId] = useState<string | null>(null)
  const [createOpen, setCreateOpen] = useState(false)
  const [editing, setEditing] = useState<Category | null>(null)

  function refresh() {
    router.refresh()
  }

  async function handleMove(index: number, direction: -1 | 1) {
    const target = index + direction
    if (target < 0 || target >= categories.length) return
    const reordered = [...categories]
    ;[reordered[index], reordered[target]] = [reordered[target], reordered[index]]
    setCategories(reordered)
    try {
      await reorderProductCategories(reordered.map((c) => c.id))
      refresh()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Erro ao reordenar')
      setCategories(categories)
    }
  }

  async function handleDelete(category: Category) {
    if (!confirm(`Excluir a categoria "${category.name}"? Produtos que já usam esse nome não são alterados.`)) return
    setBusyId(category.id)
    try {
      await deleteProductCategory(category.id)
      toast.success('Categoria excluída')
      refresh()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Erro ao excluir')
    } finally {
      setBusyId(null)
    }
  }

  return (
    <div className="space-y-4">
      {categories.length === 0 ? (
        <div className="border rounded-lg p-6 text-center text-sm text-muted-foreground">
          Nenhuma categoria cadastrada ainda.
        </div>
      ) : (
        <div className="border rounded-lg divide-y">
          {categories.map((category, index) => (
            <div key={category.id} className="flex items-center gap-3 p-3">
              <div className="flex flex-col shrink-0">
                <button
                  type="button"
                  onClick={() => handleMove(index, -1)}
                  disabled={index === 0}
                  className="text-muted-foreground hover:text-foreground disabled:opacity-20 disabled:cursor-not-allowed"
                >
                  <ArrowUp className="h-3.5 w-3.5" />
                </button>
                <button
                  type="button"
                  onClick={() => handleMove(index, 1)}
                  disabled={index === categories.length - 1}
                  className="text-muted-foreground hover:text-foreground disabled:opacity-20 disabled:cursor-not-allowed"
                >
                  <ArrowDown className="h-3.5 w-3.5" />
                </button>
              </div>

              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium truncate">{category.name}</p>
              </div>

              <div className="flex items-center gap-1.5 shrink-0">
                <Button variant="outline" size="sm" onClick={() => setEditing(category)}>
                  <Pencil className="h-3.5 w-3.5" />
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => handleDelete(category)}
                  disabled={busyId === category.id}
                  className="text-destructive hover:text-destructive"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}

      <Button variant="outline" onClick={() => setCreateOpen(true)} className="gap-1.5">
        <Plus className="h-4 w-4" />
        Nova categoria
      </Button>

      <CategoryFormDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        title="Nova categoria"
        onSubmit={async (data) => {
          await createProductCategory(data)
          refresh()
        }}
      />

      <CategoryFormDialog
        key={editing?.id ?? 'edit-none'}
        open={!!editing}
        onOpenChange={(v) => !v && setEditing(null)}
        title="Editar categoria"
        initial={editing ?? undefined}
        onSubmit={async (data) => {
          if (!editing) return
          await updateProductCategory(editing.id, data)
          refresh()
        }}
      />
    </div>
  )
}

function CategoryFormDialog({
  open,
  onOpenChange,
  title,
  initial,
  onSubmit,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  title: string
  initial?: { name: string }
  onSubmit: (data: { name: string }) => Promise<void>
}) {
  const [name, setName] = useState(initial?.name ?? '')
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    if (!name.trim()) return
    setLoading(true)
    try {
      await onSubmit({ name: name.trim() })
      toast.success('Categoria salva')
      onOpenChange(false)
      setName('')
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Erro ao salvar')
    } finally {
      setLoading(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={(v) => { onOpenChange(v); if (!v) setName('') }}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-3 py-2">
          <div className="space-y-1">
            <label className="text-sm font-medium">Nome</label>
            <Input
              required
              placeholder="Ex: Roupas"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </div>
          <DialogFooter className="pt-2">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
            <Button type="submit" disabled={loading}>
              {loading ? 'Salvando...' : 'Salvar'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
