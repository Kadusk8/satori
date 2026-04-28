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
  DialogDescription,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { toast } from 'sonner'
import { updateTenantStatus, updateTenant, deleteTenant } from '@/lib/actions/tenant'
import { Pencil, Trash2, PauseCircle, PlayCircle } from 'lucide-react'

interface TenantActionsProps {
  tenant: {
    id: string
    name: string
    status: string
    business_segment: string | null
    business_description: string | null
    owner_name: string | null
    owner_email: string | null
    owner_phone: string | null
    city: string | null
    state: string | null
    website: string | null
    plan: string
  }
}

export function TenantActions({ tenant }: TenantActionsProps) {
  const router = useRouter()
  const [editOpen, setEditOpen] = useState(false)
  const [deleteOpen, setDeleteOpen] = useState(false)
  const [loading, setLoading] = useState(false)

  const [form, setForm] = useState({
    name: tenant.name,
    business_segment: tenant.business_segment ?? '',
    business_description: tenant.business_description ?? '',
    owner_name: tenant.owner_name ?? '',
    owner_email: tenant.owner_email ?? '',
    owner_phone: tenant.owner_phone ?? '',
    city: tenant.city ?? '',
    state: tenant.state ?? '',
    website: tenant.website ?? '',
    plan: tenant.plan,
  })

  const isSuspended = tenant.status === 'suspended'

  async function handleToggleSuspend() {
    setLoading(true)
    try {
      await updateTenantStatus(tenant.id, isSuspended ? 'active' : 'suspended')
      toast.success(isSuspended ? 'Empresa reativada' : 'Empresa suspensa')
      router.refresh()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Erro ao atualizar status')
    } finally {
      setLoading(false)
    }
  }

  async function handleEdit() {
    setLoading(true)
    try {
      await updateTenant(tenant.id, form)
      toast.success('Empresa atualizada')
      setEditOpen(false)
      router.refresh()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Erro ao salvar')
    } finally {
      setLoading(false)
    }
  }

  async function handleDelete() {
    setLoading(true)
    try {
      await deleteTenant(tenant.id)
      toast.success('Empresa excluída')
      router.push('/admin/tenants')
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Erro ao excluir')
      setLoading(false)
    }
  }

  return (
    <>
      <div className="flex items-center gap-2">
        <Button variant="outline" size="sm" onClick={() => setEditOpen(true)}>
          <Pencil className="h-4 w-4 mr-1" />
          Editar
        </Button>
        <Button
          variant="outline"
          size="sm"
          onClick={handleToggleSuspend}
          disabled={loading}
        >
          {isSuspended ? (
            <><PlayCircle className="h-4 w-4 mr-1" />Reativar</>
          ) : (
            <><PauseCircle className="h-4 w-4 mr-1" />Suspender</>
          )}
        </Button>
        <Button
          variant="destructive"
          size="sm"
          onClick={() => setDeleteOpen(true)}
        >
          <Trash2 className="h-4 w-4 mr-1" />
          Excluir
        </Button>
      </div>

      {/* Modal de edição */}
      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Editar Empresa</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <Field label="Nome da empresa">
              <Input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} />
            </Field>
            <Field label="Segmento">
              <Select value={form.business_segment} onValueChange={v => v && setForm(f => ({ ...f, business_segment: v }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="clinica">Clínica / Saúde</SelectItem>
                  <SelectItem value="loja">Loja</SelectItem>
                  <SelectItem value="restaurante">Restaurante</SelectItem>
                  <SelectItem value="servicos">Serviços</SelectItem>
                  <SelectItem value="outro">Outro</SelectItem>
                </SelectContent>
              </Select>
            </Field>
            <Field label="Descrição">
              <Textarea value={form.business_description} onChange={e => setForm(f => ({ ...f, business_description: e.target.value }))} rows={2} />
            </Field>
            <Field label="Plano">
              <Select value={form.plan} onValueChange={v => v && setForm(f => ({ ...f, plan: v }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="free">Free</SelectItem>
                  <SelectItem value="starter">Starter</SelectItem>
                  <SelectItem value="pro">Pro</SelectItem>
                  <SelectItem value="enterprise">Enterprise</SelectItem>
                </SelectContent>
              </Select>
            </Field>
            <Field label="Responsável">
              <Input value={form.owner_name} onChange={e => setForm(f => ({ ...f, owner_name: e.target.value }))} />
            </Field>
            <Field label="Email">
              <Input type="email" value={form.owner_email} onChange={e => setForm(f => ({ ...f, owner_email: e.target.value }))} />
            </Field>
            <Field label="Telefone">
              <Input value={form.owner_phone} onChange={e => setForm(f => ({ ...f, owner_phone: e.target.value }))} />
            </Field>
            <div className="flex gap-2">
              <Field label="Cidade" className="flex-1">
                <Input value={form.city} onChange={e => setForm(f => ({ ...f, city: e.target.value }))} />
              </Field>
              <Field label="Estado" className="w-24">
                <Input value={form.state} onChange={e => setForm(f => ({ ...f, state: e.target.value }))} maxLength={2} />
              </Field>
            </div>
            <Field label="Website">
              <Input value={form.website} onChange={e => setForm(f => ({ ...f, website: e.target.value }))} />
            </Field>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditOpen(false)}>Cancelar</Button>
            <Button onClick={handleEdit} disabled={loading}>
              {loading ? 'Salvando...' : 'Salvar'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Modal de confirmação de exclusão */}
      <Dialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Excluir empresa</DialogTitle>
            <DialogDescription>
              Tem certeza que deseja excluir <strong>{tenant.name}</strong>? Esta ação é irreversível e removerá todos os dados associados.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteOpen(false)}>Cancelar</Button>
            <Button variant="destructive" onClick={handleDelete} disabled={loading}>
              {loading ? 'Excluindo...' : 'Excluir definitivamente'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}

function Field({ label, children, className }: { label: string; children: React.ReactNode; className?: string }) {
  return (
    <div className={`space-y-1 ${className ?? ''}`}>
      <label className="text-sm font-medium">{label}</label>
      {children}
    </div>
  )
}
