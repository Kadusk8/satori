'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { Bot, Check, Loader2, Mic, PencilLine, Send, Square, X } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import {
  discardTrainingSession,
  finishTrainingSession,
  saveTrainingFeedback,
  sendTrainingMessage,
  startTrainingSession,
  type TrainingFeedbackItem,
  type TrainingMessage,
} from '@/lib/data/ai-training'

const CLOUDINARY_CLOUD_NAME = process.env.NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME ?? 'demo'
const CLOUDINARY_UPLOAD_PRESET = process.env.NEXT_PUBLIC_CLOUDINARY_UPLOAD_PRESET ?? 'ml_default'

// Cloudinary guarda áudio como "video". Pedimos .ogg pro Whisper (mesmo formato do WhatsApp);
// pra tocar no navegador usamos .mp3, que todo browser (inclusive Safari) reproduz.
async function uploadRecording(blob: Blob): Promise<string> {
  const form = new FormData()
  form.append('file', blob, 'audio')
  form.append('upload_preset', CLOUDINARY_UPLOAD_PRESET)
  form.append('folder', 'satori/training')
  const res = await fetch(`https://api.cloudinary.com/v1_1/${CLOUDINARY_CLOUD_NAME}/video/upload`, { method: 'POST', body: form })
  if (!res.ok) throw new Error('Não consegui enviar o áudio.')
  const json = (await res.json()) as { secure_url?: string }
  if (!json.secure_url) throw new Error('Não consegui enviar o áudio.')
  return json.secure_url.replace(/\.[a-z0-9]+$/i, '.ogg')
}

const playable = (url: string) => url.replace(/\.ogg$/i, '.mp3')

function formatTime(iso: string) {
  return new Date(iso).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
}

const SCENARIOS: Record<'product' | 'fashion' | 'service', string[]> = {
  product: ['Quanto custa?', 'Tem desconto?', 'Vocês entregam?', 'Qual o horário de funcionamento?', 'Quero falar com um atendente'],
  fashion: ['Quanto custa?', 'Tem esse em outro tamanho?', 'Tem desconto?', 'Vocês trocam se não servir?', 'Quero falar com um atendente'],
  service: ['Quais serviços vocês fazem?', 'Quanto custa?', 'Quero agendar um horário', 'Qual o horário de funcionamento?', 'Quero falar com um atendente'],
}

interface TrainingChatProps {
  businessName: string
  businessModel: 'product' | 'fashion' | 'service'
}

type Phase = 'intro' | 'chat' | 'done'

export function TrainingChat({ businessName, businessModel }: TrainingChatProps) {
  const [phase, setPhase] = useState<Phase>('intro')
  const [sessionId, setSessionId] = useState<string | null>(null)
  const [msgs, setMsgs] = useState<TrainingMessage[]>([])
  const [text, setText] = useState('')
  const [busy, setBusy] = useState(false) // IA respondendo
  const [starting, setStarting] = useState(false)
  const [feedback, setFeedback] = useState<TrainingFeedbackItem[]>([])
  const [feedbackFor, setFeedbackFor] = useState<string | null>(null)
  const [feedbackText, setFeedbackText] = useState('')
  const [savingFeedback, setSavingFeedback] = useState(false)
  const [finishOpen, setFinishOpen] = useState(false)
  const [notes, setNotes] = useState('')
  const [finishing, setFinishing] = useState(false)
  const [doneCount, setDoneCount] = useState(0)

  const [recording, setRecording] = useState(false)
  const [seconds, setSeconds] = useState(0)
  const recorderRef = useRef<MediaRecorder | null>(null)
  const chunksRef = useRef<Blob[]>([])
  const streamRef = useRef<MediaStream | null>(null)
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const cancelRef = useRef(false)
  const bottomRef = useRef<HTMLDivElement>(null)
  const sessionRef = useRef<string | null>(null)

  useEffect(() => { sessionRef.current = sessionId }, [sessionId])
  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: 'smooth' }) }, [msgs, busy])

  // Fechou a aba no meio do teste: limpa a conversa de teste (a lista de mudanças já está salva).
  useEffect(() => {
    return () => {
      if (timerRef.current) clearInterval(timerRef.current)
      streamRef.current?.getTracks().forEach((t) => t.stop())
    }
  }, [])

  const start = async () => {
    setStarting(true)
    try {
      const res = await startTrainingSession()
      setSessionId(res.sessionId)
      setMsgs(res.messages)
      setFeedback([])
      setPhase('chat')
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Não consegui iniciar o teste.')
    } finally {
      setStarting(false)
    }
  }

  const deliver = useCallback(async (payload: { text?: string; audioUrl?: string }, optimistic: TrainingMessage) => {
    if (!sessionId) return
    setMsgs((prev) => [...prev, optimistic])
    setBusy(true)
    try {
      const res = await sendTrainingMessage({ sessionId, ...payload })
      setMsgs(res.messages)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Falha ao falar com a IA.')
    } finally {
      setBusy(false)
    }
  }, [sessionId])

  const sendText = async (override?: string) => {
    const value = (override ?? text).trim()
    if (!value || busy) return
    if (override === undefined) setText('')
    await deliver({ text: value }, {
      id: `tmp-${Date.now()}`, sender: 'customer', content: value, contentType: 'text', mediaUrl: null, createdAt: new Date().toISOString(),
    })
  }

  const startRecording = async () => {
    if (busy || recording) return
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      streamRef.current = stream
      const mime = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4'].find((m) => MediaRecorder.isTypeSupported(m))
      const recorder = new MediaRecorder(stream, mime ? { mimeType: mime } : undefined)
      chunksRef.current = []
      cancelRef.current = false
      recorder.ondataavailable = (e) => { if (e.data.size > 0) chunksRef.current.push(e.data) }
      recorder.onstop = async () => {
        stream.getTracks().forEach((t) => t.stop())
        if (timerRef.current) clearInterval(timerRef.current)
        setRecording(false)
        if (cancelRef.current || chunksRef.current.length === 0) return
        const blob = new Blob(chunksRef.current, { type: recorder.mimeType || 'audio/webm' })
        setBusy(true)
        try {
          const audioUrl = await uploadRecording(blob)
          await deliver({ audioUrl }, {
            id: `tmp-${Date.now()}`, sender: 'customer', content: null, contentType: 'audio', mediaUrl: audioUrl, createdAt: new Date().toISOString(),
          })
        } catch (err) {
          setBusy(false)
          toast.error(err instanceof Error ? err.message : 'Falha ao enviar o áudio.')
        }
      }
      recorderRef.current = recorder
      recorder.start()
      setSeconds(0)
      setRecording(true)
      timerRef.current = setInterval(() => setSeconds((s) => s + 1), 1000)
    } catch {
      toast.error('Não consegui acessar o microfone. Libere a permissão no navegador.')
    }
  }

  const stopRecording = (cancel: boolean) => {
    cancelRef.current = cancel
    recorderRef.current?.stop()
  }

  const submitFeedback = async (aiMessageId: string) => {
    if (!sessionId || !feedbackText.trim()) return
    setSavingFeedback(true)
    try {
      const item = await saveTrainingFeedback({ sessionId, aiMessageId, desiredResponse: feedbackText })
      setFeedback((prev) => [...prev, item])
      setFeedbackFor(null)
      setFeedbackText('')
      toast.success('Mudança anotada.')
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Não consegui salvar.')
    } finally {
      setSavingFeedback(false)
    }
  }

  const finish = async () => {
    if (!sessionId) return
    setFinishing(true)
    try {
      const res = await finishTrainingSession({ sessionId, generalNotes: notes })
      setDoneCount(res.feedbackCount)
      setFinishOpen(false)
      setPhase('done')
      setSessionId(null)
      setMsgs([])
      setNotes('')
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Não consegui encerrar.')
    } finally {
      setFinishing(false)
    }
  }

  // Sair da página sem encerrar descarta a conversa de teste.
  useEffect(() => {
    const onLeave = () => { if (sessionRef.current) void discardTrainingSession(sessionRef.current) }
    window.addEventListener('pagehide', onLeave)
    return () => window.removeEventListener('pagehide', onLeave)
  }, [])

  if (phase === 'intro' || phase === 'done') {
    return (
      <div className="mx-auto max-w-md rounded-xl border bg-card p-8 text-center space-y-4">
        <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-emerald-600 text-white">
          <Bot className="h-7 w-7" />
        </div>
        {phase === 'done' ? (
          <>
            <h2 className="text-lg font-semibold">Obrigado! Treinamento enviado ✅</h2>
            <p className="text-sm text-muted-foreground">
              {doneCount > 0 ? `Anotamos ${doneCount} mudança(s) que você pediu.` : 'Suas observações foram registradas.'} Nossa equipe vai ajustar a IA e avisar você.
            </p>
          </>
        ) : (
          <>
            <h2 className="text-lg font-semibold">Teste como a IA atende seus clientes</h2>
            <p className="text-sm text-muted-foreground">
              Converse com a IA de {businessName} como se fosse um cliente no WhatsApp, por texto ou áudio.
              Nada é enviado de verdade. Se algo não ficar bom, você diz como queria e a gente ajusta.
            </p>
          </>
        )}
        <Button onClick={start} disabled={starting} className="gap-2 bg-emerald-600 hover:bg-emerald-700">
          {starting && <Loader2 className="h-4 w-4 animate-spin" />}
          {phase === 'done' ? 'Fazer outro teste' : 'Fazer teste com a IA'}
        </Button>
      </div>
    )
  }

  return (
    <div className="mx-auto flex h-[calc(100vh-8rem)] max-w-md flex-col overflow-hidden rounded-xl border shadow-sm">
      {/* Cabeçalho estilo WhatsApp */}
      <div className="flex items-center gap-3 bg-[#075E54] px-3 py-2.5 text-white">
        <div className="flex h-9 w-9 items-center justify-center rounded-full bg-white/20"><Bot className="h-5 w-5" /></div>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold">{businessName}</p>
          <p className="text-[11px] opacity-80">{busy ? 'digitando…' : 'online · modo teste'}</p>
        </div>
        <Button size="sm" variant="secondary" onClick={() => setFinishOpen(true)} disabled={busy || recording} className="h-8 text-xs">
          Parar de treinar a IA
        </Button>
      </div>

      {/* Mensagens */}
      <div className="flex-1 space-y-2 overflow-y-auto bg-[#ECE5DD] p-3 text-neutral-900">
        {msgs.length === 0 && (
          <div className="mt-2 space-y-3">
            <p className="mx-auto max-w-[85%] rounded-lg bg-[#FFF3C4] px-3 py-2 text-center text-xs text-[#54450f]">
              Escreva ou grave um áudio como um cliente. Em qualquer resposta da IA, toque em “Quero mudar esta resposta”.
            </p>
            <div className="text-center">
              <p className="mb-1.5 text-[11px] text-neutral-600">Ou toque em uma pergunta comum para começar:</p>
              <div className="flex flex-wrap justify-center gap-1.5">
                {SCENARIOS[businessModel].map((q) => (
                  <button
                    key={q}
                    type="button"
                    disabled={busy}
                    onClick={() => void sendText(q)}
                    className="rounded-full border border-[#075E54]/30 bg-white px-3 py-1 text-xs text-[#075E54] shadow-sm hover:bg-[#DCF8C6] disabled:opacity-50"
                  >
                    {q}
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}
        {msgs.map((m) => {
          const mine = m.sender === 'customer'
          const noted = feedback.some((f) => f.aiResponse && f.aiResponse === m.content)
          return (
            <div key={m.id} className={`flex flex-col ${mine ? 'items-end' : 'items-start'}`}>
              <div className={`max-w-[82%] rounded-lg px-2.5 py-1.5 text-sm text-neutral-900 shadow-sm ${mine ? 'bg-[#DCF8C6]' : 'bg-white'}`}>
                {m.contentType === 'image' && m.mediaUrl && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={m.mediaUrl} alt="" className="mb-1 max-h-60 rounded-md" />
                )}
                {m.contentType === 'audio' && m.mediaUrl && <audio controls src={playable(m.mediaUrl)} className="h-9 w-56" />}
                {m.content && <p className="whitespace-pre-wrap break-words">{m.content}</p>}
                {m.contentType === 'audio' && mine && !m.content && !String(m.id).startsWith('tmp-') && (
                  <p className="text-[11px] italic text-neutral-500">🎤 áudio enviado</p>
                )}
                <p className="mt-0.5 text-right text-[10px] text-neutral-500">{formatTime(m.createdAt)}</p>
              </div>
              {!mine && !String(m.id).startsWith('tmp-') && (m.content || m.mediaUrl) && (
                feedbackFor === m.id ? (
                  <div className="mt-1 w-full max-w-[90%] space-y-1.5 rounded-lg bg-white p-2 text-neutral-900 shadow-sm">
                    <p className="text-xs font-medium">Como você queria que a IA respondesse?</p>
                    <textarea
                      value={feedbackText}
                      onChange={(e) => setFeedbackText(e.target.value)}
                      rows={3}
                      autoFocus
                      placeholder="Ex: Em vez de pedir o nome, já mandar o preço e perguntar a cor."
                      className="w-full rounded-md border border-neutral-300 bg-white p-2 text-sm text-neutral-900 placeholder:text-neutral-500"
                    />
                    <div className="flex justify-end gap-2">
                      <Button size="sm" variant="ghost" className="text-neutral-700 hover:bg-neutral-100 hover:text-neutral-900" onClick={() => { setFeedbackFor(null); setFeedbackText('') }}>Cancelar</Button>
                      <Button size="sm" onClick={() => submitFeedback(m.id)} disabled={savingFeedback || !feedbackText.trim()}>
                        {savingFeedback ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : 'Anotar'}
                      </Button>
                    </div>
                  </div>
                ) : noted ? (
                  <span className="mt-0.5 flex items-center gap-1 text-[11px] font-medium text-emerald-800"><Check className="h-3 w-3" /> mudança anotada</span>
                ) : (
                  <button
                    type="button"
                    onClick={() => { setFeedbackFor(m.id); setFeedbackText('') }}
                    className="mt-0.5 flex items-center gap-1 text-[11px] text-[#075E54] hover:underline"
                  >
                    <PencilLine className="h-3 w-3" /> Quero mudar esta resposta
                  </button>
                )
              )}
            </div>
          )
        })}
        {busy && (
          <div className="flex justify-start">
            <div className="rounded-lg bg-white px-3 py-2 shadow-sm"><Loader2 className="h-4 w-4 animate-spin text-neutral-500" /></div>
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      {/* Barra de envio */}
      <div className="flex items-center gap-2 bg-[#F0F0F0] p-2">
        {recording ? (
          <>
            <button type="button" onClick={() => stopRecording(true)} aria-label="Cancelar gravação" className="p-2 text-neutral-600 hover:text-red-600">
              <X className="h-5 w-5" />
            </button>
            <div className="flex flex-1 items-center gap-2 rounded-full bg-white px-3 py-2 text-sm text-neutral-900">
              <span className="h-2.5 w-2.5 animate-pulse rounded-full bg-red-500" />
              Gravando… {Math.floor(seconds / 60)}:{String(seconds % 60).padStart(2, '0')}
            </div>
            <button type="button" onClick={() => stopRecording(false)} aria-label="Enviar áudio" className="flex h-10 w-10 items-center justify-center rounded-full bg-[#075E54] text-white">
              <Square className="h-4 w-4 fill-current" />
            </button>
          </>
        ) : (
          <>
            <input
              value={text}
              onChange={(e) => setText(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); void sendText() } }}
              placeholder="Mensagem"
              disabled={busy}
              className="h-10 flex-1 rounded-full border-0 bg-white px-4 text-sm text-neutral-900 outline-none placeholder:text-neutral-500"
            />
            {text.trim() ? (
              <button type="button" onClick={() => void sendText()} disabled={busy} aria-label="Enviar" className="flex h-10 w-10 items-center justify-center rounded-full bg-[#075E54] text-white disabled:opacity-50">
                <Send className="h-4 w-4" />
              </button>
            ) : (
              <button type="button" onClick={() => void startRecording()} disabled={busy} aria-label="Gravar áudio" className="flex h-10 w-10 items-center justify-center rounded-full bg-[#075E54] text-white disabled:opacity-50">
                <Mic className="h-4 w-4" />
              </button>
            )}
          </>
        )}
      </div>

      {/* Encerrar */}
      <Dialog open={finishOpen} onOpenChange={(o) => { if (!finishing) setFinishOpen(o) }}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Parar de treinar a IA</DialogTitle>
            <DialogDescription>Confira o que você pediu para mudar e deixe qualquer outra observação.</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            {feedback.length > 0 ? (
              <ul className="max-h-48 space-y-2 overflow-auto text-sm">
                {feedback.map((f) => (
                  <li key={f.id} className="rounded-md border p-2">
                    <p className="text-xs text-muted-foreground">IA respondeu: “{f.aiResponse}”</p>
                    <p className="mt-1">Você queria: <b>{f.desiredResponse}</b></p>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-muted-foreground">Você ainda não anotou nenhuma mudança nas respostas.</p>
            )}
            <div>
              <label className="mb-1 block text-sm font-medium">Outras observações (opcional)</label>
              <textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                rows={4}
                placeholder="Ex: Quero que a IA fale mais informal e nunca ofereça desconto."
                className="w-full rounded-md border bg-background p-2 text-sm text-foreground placeholder:text-muted-foreground"
              />
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setFinishOpen(false)} disabled={finishing}>Continuar testando</Button>
              <Button onClick={finish} disabled={finishing} className="gap-2">
                {finishing && <Loader2 className="h-4 w-4 animate-spin" />}
                Encerrar e enviar
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
