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
import { inviteOperator, updateOperator } from '@/lib/actions/team'
import { UserPlus, PauseCircle, PlayCircle } from 'lucide-react'

export function InviteOperatorDialog() {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const [form, setForm] = useState({ fullName: '', email: '', role: 'operator' as 'admin' | 'operator' })

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setLoading(true)
    try {
      await inviteOperator(form)
      toast.success('Convite enviado por email')
      setOpen(false)
      setForm({ fullName: '', email: '', role: 'operator' })
      router.refresh()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Erro ao convidar')
    } finally {
      setLoading(false)
    }
  }

  return (
    <>
      <Button size="sm" onClick={() => setOpen(true)}>
        <UserPlus className="h-4 w-4 mr-1" />
        Convidar operador
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Convidar operador</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-3 py-2">
            <div className="space-y-1">
              <label className="text-sm font-medium">Nome completo</label>
              <Input
                required
                placeholder="Nome do operador"
                value={form.fullName}
                onChange={(e) => setForm((f) => ({ ...f, fullName: e.target.value }))}
              />
            </div>
            <div className="space-y-1">
              <label className="text-sm font-medium">Email</label>
              <Input
                type="email"
                required
                placeholder="email@empresa.com"
                value={form.email}
                onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
              />
            </div>
            <div className="space-y-1">
              <label className="text-sm font-medium">Função</label>
              <Select value={form.role} onValueChange={(v) => v && setForm((f) => ({ ...f, role: v as 'admin' | 'operator' }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="operator">Operador</SelectItem>
                  <SelectItem value="admin">Admin</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <p className="text-xs text-muted-foreground">
              Enviaremos um email com um link pra ele definir a própria senha e acessar o painel.
            </p>
            <DialogFooter className="pt-2">
              <Button type="button" variant="outline" onClick={() => setOpen(false)}>Cancelar</Button>
              <Button type="submit" disabled={loading}>
                {loading ? 'Enviando...' : 'Enviar convite'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  )
}

interface Member {
  id: string
  role: string
  active: boolean
}

export function OperatorRowActions({ member }: { member: Member }) {
  const router = useRouter()
  const [loading, setLoading] = useState(false)

  if (member.role === 'owner') {
    return <span className="text-xs text-muted-foreground shrink-0">—</span>
  }

  async function handleToggleActive() {
    setLoading(true)
    try {
      await updateOperator(member.id, { active: !member.active })
      toast.success(member.active ? 'Operador desativado' : 'Operador reativado')
      router.refresh()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Erro ao atualizar')
    } finally {
      setLoading(false)
    }
  }

  return (
    <Button variant="outline" size="sm" onClick={handleToggleActive} disabled={loading}>
      {member.active ? (
        <><PauseCircle className="h-4 w-4 mr-1" />Desativar</>
      ) : (
        <><PlayCircle className="h-4 w-4 mr-1" />Reativar</>
      )}
    </Button>
  )
}
