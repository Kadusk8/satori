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
import { Eye, EyeOff, Volume2 } from 'lucide-react'
import { updateTenantAudio } from '@/lib/actions/tenant'

// Vozes populares do ElevenLabs para referência rápida
const POPULAR_VOICES = [
  { id: '21m00Tcm4TlvDq8ikWAM', name: 'Rachel (feminina, natural)' },
  { id: 'ErXwobaYiN019PkySvjV', name: 'Antoni (masculino, profissional)' },
  { id: 'AZnzlk1XvdvUeBnXmlld', name: 'Domi (feminina, confiante)' },
  { id: 'EXAVITQu4vr4xnSDxMaL', name: 'Bella (feminina, suave)' },
  { id: 'MF3mGyEYCl7XYWbV9V6O', name: 'Elli (feminina, expressiva)' },
  { id: 'TxGEqnHWrfWFTfGW9XjX', name: 'Josh (masculino, jovem)' },
  { id: 'VR6AewLTigWG4xSOukaG', name: 'Arnold (masculino, grave)' },
  { id: 'pNInz6obpgDQGcFmaJgB', name: 'Adam (masculino, narrador)' },
]

interface AudioEditorProps {
  agentId: string
  tenantId: string
  currentVoiceId: string | null
  audioResponseEnabled: boolean
  hasElevenLabsKey: boolean
}

export function AudioEditor({
  agentId,
  tenantId,
  currentVoiceId,
  audioResponseEnabled,
  hasElevenLabsKey,
}: AudioEditorProps) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const [showKey, setShowKey] = useState(false)

  const [voiceId, setVoiceId] = useState(currentVoiceId ?? '')
  const [audioEnabled, setAudioEnabled] = useState(audioResponseEnabled)
  const [apiKey, setApiKey] = useState('')

  async function handleSave() {
    setLoading(true)
    try {
      await updateTenantAudio(tenantId, {
        agentId,
        voiceId: voiceId || null,
        audioResponseEnabled: audioEnabled,
        elevenLabsApiKey: apiKey.trim() || undefined,
      })
      toast.success('Configuração de áudio salva')
      setOpen(false)
      setApiKey('')
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
        <Volume2 className="h-4 w-4 mr-1" />
        Configurar Áudio
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Configuração de Áudio (ElevenLabs)</DialogTitle>
          </DialogHeader>

          <div className="space-y-4 py-2">
            {/* Toggle resposta em áudio */}
            <div className="flex items-center justify-between rounded-lg border p-3">
              <div>
                <p className="text-sm font-medium">Responder em áudio</p>
                <p className="text-xs text-muted-foreground">
                  IA envia mensagens de voz em vez de texto
                </p>
              </div>
              <button
                type="button"
                role="switch"
                aria-checked={audioEnabled}
                onClick={() => setAudioEnabled((v) => !v)}
                className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                  audioEnabled ? 'bg-primary' : 'bg-muted-foreground/30'
                }`}
              >
                <span
                  className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                    audioEnabled ? 'translate-x-6' : 'translate-x-1'
                  }`}
                />
              </button>
            </div>

            {/* Voice ID */}
            <div className="space-y-1.5">
              <label className="text-sm font-medium">Voice ID do ElevenLabs</label>
              <Input
                placeholder="Ex: 21m00Tcm4TlvDq8ikWAM"
                value={voiceId}
                onChange={(e) => setVoiceId(e.target.value)}
                className="font-mono text-xs"
              />
              <div className="rounded-md bg-muted p-2 text-xs space-y-1">
                <p className="font-medium text-muted-foreground">Vozes populares:</p>
                {POPULAR_VOICES.map((v) => (
                  <button
                    key={v.id}
                    type="button"
                    onClick={() => setVoiceId(v.id)}
                    className={`block w-full text-left px-2 py-1 rounded hover:bg-background transition-colors ${
                      voiceId === v.id ? 'bg-background font-medium' : ''
                    }`}
                  >
                    {v.name}
                    <span className="text-muted-foreground ml-1 font-mono">{v.id.slice(0, 8)}…</span>
                  </button>
                ))}
              </div>
            </div>

            {/* API Key */}
            <div className="space-y-1.5">
              <label className="text-sm font-medium">ElevenLabs API Key (nova)</label>
              <div className="relative">
                <Input
                  type={showKey ? 'text' : 'password'}
                  placeholder="sk_..."
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
                ElevenLabs key: {hasElevenLabsKey ? '✓ configurada' : '— não configurada'}.
                Deixar em branco mantém a chave atual.
              </p>
            </div>

            {audioEnabled && !hasElevenLabsKey && !apiKey.trim() && (
              <p className="text-xs text-amber-600 bg-amber-50 border border-amber-200 rounded p-2">
                ⚠️ Informe a API key do ElevenLabs para ativar as respostas em áudio.
              </p>
            )}

            {/* Requisito: STT usa OpenAI Whisper */}
            <div className="rounded-md bg-muted p-3 text-xs text-muted-foreground space-y-1">
              <p className="font-medium text-foreground">Transcrição de áudio (STT)</p>
              <p>
                Quando o cliente enviar um áudio, ele será transcrito automaticamente via{' '}
                <strong>OpenAI Whisper</strong>. Requer a OpenAI API key configurada no provedor de IA.
              </p>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => { setOpen(false); setApiKey('') }}>Cancelar</Button>
            <Button onClick={handleSave} disabled={loading}>
              {loading ? 'Salvando...' : 'Salvar'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
