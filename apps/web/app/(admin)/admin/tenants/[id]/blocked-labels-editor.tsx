'use client'

import { useState, type FormEvent } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { updateTenantBlockedLabels } from '@/lib/actions/tenant'
import { ShieldOff, X } from 'lucide-react'

interface BlockedLabelsEditorProps {
  tenantId: string
  currentLabels: string[]
}

// Editor das etiquetas que travam a IA de responder um contato — tanto
// etiquetas do CRM (contacts.tags) quanto etiquetas nativas do WhatsApp.
// Segue o mesmo padrão de tags input usado em contacts-table.tsx /
// conversation-drawer.tsx: pills removíveis + form de adicionar por Enter.
export function BlockedLabelsEditor({ tenantId, currentLabels }: BlockedLabelsEditorProps) {
  const router = useRouter()
  const [labels, setLabels] = useState<string[]>(currentLabels)
  const [labelInput, setLabelInput] = useState('')
  const [loading, setLoading] = useState(false)

  function addLabel(e: FormEvent) {
    e.preventDefault()
    // Aceita separar por vírgula também, além de Enter — o usuário pode
    // colar "jonathan, teste, interno" de uma vez.
    const parts = labelInput
      .split(',')
      .map((p) => p.trim().toLowerCase())
      .filter(Boolean)
    if (parts.length === 0) return
    setLabels((prev) => Array.from(new Set([...prev, ...parts])))
    setLabelInput('')
  }

  function removeLabel(label: string) {
    setLabels((prev) => prev.filter((l) => l !== label))
  }

  async function handleSave() {
    setLoading(true)
    try {
      await updateTenantBlockedLabels(tenantId, labels)
      toast.success('Etiquetas salvas — clique em Reconectar pra ativar o recebimento dos eventos de etiqueta')
      router.refresh()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Erro ao salvar etiquetas')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="space-y-2 pt-1">
      <div className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
        <ShieldOff className="h-3.5 w-3.5" />
        Etiquetas que bloqueiam a IA
      </div>

      <div className="flex flex-wrap gap-1.5">
        {labels.length === 0 && (
          <span className="text-xs text-muted-foreground">Nenhuma etiqueta cadastrada.</span>
        )}
        {labels.map((label) => (
          <Badge key={label} variant="secondary" className="group gap-1 pr-1">
            {label}
            <button
              type="button"
              onClick={() => removeLabel(label)}
              className="rounded-sm group-hover:bg-destructive/10 group-hover:text-destructive"
              title="Remover"
            >
              <X className="h-3 w-3" />
            </button>
          </Badge>
        ))}
      </div>

      <form onSubmit={addLabel} className="flex gap-2">
        <Input
          placeholder="Nova etiqueta... (Enter ou vírgula)"
          value={labelInput}
          onChange={(e) => setLabelInput(e.target.value)}
          className="text-sm"
        />
        <Button type="submit" variant="outline" size="sm">
          Adicionar
        </Button>
      </form>

      <Button type="button" size="sm" onClick={handleSave} disabled={loading} className="w-full">
        {loading ? 'Salvando...' : 'Salvar etiquetas'}
      </Button>

      <p className="text-xs text-muted-foreground">
        Contatos com qualquer uma dessas etiquetas (do WhatsApp ou do CRM) não recebem resposta
        automática da IA. Após salvar, clique em Reconectar para o WhatsApp começar a enviar as
        etiquetas.
      </p>
    </div>
  )
}
