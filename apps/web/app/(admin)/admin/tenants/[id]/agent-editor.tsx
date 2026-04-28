'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog'
import { toast } from 'sonner'
import { updateAgent } from '@/lib/actions/tenant'
import { Pencil } from 'lucide-react'

interface AgentEditorProps {
  agent: {
    id: string
    name: string
    system_prompt: string
    greeting_message: string | null
    out_of_hours_message: string | null
    personality: string | null
  }
  tenantId: string
}

export function AgentEditor({ agent, tenantId }: AgentEditorProps) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const [form, setForm] = useState({
    name: agent.name,
    system_prompt: agent.system_prompt,
    greeting_message: agent.greeting_message ?? '',
    out_of_hours_message: agent.out_of_hours_message ?? '',
    personality: agent.personality ?? '',
  })

  async function handleSave() {
    setLoading(true)
    try {
      await updateAgent(agent.id, form, tenantId)
      toast.success('Agente atualizado')
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
        Editar agente
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Editar Agente de IA</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <Field label="Nome do agente">
              <Input
                value={form.name}
                onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
              />
            </Field>
            <Field label="Personalidade">
              <Input
                value={form.personality}
                onChange={e => setForm(f => ({ ...f, personality: e.target.value }))}
                placeholder="Ex: Simpático, proativo e focado em ajudar o cliente"
              />
            </Field>
            <Field label="Mensagem de boas-vindas">
              <Textarea
                value={form.greeting_message}
                onChange={e => setForm(f => ({ ...f, greeting_message: e.target.value }))}
                rows={2}
                placeholder="Mensagem enviada ao iniciar o atendimento"
              />
            </Field>
            <Field label="Mensagem fora do horário">
              <Textarea
                value={form.out_of_hours_message}
                onChange={e => setForm(f => ({ ...f, out_of_hours_message: e.target.value }))}
                rows={2}
                placeholder="Mensagem enviada fora do horário de funcionamento"
              />
            </Field>
            <Field label="Prompt do sistema (instrução completa da IA)">
              <Textarea
                value={form.system_prompt}
                onChange={e => setForm(f => ({ ...f, system_prompt: e.target.value }))}
                rows={18}
                className="font-mono text-xs"
                placeholder="Instrução completa que define o comportamento do agente..."
              />
            </Field>
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

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1">
      <label className="text-sm font-medium">{label}</label>
      {children}
    </div>
  )
}
