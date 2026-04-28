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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { toast } from 'sonner'
import { updateTenantLLM } from '@/lib/actions/tenant'
import { Pencil, Eye, EyeOff } from 'lucide-react'

const LLM_MODELS: Record<string, Array<{ value: string; label: string }>> = {
  openai: [
    { value: 'gpt-4o', label: 'GPT-4o (recomendado)' },
    { value: 'gpt-4o-mini', label: 'GPT-4o Mini (mais barato)' },
    { value: 'gpt-4-turbo', label: 'GPT-4 Turbo' },
  ],
  gemini: [
    { value: 'gemini-2.5-flash-lite', label: 'Gemini 2.5 Flash Lite (recomendado)' },
    { value: 'gemini-2.0-flash', label: 'Gemini 2.0 Flash' },
    { value: 'gemini-1.5-pro', label: 'Gemini 1.5 Pro' },
    { value: 'gemini-1.5-flash', label: 'Gemini 1.5 Flash' },
  ],
  anthropic: [
    { value: 'claude-sonnet-4-6', label: 'Claude Sonnet 4.6 (recomendado)' },
    { value: 'claude-haiku-4-5-20251001', label: 'Claude Haiku 4.5 (mais rápido)' },
    { value: 'claude-opus-4-6', label: 'Claude Opus 4.6 (mais capaz)' },
  ],
}

function detectProvider(model: string): string {
  if (model.startsWith('gpt-') || model.startsWith('o1-') || model.startsWith('o3-')) return 'openai'
  if (model.startsWith('gemini-')) return 'gemini'
  if (model.startsWith('claude-')) return 'anthropic'
  return 'openai'
}

interface LlmEditorProps {
  agentId: string
  tenantId: string
  currentModel: string
  hasOpenaiKey: boolean
  hasGeminiKey: boolean
  hasAnthropicKey: boolean
}

export function LlmEditor({
  agentId,
  tenantId,
  currentModel,
  hasOpenaiKey,
  hasGeminiKey,
  hasAnthropicKey,
}: LlmEditorProps) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const [showKey, setShowKey] = useState(false)

  const initialProvider = detectProvider(currentModel)
  const [provider, setProvider] = useState(initialProvider)
  const [model, setModel] = useState(currentModel)
  const [apiKey, setApiKey] = useState('')

  const availableModels = LLM_MODELS[provider] ?? LLM_MODELS.openai

  function handleProviderChange(v: string | null) {
    if (!v) return
    setProvider(v)
    setModel(LLM_MODELS[v]?.[0]?.value ?? '')
    setApiKey('')
  }

  async function handleSave() {
    if (!apiKey.trim()) {
      toast.error('Informe a API key do provedor selecionado')
      return
    }
    setLoading(true)
    try {
      await updateTenantLLM(tenantId, {
        llmProvider: provider as 'openai' | 'gemini' | 'anthropic',
        llmModel: model,
        llmApiKey: apiKey.trim(),
        agentId,
      })
      toast.success('Provedor de IA atualizado')
      setOpen(false)
      setApiKey('')
      router.refresh()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Erro ao salvar')
    } finally {
      setLoading(false)
    }
  }

  const keyPlaceholder = provider === 'openai'
    ? 'sk-...'
    : provider === 'gemini'
    ? 'AIza...'
    : 'sk-ant-...'

  return (
    <>
      <Button variant="outline" size="sm" onClick={() => setOpen(true)}>
        <Pencil className="h-4 w-4 mr-1" />
        Editar IA
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Configurar provedor de IA</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <label className="text-sm font-medium">Provedor</label>
              <Select value={provider} onValueChange={handleProviderChange}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="openai">ChatGPT (OpenAI)</SelectItem>
                  <SelectItem value="gemini">Gemini (Google)</SelectItem>
                  <SelectItem value="anthropic">Claude (Anthropic)</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <label className="text-sm font-medium">Modelo</label>
              <Select value={model} onValueChange={(v) => v && setModel(v)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {availableModels.map((m) => (
                    <SelectItem key={m.value} value={m.value}>
                      {m.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <label className="text-sm font-medium">API Key (nova)</label>
              <div className="relative">
                <Input
                  type={showKey ? 'text' : 'password'}
                  placeholder={keyPlaceholder}
                  value={apiKey}
                  onChange={(e) => setApiKey(e.target.value)}
                  className="pr-10 font-mono text-xs"
                />
                <button
                  type="button"
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                  onClick={() => setShowKey((s) => !s)}
                >
                  {showKey ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
              <p className="text-xs text-muted-foreground">
                A chave será salva e usada pelo agente deste tenant. Deixar em branco mantém a chave atual.
              </p>
            </div>

            <div className="rounded-md bg-muted p-3 text-xs space-y-1">
              <p className="font-medium">Chaves configuradas atualmente:</p>
              <p>OpenAI: {hasOpenaiKey ? '✓ configurada' : '— não configurada'}</p>
              <p>Gemini: {hasGeminiKey ? '✓ configurada' : '— não configurada'}</p>
              <p>Anthropic: {hasAnthropicKey ? '✓ configurada' : '— não configurada'}</p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setOpen(false); setApiKey('') }}>Cancelar</Button>
            <Button onClick={handleSave} disabled={loading || !apiKey.trim()}>
              {loading ? 'Salvando...' : 'Salvar'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
