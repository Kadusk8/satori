'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { reconnectEvolution } from '@/lib/actions/tenant'
import { Copy, RefreshCw, Check } from 'lucide-react'

interface EvolutionConnectionProps {
  tenantId: string
  webhookUrl: string
  hasEvolutionConfig: boolean
}

export function EvolutionConnection({ tenantId, webhookUrl, hasEvolutionConfig }: EvolutionConnectionProps) {
  const router = useRouter()
  const [loading, setLoading] = useState(false)
  const [copied, setCopied] = useState(false)

  async function handleCopy() {
    await navigator.clipboard.writeText(webhookUrl)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  async function handleReconnect() {
    setLoading(true)
    try {
      const result = await reconnectEvolution(tenantId)
      toast.success(result.connected ? 'Reconectado — webhook registrado e instância conectada' : 'Webhook registrado, mas a instância ainda não está conectada no Evolution Go')
      router.refresh()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Erro ao reconectar')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="space-y-2 pt-1">
      <label className="text-xs font-medium text-muted-foreground">
        URL do webhook (cole no Evolution Go, em Webhook → URL)
      </label>
      <div className="flex gap-2">
        <Input readOnly value={webhookUrl} className="font-mono text-xs" />
        <Button type="button" variant="outline" size="icon" onClick={handleCopy} title="Copiar">
          {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
        </Button>
      </div>
      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={handleReconnect}
        disabled={loading || !hasEvolutionConfig}
        className="w-full"
      >
        <RefreshCw className={`h-4 w-4 mr-1 ${loading ? 'animate-spin' : ''}`} />
        {loading ? 'Reconectando...' : 'Reconectar / recarregar conexão'}
      </Button>
      {!hasEvolutionConfig && (
        <p className="text-xs text-muted-foreground">
          Configure a URL e a API key da Evolution Go pra habilitar a reconexão.
        </p>
      )}
    </div>
  )
}
