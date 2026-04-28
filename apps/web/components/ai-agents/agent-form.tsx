import { useState, useCallback } from 'react'
import { X, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { createClient } from '@/lib/supabase/client'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'

interface AIAgent {
  id: string
  name: string
  slug: string
  model: string
  type: 'sdr' | 'support' | 'scheduler' | 'custom'
  is_active: boolean
  is_default: boolean
}

interface AgentFormProps {
  agent: AIAgent | null
  tenantId: string
  onSave: (agent: AIAgent) => void
  onClose: () => void
}

const MODEL_OPTIONS = [
  { group: 'Claude (Anthropic)', models: [
    { id: 'claude-sonnet-4-20250514', label: 'Claude Sonnet 4' },
    { id: 'claude-opus-4-20250805', label: 'Claude Opus 4' },
    { id: 'claude-haiku-4-5-20251001', label: 'Claude Haiku 4.5' },
  ]},
  { group: 'OpenAI', models: [
    { id: 'gpt-4o', label: 'GPT-4o' },
    { id: 'gpt-4-turbo', label: 'GPT-4 Turbo' },
    { id: 'gpt-3.5-turbo', label: 'GPT-3.5 Turbo' },
  ]},
  { group: 'Google', models: [
    { id: 'gemini-2.0-flash', label: 'Gemini 2.0 Flash' },
    { id: 'gemini-1.5-pro', label: 'Gemini 1.5 Pro' },
  ]},
]

const AGENT_TYPES = [
  { id: 'sdr', label: 'Vendedor/SDR' },
  { id: 'support', label: 'Suporte' },
  { id: 'scheduler', label: 'Agendamento' },
  { id: 'custom', label: 'Customizado' },
]

export function AgentForm({ agent, tenantId, onSave, onClose }: AgentFormProps) {
  const [formData, setFormData] = useState({
    name: agent?.name || '',
    slug: agent?.slug || '',
    model: agent?.model || 'claude-sonnet-4-20250514',
    type: agent?.type || 'sdr',
    is_active: agent?.is_active ?? true,
    is_default: agent?.is_default ?? false,
  })
  const [saving, setSaving] = useState(false)

  const handleSave = useCallback(async () => {
    if (!formData.name.trim()) {
      toast.error('Nome do agente é obrigatório')
      return
    }

    setSaving(true)
    try {
      const supabase = createClient()

      if (agent) {
        // Update
        const { data, error } = await supabase
          .from('ai_agents')
          .update({
            name: formData.name,
            slug: formData.slug || formData.name.toLowerCase().replace(/\s+/g, '-'),
            model: formData.model,
            type: formData.type,
            is_active: formData.is_active,
            is_default: formData.is_default,
          })
          .eq('id', agent.id)
          .select()
          .single()

        if (error) {
          toast.error('Erro ao atualizar: ' + error.message)
          return
        }

        onSave(data as AIAgent)
        toast.success('Agente atualizado!')
      } else {
        // Create
        const { data, error } = await supabase
          .from('ai_agents')
          .insert({
            tenant_id: tenantId,
            name: formData.name,
            slug: formData.slug || formData.name.toLowerCase().replace(/\s+/g, '-'),
            model: formData.model,
            type: formData.type,
            is_active: formData.is_active,
            is_default: formData.is_default,
            system_prompt: `Você é um assistente de IA especializado em ${formData.type === 'sdr' ? 'vendas' : formData.type === 'support' ? 'suporte' : 'agendamento'}. Seja prestativo e profissional.`,
          })
          .select()
          .single()

        if (error) {
          toast.error('Erro ao criar: ' + error.message)
          return
        }

        onSave(data as AIAgent)
        toast.success('Agente criado!')
      }
    } catch (err) {
      toast.error('Erro ao salvar agente')
    } finally {
      setSaving(false)
    }
  }, [agent, formData, tenantId, onSave])

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-background rounded-lg shadow-lg max-w-md w-full mx-4 max-h-screen overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b sticky top-0 bg-background">
          <h2 className="font-semibold">
            {agent ? 'Editar Agente' : 'Novo Agente'}
          </h2>
          <Button
            variant="ghost"
            size="sm"
            onClick={onClose}
            className="h-8 w-8 p-0"
          >
            <X className="h-4 w-4" />
          </Button>
        </div>

        {/* Form */}
        <div className="p-6 space-y-6">
          {/* Name */}
          <div className="space-y-2">
            <label className="text-sm font-medium">Nome do Agente *</label>
            <Input
              placeholder="Ex: Vendedor 24/7"
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
            />
          </div>

          {/* Type */}
          <div className="space-y-2">
            <label className="text-sm font-medium">Tipo de Agente *</label>
            <div className="grid grid-cols-2 gap-2">
              {AGENT_TYPES.map((type) => (
                <button
                  key={type.id}
                  onClick={() => setFormData({ ...formData, type: type.id as any })}
                  className={cn(
                    'text-sm p-2 rounded border transition-colors',
                    formData.type === type.id
                      ? 'bg-primary text-primary-foreground border-primary'
                      : 'hover:bg-muted border-muted'
                  )}
                >
                  {type.label}
                </button>
              ))}
            </div>
          </div>

          {/* Model */}
          <div className="space-y-2">
            <label className="text-sm font-medium">Modelo de IA *</label>
            <select
              value={formData.model}
              onChange={(e) => setFormData({ ...formData, model: e.target.value })}
              className="w-full px-3 py-2 border rounded-md bg-background text-foreground"
            >
              {MODEL_OPTIONS.map((group) => (
                <optgroup key={group.group} label={group.group}>
                  {group.models.map((model) => (
                    <option key={model.id} value={model.id}>
                      {model.label}
                    </option>
                  ))}
                </optgroup>
              ))}
            </select>
            <p className="text-xs text-muted-foreground">
              Escolha qual LLM este agente vai usar. Certifique-se de configurar a API key correspondente em Configurações.
            </p>
          </div>

          {/* Active */}
          <div className="space-y-2">
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={formData.is_active}
                onChange={(e) => setFormData({ ...formData, is_active: e.target.checked })}
                className="rounded"
              />
              <span className="text-sm font-medium">Agente ativo</span>
            </label>
          </div>

          {/* Default */}
          <div className="space-y-2">
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={formData.is_default}
                onChange={(e) => setFormData({ ...formData, is_default: e.target.checked })}
                className="rounded"
              />
              <span className="text-sm font-medium">Agente padrão</span>
            </label>
            <p className="text-xs text-muted-foreground">
              Este agente será usado para atender novas conversas
            </p>
          </div>
        </div>

        {/* Footer */}
        <div className="flex gap-3 p-6 border-t bg-muted/30">
          <Button
            variant="outline"
            onClick={onClose}
            disabled={saving}
            className="flex-1"
          >
            Cancelar
          </Button>
          <Button
            onClick={handleSave}
            disabled={saving}
            className="flex-1 gap-2"
          >
            {saving && <Loader2 className="h-4 w-4 animate-spin" />}
            {agent ? 'Atualizar' : 'Criar'}
          </Button>
        </div>
      </div>
    </div>
  )
}
