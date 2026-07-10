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
import { ArrowUp, ArrowDown, Pencil, Trash2, Plus, Star, Lock } from 'lucide-react'
import {
  createKanbanStage,
  updateKanbanStage,
  setDefaultKanbanStage,
  reorderKanbanStages,
  deleteKanbanStage,
} from '@/lib/actions/kanban-stages'
import { PROTECTED_STAGE_SLUGS } from '@/lib/kanban-stage-slugs'

const PRESET_COLORS = ['#6366f1', '#3b82f6', '#f59e0b', '#10b981', '#8b5cf6', '#ef4444', '#6b7280', '#ec4899']
const PROTECTED_SLUGS: readonly string[] = PROTECTED_STAGE_SLUGS

interface Stage {
  id: string
  name: string
  slug: string
  color: string
  position: number
  isDefault: boolean
  isClosed: boolean
}

export function KanbanStagesManager({ initialStages }: { initialStages: Stage[] }) {
  const router = useRouter()
  const [stages, setStages] = useState(initialStages)
  const [busyId, setBusyId] = useState<string | null>(null)
  const [createOpen, setCreateOpen] = useState(false)
  const [editing, setEditing] = useState<Stage | null>(null)

  function refresh() {
    router.refresh()
  }

  async function handleMove(index: number, direction: -1 | 1) {
    const target = index + direction
    if (target < 0 || target >= stages.length) return
    const reordered = [...stages]
    ;[reordered[index], reordered[target]] = [reordered[target], reordered[index]]
    setStages(reordered)
    try {
      await reorderKanbanStages(reordered.map((s) => s.id))
      refresh()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Erro ao reordenar')
      setStages(stages)
    }
  }

  async function handleSetDefault(id: string) {
    setBusyId(id)
    try {
      await setDefaultKanbanStage(id)
      toast.success('Coluna padrão atualizada')
      refresh()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Erro ao definir padrão')
    } finally {
      setBusyId(null)
    }
  }

  async function handleDelete(stage: Stage) {
    if (!confirm(`Excluir a coluna "${stage.name}"? Os cards dela serão movidos pra outra coluna.`)) return
    setBusyId(stage.id)
    try {
      await deleteKanbanStage(stage.id)
      toast.success('Coluna excluída')
      refresh()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Erro ao excluir')
    } finally {
      setBusyId(null)
    }
  }

  return (
    <div className="space-y-4">
      <div className="border rounded-lg divide-y">
        {stages.map((stage, index) => (
          <div key={stage.id} className="flex items-center gap-3 p-3">
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
                disabled={index === stages.length - 1}
                className="text-muted-foreground hover:text-foreground disabled:opacity-20 disabled:cursor-not-allowed"
              >
                <ArrowDown className="h-3.5 w-3.5" />
              </button>
            </div>

            <span className="h-3 w-3 rounded-full shrink-0" style={{ backgroundColor: stage.color }} />

            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium truncate">{stage.name}</p>
              {stage.isDefault && (
                <span className="text-[11px] text-muted-foreground flex items-center gap-1">
                  <Star className="h-2.5 w-2.5 fill-current" /> Coluna padrão pra novos leads
                </span>
              )}
              {stage.isClosed && !stage.isDefault && (
                <span className="text-[11px] text-muted-foreground flex items-center gap-1">
                  <Lock className="h-2.5 w-2.5" /> Marca atendimento como finalizado
                </span>
              )}
              {PROTECTED_SLUGS.includes(stage.slug) && !stage.isDefault && !stage.isClosed && (
                <span className="text-[11px] text-muted-foreground flex items-center gap-1">
                  <Lock className="h-2.5 w-2.5" /> Coluna do sistema — protegida contra exclusão
                </span>
              )}
            </div>

            <div className="flex items-center gap-1.5 shrink-0">
              {!stage.isDefault && (
                <Button variant="ghost" size="sm" onClick={() => handleSetDefault(stage.id)} disabled={busyId === stage.id}>
                  Definir padrão
                </Button>
              )}
              <Button variant="outline" size="sm" onClick={() => setEditing(stage)}>
                <Pencil className="h-3.5 w-3.5" />
              </Button>
              {PROTECTED_SLUGS.includes(stage.slug) ? (
                <Button
                  variant="outline"
                  size="sm"
                  disabled
                  title="Coluna do sistema — usada pra mover cards automaticamente, não pode ser excluída"
                  className="text-muted-foreground"
                >
                  <Lock className="h-3.5 w-3.5" />
                </Button>
              ) : (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => handleDelete(stage)}
                  disabled={busyId === stage.id || stages.length <= 1}
                  className="text-destructive hover:text-destructive"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              )}
            </div>
          </div>
        ))}
      </div>

      <Button variant="outline" onClick={() => setCreateOpen(true)} className="gap-1.5">
        <Plus className="h-4 w-4" />
        Nova coluna
      </Button>

      <StageFormDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        title="Nova coluna"
        onSubmit={async (data) => {
          await createKanbanStage(data)
          refresh()
        }}
      />

      <StageFormDialog
        key={editing?.id ?? 'edit-none'}
        open={!!editing}
        onOpenChange={(v) => !v && setEditing(null)}
        title="Editar coluna"
        initial={editing ?? undefined}
        onSubmit={async (data) => {
          if (!editing) return
          await updateKanbanStage(editing.id, data)
          refresh()
        }}
      />
    </div>
  )
}

function StageFormDialog({
  open,
  onOpenChange,
  title,
  initial,
  onSubmit,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  title: string
  initial?: { name: string; color: string }
  onSubmit: (data: { name: string; color: string }) => Promise<void>
}) {
  const [name, setName] = useState(initial?.name ?? '')
  const [color, setColor] = useState(initial?.color ?? PRESET_COLORS[0])
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    if (!name.trim()) return
    setLoading(true)
    try {
      await onSubmit({ name: name.trim(), color })
      toast.success('Coluna salva')
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
              placeholder="Ex: Pós-venda"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <label className="text-sm font-medium">Cor</label>
            <div className="flex gap-1.5 flex-wrap">
              {PRESET_COLORS.map((c) => (
                <button
                  key={c}
                  type="button"
                  onClick={() => setColor(c)}
                  className="h-6 w-6 rounded-full border-2 transition-transform"
                  style={{ backgroundColor: c, borderColor: color === c ? '#fff' : 'transparent', outline: color === c ? `2px solid ${c}` : 'none', outlineOffset: '2px' }}
                />
              ))}
            </div>
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
