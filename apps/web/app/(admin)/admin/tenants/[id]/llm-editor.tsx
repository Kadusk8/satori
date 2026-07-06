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
  anthropic: [
    { value: 'claude-sonnet-4-6', label: 'Claude Sonnet 4.6 (recomendado)' },
    { value: 'claude-haiku-4-5-20251001', label: 'Claude Haiku 4.5 (mais rápido)' },
    { value: 'claude-opus-4-6', label: 'Claude Opus 4.6 (mais capaz)' },
  ],
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
  openrouter: [
    { value: 'anthropic/claude-3.7-sonnet', label: 'Claude 3.7 Sonnet (via OpenRouter)' },
    { value: 'openai/gpt-4o', label: 'GPT-4o (via OpenRouter)' },
    { value: 'google/gemini-2.0-flash-exp', label: 'Gemini 2.0 Flash (via OpenRouter)' },
  ],
}

interface LlmEditorProps {
  agentId: string
  tenantId: string
  currentModel: string
  currentProvider: string
  hasKey: boolean
}

export function LlmEditor({
  agentId,
  tenantId,
  currentModel,
  currentProvider,
  hasKey,
}: LlmEditorProps) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const [showKey, setShowKey] = useState(false)

  const [provider, setProvider] = useState(currentProvider || 'anthropic')
  const [model, setModel] = useState(currentModel)
  const [apiKey, setApiKey] = useState('')

  const availableModels = LLM_MODELS[provider] ?? LLM_MODELS.anthropic

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
        llmProvider: provider as 'openai' | 'gemini' | 'anthropic' | 'openrouter',
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
    : provider === 'openrouter'
    ? 'sk-or-...'
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
                  <SelectItem value="anthropic">Claude (Anthropic)</SelectItem>
                  <SelectItem value="openai">ChatGPT (OpenAI)</SelectItem>
                  <SelectItem value="gemini">Gemini (Google)</SelectItem>
                  <SelectItem value="openrouter">OpenRouter (multi-modelo)</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <label className="text-sm font-medium">Modelo</label>
              {provider === 'openrouter' ? (
                <Input
                  placeholder="anthropic/claude-3.7-sonnet"
                  value={model}
                  onChange={(e) => setModel(e.target.value)}
                  className="font-mono text-xs"
                />
              ) : (
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
              )}
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
                A chave e o modelo ficam vinculados só a este agente. Deixar em branco mantém a chave atual.
              </p>
            </div>

            <div className="rounded-md bg-muted p-3 text-xs space-y-1">
              <p>
                Chave deste agente:{' '}
                {hasKey ? <span className="text-emerald-600 font-medium">✓ configurada</span> : '— não configurada (usa fallback do tenant/global)'}
              </p>
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
