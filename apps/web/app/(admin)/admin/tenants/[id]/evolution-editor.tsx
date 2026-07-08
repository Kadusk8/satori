'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog'
import { updateEvolutionConnection } from '@/lib/actions/tenant'
import { Pencil, Eye, EyeOff } from 'lucide-react'

interface EvolutionEditorProps {
  tenantId: string
  currentUrl: string
  currentInstanceName: string
}

export function EvolutionEditor({ tenantId, currentUrl, currentInstanceName }: EvolutionEditorProps) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const [showKey, setShowKey] = useState(false)

  const [url, setUrl] = useState(currentUrl)
  const [instanceName, setInstanceName] = useState(currentInstanceName)
  const [apiKey, setApiKey] = useState('')

  async function handleSave() {
    setLoading(true)
    try {
      const result = await updateEvolutionConnection(tenantId, {
        evolutionApiUrl: url,
        evolutionInstanceName: instanceName,
        evolutionApiKey: apiKey || undefined,
      })
      toast.success(result.connected ? 'Conexão salva e instância conectada' : 'Conexão salva, mas a instância ainda não está conectada no Evolution Go')
      setOpen(false)
      setApiKey('')
      router.refresh()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Erro ao salvar conexão')
    } finally {
      setLoading(false)
    }
  }

  return (
    <>
      <Button variant="outline" size="sm" onClick={() => setOpen(true)}>
        <Pencil className="h-4 w-4 mr-1" />
        Editar conexão
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Editar conexão Evolution Go</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <label className="text-sm font-medium">URL da Evolution Go</label>
              <Input
                placeholder="https://evo.seuservidor.com"
                value={url}
                onChange={(e) => setUrl(e.target.value)}
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-sm font-medium">Nome da instância</label>
              <Input
                placeholder="atendimento"
                value={instanceName}
                onChange={(e) => setInstanceName(e.target.value)}
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-sm font-medium">API Key (nova)</label>
              <div className="relative">
                <Input
                  type={showKey ? 'text' : 'password'}
                  placeholder="deixe em branco pra manter a atual"
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
                Use isso se a chave salva parar de funcionar (ex: depois de trocar a chave de criptografia do servidor).
              </p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setOpen(false); setApiKey('') }}>Cancelar</Button>
            <Button onClick={handleSave} disabled={loading || !url.trim() || !instanceName.trim()}>
              {loading ? 'Salvando...' : 'Salvar e reconectar'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
