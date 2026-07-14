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
import { toast } from 'sonner'
import { Eye, EyeOff, Megaphone } from 'lucide-react'
import { updateTenantMetaCapi } from '@/lib/actions/tenant'

interface MetaCapiEditorProps {
  tenantId: string
  currentDatasetId: string | null
  currentEnabled: boolean
  hasAccessToken: boolean
}

export function MetaCapiEditor({
  tenantId,
  currentDatasetId,
  currentEnabled,
  hasAccessToken,
}: MetaCapiEditorProps) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const [showToken, setShowToken] = useState(false)

  const [datasetId, setDatasetId] = useState(currentDatasetId ?? '')
  const [enabled, setEnabled] = useState(currentEnabled)
  const [accessToken, setAccessToken] = useState('')

  async function handleSave() {
    if (enabled && !datasetId.trim()) {
      toast.error('Informe o Dataset/Pixel ID pra ativar')
      return
    }
    if (enabled && !hasAccessToken && !accessToken.trim()) {
      toast.error('Informe o access token pra ativar')
      return
    }
    setLoading(true)
    try {
      await updateTenantMetaCapi(tenantId, {
        metaDatasetId: datasetId,
        metaCapiEnabled: enabled,
        metaAccessToken: accessToken.trim() || undefined,
      })
      toast.success('Configuração da Meta Conversions API salva')
      setOpen(false)
      setAccessToken('')
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
        <Megaphone className="h-4 w-4 mr-1" />
        Configurar Meta Ads
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Meta Conversions API</DialogTitle>
          </DialogHeader>

          <div className="space-y-4 py-2">
            <div className="flex items-center justify-between rounded-lg border p-3">
              <div>
                <p className="text-sm font-medium">Reportar conversões ao Meta</p>
                <p className="text-xs text-muted-foreground">
                  Envia agendamento (Schedule) e fechamento (Purchase) de leads vindos de anúncio
                </p>
              </div>
              <button
                type="button"
                role="switch"
                aria-checked={enabled}
                onClick={() => setEnabled((v) => !v)}
                className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                  enabled ? 'bg-primary' : 'bg-muted-foreground/30'
                }`}
              >
                <span
                  className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                    enabled ? 'translate-x-6' : 'translate-x-1'
                  }`}
                />
              </button>
            </div>

            <div className="space-y-1.5">
              <label className="text-sm font-medium">Dataset / Pixel ID</label>
              <Input
                placeholder="Ex: 1234567890123456"
                value={datasetId}
                onChange={(e) => setDatasetId(e.target.value)}
                className="font-mono text-xs"
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-sm font-medium">Access Token (novo)</label>
              <div className="relative">
                <Input
                  type={showToken ? 'text' : 'password'}
                  placeholder="EAAG..."
                  value={accessToken}
                  onChange={(e) => setAccessToken(e.target.value)}
                  className="pr-10 font-mono text-xs"
                />
                <button
                  type="button"
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                  onClick={() => setShowToken((s) => !s)}
                >
                  {showToken ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
              <p className="text-xs text-muted-foreground">
                Token: {hasAccessToken ? '✓ configurado' : '— não configurado'}. Deixar em branco mantém o token atual.
                Precisa de um System User token com escopo <code className="text-[11px]">ads_management</code>.
              </p>
            </div>

            <div className="rounded-md bg-muted p-3 text-xs text-muted-foreground space-y-1">
              <p className="font-medium text-foreground">Como funciona</p>
              <p>
                Só dispara pra conversas que vieram de um anúncio Click-to-WhatsApp (têm o click ID
                do Meta salvo). Sem isso ativado, nada é enviado — mesmo com credenciais salvas.
              </p>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => { setOpen(false); setAccessToken('') }}>Cancelar</Button>
            <Button onClick={handleSave} disabled={loading}>
              {loading ? 'Salvando...' : 'Salvar'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
