'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { toast } from 'sonner'
import { updateTenant } from '@/lib/actions/tenant'
import { Pencil } from 'lucide-react'

interface PlanLimitsDialogProps {
  tenant: {
    id: string
    plan: string
    max_messages_month: number | null
    max_products: number | null
    max_operators: number | null
  }
}

export function PlanLimitsDialog({ tenant }: PlanLimitsDialogProps) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const [form, setForm] = useState({
    plan: tenant.plan,
    max_messages_month: String(tenant.max_messages_month ?? 1000),
    max_products: String(tenant.max_products ?? 50),
    max_operators: String(tenant.max_operators ?? 3),
  })

  async function handleSave() {
    setLoading(true)
    try {
      await updateTenant(tenant.id, {
        plan: form.plan,
        max_messages_month: parseInt(form.max_messages_month, 10) || 0,
        max_products: parseInt(form.max_products, 10) || 0,
        max_operators: parseInt(form.max_operators, 10) || 0,
      })
      toast.success('Limites atualizados')
      setOpen(false)
      router.refresh()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Erro ao salvar')
    } finally {
      setLoading(false)
    }
  }

  return (
    <>
      <Button variant="outline" size="sm" onClick={() => setOpen(true)}>
        <Pencil className="h-4 w-4 mr-1" />
        Editar limites
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Editar plano e limites</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <div className="space-y-1">
              <label className="text-sm font-medium">Plano</label>
              <Select value={form.plan} onValueChange={(v) => v && setForm((f) => ({ ...f, plan: v }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="free">Free</SelectItem>
                  <SelectItem value="starter">Starter</SelectItem>
                  <SelectItem value="pro">Pro</SelectItem>
                  <SelectItem value="enterprise">Enterprise</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <label className="text-sm font-medium">Mensagens/mês</label>
              <Input
                type="number"
                min={0}
                value={form.max_messages_month}
                onChange={(e) => setForm((f) => ({ ...f, max_messages_month: e.target.value }))}
              />
            </div>
            <div className="space-y-1">
              <label className="text-sm font-medium">Máx. produtos</label>
              <Input
                type="number"
                min={0}
                value={form.max_products}
                onChange={(e) => setForm((f) => ({ ...f, max_products: e.target.value }))}
              />
            </div>
            <div className="space-y-1">
              <label className="text-sm font-medium">Máx. operadores</label>
              <Input
                type="number"
                min={0}
                value={form.max_operators}
                onChange={(e) => setForm((f) => ({ ...f, max_operators: e.target.value }))}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>Cancelar</Button>
            <Button onClick={handleSave} disabled={loading}>
              {loading ? 'Salvando...' : 'Salvar'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
