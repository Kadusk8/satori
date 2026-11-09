'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import {
  getTrainingTranscript,
  setTrainingFeedbackStatus,
  type AdminFeedbackRow,
  type AdminSessionRow,
  type TrainingMessage,
} from '@/lib/data/ai-training'
import { toast } from 'sonner'

const statusLabel = { new: 'Novo', applied: 'Aplicado', dismissed: 'Descartado' } as const
const dateFmt = (iso: string) => new Date(iso).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })

export function TrainingAdminView({ feedback, sessions }: { feedback: AdminFeedbackRow[]; sessions: AdminSessionRow[] }) {
  const router = useRouter()
  const [filter, setFilter] = useState<'new' | 'all'>('new')
  const [, startTransition] = useTransition()
  const [openSession, setOpenSession] = useState<string | null>(null)
  const [transcript, setTranscript] = useState<TrainingMessage[]>([])

  const shown = feedback.filter((f) => filter === 'all' || f.status === 'new')

  const mark = (id: string, status: 'new' | 'applied' | 'dismissed') =>
    startTransition(async () => {
      try {
        await setTrainingFeedbackStatus(id, status)
        router.refresh()
      } catch (err) {
        toast.error(err instanceof Error ? err.message : 'Erro ao atualizar.')
      }
    })

  const toggleTranscript = async (id: string) => {
    if (openSession === id) { setOpenSession(null); return }
    try {
      setTranscript(await getTrainingTranscript(id))
      setOpenSession(id)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Erro ao carregar a conversa.')
    }
  }

  return (
    <div className="space-y-8">
      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold">Mudanças pedidas</h2>
          <div className="flex gap-1">
            <Button size="sm" variant={filter === 'new' ? 'default' : 'outline'} onClick={() => setFilter('new')}>
              Novas ({feedback.filter((f) => f.status === 'new').length})
            </Button>
            <Button size="sm" variant={filter === 'all' ? 'default' : 'outline'} onClick={() => setFilter('all')}>Todas</Button>
          </div>
        </div>
        {shown.length === 0 && <p className="text-sm text-muted-foreground">Nenhuma mudança pedida ainda.</p>}
        {shown.map((f) => (
          <Card key={f.id}>
            <CardHeader className="pb-2">
              <CardTitle className="flex items-center justify-between text-sm">
                <span>{f.tenantName} · <span className="font-normal text-muted-foreground">{dateFmt(f.createdAt)}</span></span>
                <Badge variant={f.status === 'new' ? 'default' : 'secondary'}>{statusLabel[f.status]}</Badge>
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-sm">
              {f.customerMessage && <p><span className="text-muted-foreground">Cliente disse:</span> {f.customerMessage}</p>}
              <p><span className="text-muted-foreground">IA respondeu:</span> {f.aiResponse ?? '—'}</p>
              <p className="rounded-md bg-emerald-500/10 p-2"><span className="text-muted-foreground">Queria:</span> <b>{f.desiredResponse}</b></p>
              <div className="flex gap-2 pt-1">
                {f.status !== 'applied' && <Button size="sm" onClick={() => mark(f.id, 'applied')}>Marcar como aplicado</Button>}
                {f.status !== 'dismissed' && <Button size="sm" variant="outline" onClick={() => mark(f.id, 'dismissed')}>Descartar</Button>}
                {f.status !== 'new' && <Button size="sm" variant="ghost" onClick={() => mark(f.id, 'new')}>Reabrir</Button>}
              </div>
            </CardContent>
          </Card>
        ))}
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold">Sessões de teste</h2>
        {sessions.length === 0 && <p className="text-sm text-muted-foreground">Nenhuma sessão ainda.</p>}
        {sessions.map((s) => (
          <Card key={s.id}>
            <CardContent className="space-y-2 p-4 text-sm">
              <div className="flex items-center justify-between">
                <span className="font-medium">{s.tenantName} <span className="font-normal text-muted-foreground">· {dateFmt(s.startedAt)}</span></span>
                <Badge variant="outline">{s.status === 'finished' ? 'Encerrada' : s.status === 'active' ? 'Em andamento' : 'Abandonada'}</Badge>
              </div>
              <p className="text-muted-foreground">{s.messageCount} mensagens · {s.feedbackCount} mudança(s) pedida(s)</p>
              {s.generalNotes && <p className="rounded-md bg-muted p-2"><b>Observações:</b> {s.generalNotes}</p>}
              {s.messageCount > 0 && (
                <Button size="sm" variant="outline" onClick={() => toggleTranscript(s.id)}>
                  {openSession === s.id ? 'Esconder conversa' : 'Ver conversa'}
                </Button>
              )}
              {openSession === s.id && (
                <div className="space-y-1.5 rounded-md border p-3">
                  {transcript.map((m) => (
                    <p key={m.id} className={m.sender === 'customer' ? 'text-right' : ''}>
                      <span className="text-xs text-muted-foreground">{m.sender === 'customer' ? 'Cliente' : 'IA'}: </span>
                      {m.content ?? (m.contentType === 'audio' ? '🎤 áudio' : m.contentType === 'image' ? '🖼️ imagem' : '')}
                    </p>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        ))}
      </section>
    </div>
  )
}
