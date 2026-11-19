'use client'

import { useRef, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { ArrowDown, ArrowUp, Link2, Loader2, Pencil, Upload, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Switch } from '@/components/ui/switch'
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { uploadToCloudinary } from '@/lib/cloudinary'
import { moveTutorial, setTutorialMedia, updateTutorial } from '@/lib/actions/tutorials'
import type { TutorialItem } from '@/lib/data/tutorials'

type Item = Omit<TutorialItem, 'watched'>

// Miniatura automática para vídeos do Cloudinary (quadro de 2s); outros links ficam sem capa.
function posterFromCloudinary(url: string): string | null {
  if (!/res\.cloudinary\.com\/[^/]+\/video\/upload\//.test(url)) return null
  return url.replace('/video/upload/', '/video/upload/so_2,w_640,h_360,c_fill,f_jpg/').replace(/\.[a-z0-9]+(\?.*)?$/i, '.jpg')
}

export function TutorialsAdmin({ initial }: { initial: Item[] }) {
  const router = useRouter()
  const [busyId, setBusyId] = useState<string | null>(null)
  const [editing, setEditing] = useState<Item | null>(null)
  const [linkFor, setLinkFor] = useState<Item | null>(null)
  const [, startTransition] = useTransition()
  const fileRef = useRef<HTMLInputElement>(null)
  const uploadTarget = useRef<Item | null>(null)

  function run(id: string, fn: () => Promise<void>, ok?: string) {
    setBusyId(id)
    startTransition(async () => {
      try { await fn(); if (ok) toast.success(ok); router.refresh() }
      catch (err) { toast.error(err instanceof Error ? err.message : 'Erro') }
      finally { setBusyId(null) }
    })
  }

  async function aoEscolherArquivo(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]; const alvo = uploadTarget.current
    e.target.value = ''
    if (!file || !alvo) return
    if (!file.type.startsWith('video/')) { toast.error('Escolha um arquivo de vídeo (MP4).'); return }
    setBusyId(alvo.id)
    try {
      const up = await uploadToCloudinary(file, 'video', 'satori/tutoriais')
      await setTutorialMedia(alvo.id, { videoUrl: up.url, posterUrl: posterFromCloudinary(up.url), durationSeconds: up.duration ? Math.round(up.duration) : null })
      toast.success('Vídeo enviado.'); router.refresh()
    } catch (err) { toast.error(err instanceof Error ? err.message : 'Falha no envio.') }
    finally { setBusyId(null) }
  }

  return (
    <div className="space-y-3">
      <input ref={fileRef} type="file" accept="video/*" className="hidden" onChange={aoEscolherArquivo} />
      <div className="divide-y rounded-lg border">
        {initial.map((t, i) => (
          <div key={t.id} className="flex items-center gap-3 p-3">
            <div className="flex flex-col">
              <button type="button" disabled={i === 0 || busyId === t.id} onClick={() => run(t.id, () => moveTutorial(t.id, -1))} className="text-muted-foreground hover:text-foreground disabled:opacity-20"><ArrowUp className="h-3.5 w-3.5" /></button>
              <button type="button" disabled={i === initial.length - 1 || busyId === t.id} onClick={() => run(t.id, () => moveTutorial(t.id, 1))} className="text-muted-foreground hover:text-foreground disabled:opacity-20"><ArrowDown className="h-3.5 w-3.5" /></button>
            </div>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium">{t.title}</p>
              <p className="truncate text-xs text-muted-foreground">{t.category} · {t.audience === 'manager' ? 'Só gestores' : 'Todos'}</p>
            </div>
            <div className="flex shrink-0 items-center gap-2">
              {!t.published ? <Badge variant="secondary">Rascunho</Badge> : t.videoUrl ? <Badge className="bg-emerald-500/15 text-emerald-500 hover:bg-emerald-500/15">Com vídeo</Badge> : <Badge variant="secondary">Em breve</Badge>}
              <Button size="sm" variant="outline" disabled={busyId === t.id} className="gap-1.5" onClick={() => { uploadTarget.current = t; fileRef.current?.click() }}>
                {busyId === t.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Upload className="h-3.5 w-3.5" />}{t.videoUrl ? 'Trocar' : 'Enviar vídeo'}
              </Button>
              <Button size="sm" variant="ghost" title="Colar link do vídeo" onClick={() => setLinkFor(t)}><Link2 className="h-3.5 w-3.5" /></Button>
              {t.videoUrl && <Button size="sm" variant="ghost" title="Remover vídeo" className="text-destructive" onClick={() => { if (confirm(`Remover o vídeo de "${t.title}"?`)) run(t.id, () => setTutorialMedia(t.id, { videoUrl: '' }), 'Vídeo removido.') }}><Trash2 className="h-3.5 w-3.5" /></Button>}
              <Button size="sm" variant="outline" onClick={() => setEditing(t)}><Pencil className="h-3.5 w-3.5" /></Button>
            </div>
          </div>
        ))}
      </div>
      <p className="text-xs text-muted-foreground">O envio vai para o Cloudinary (pasta satori/tutoriais) e exige NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME e NEXT_PUBLIC_CLOUDINARY_UPLOAD_PRESET (unsigned). Também dá pra colar um link (Cloudinary, YouTube, Vimeo ou MP4).</p>

      {editing && <EditDialog item={editing} onClose={() => setEditing(null)} onSave={(d) => run(editing.id, () => updateTutorial(editing.id, d), 'Salvo.')} />}
      {linkFor && <LinkDialog item={linkFor} onClose={() => setLinkFor(null)} onSave={(url) => run(linkFor.id, () => setTutorialMedia(linkFor.id, { videoUrl: url, posterUrl: posterFromCloudinary(url) }), 'Link salvo.')} />}
    </div>
  )
}

function EditDialog({ item, onClose, onSave }: { item: Item; onClose: () => void; onSave: (d: { title: string; description: string; category: string; audience: 'all' | 'manager'; published: boolean }) => void }) {
  const [title, setTitle] = useState(item.title)
  const [description, setDescription] = useState(item.description ?? '')
  const [category, setCategory] = useState(item.category)
  const [audience, setAudience] = useState<'all' | 'manager'>(item.audience === 'manager' ? 'manager' : 'all')
  const [published, setPublished] = useState(item.published)
  return (
    <Dialog open onOpenChange={(o) => { if (!o) onClose() }}>
      <DialogContent className="max-w-md">
        <DialogHeader><DialogTitle>Editar tutorial</DialogTitle></DialogHeader>
        <div className="space-y-3 py-1">
          <div className="space-y-1"><label className="text-sm font-medium">Título</label><Input value={title} onChange={(e) => setTitle(e.target.value)} /></div>
          <div className="space-y-1"><label className="text-sm font-medium">Descrição</label><Textarea rows={3} value={description} onChange={(e) => setDescription(e.target.value)} /></div>
          <div className="space-y-1"><label className="text-sm font-medium">Categoria</label><Input value={category} onChange={(e) => setCategory(e.target.value)} /></div>
          <div className="flex items-center justify-between"><label className="text-sm font-medium">Só para gestores (owner/admin)</label><Switch checked={audience === 'manager'} onCheckedChange={(v) => setAudience(v ? 'manager' : 'all')} /></div>
          <div className="flex items-center justify-between"><label className="text-sm font-medium">Publicado</label><Switch checked={published} onCheckedChange={setPublished} /></div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancelar</Button>
          <Button onClick={() => { onSave({ title, description, category, audience, published }); onClose() }}>Salvar</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function LinkDialog({ item, onClose, onSave }: { item: Item; onClose: () => void; onSave: (url: string) => void }) {
  const [url, setUrl] = useState(item.videoUrl ?? '')
  return (
    <Dialog open onOpenChange={(o) => { if (!o) onClose() }}>
      <DialogContent className="max-w-md">
        <DialogHeader><DialogTitle>Link do vídeo — {item.title}</DialogTitle></DialogHeader>
        <div className="space-y-1 py-1">
          <Input autoFocus placeholder="https://..." value={url} onChange={(e) => setUrl(e.target.value)} />
          <p className="text-xs text-muted-foreground">Aceita MP4/Cloudinary, YouTube e Vimeo.</p>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancelar</Button>
          <Button disabled={!url.trim()} onClick={() => { onSave(url.trim()); onClose() }}>Salvar link</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
