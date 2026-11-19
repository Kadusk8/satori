export const dynamic = 'force-dynamic'

import Link from 'next/link'
import { CheckCircle2, Clock, PlayCircle } from 'lucide-react'
import { listTutorialsForUser, type TutorialItem } from '@/lib/data/tutorials'
import { Badge } from '@/components/ui/badge'

function duracao(s: number | null): string | null {
  if (!s) return null
  return `${Math.floor(s / 60)}:${String(Math.round(s % 60)).padStart(2, '0')}`
}

function Card({ t }: { t: TutorialItem }) {
  const disponivel = !!t.videoUrl
  const corpo = (
    <div className="group flex h-full flex-col overflow-hidden rounded-lg border bg-card transition-colors hover:border-primary/50">
      <div className="relative flex aspect-video items-center justify-center bg-muted/40">
        {t.posterUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={t.posterUrl} alt="" className="h-full w-full object-cover" />
        ) : (
          <PlayCircle className="h-10 w-10 text-muted-foreground/50" />
        )}
        {disponivel && t.posterUrl && (
          <span className="absolute inset-0 flex items-center justify-center bg-black/20 opacity-0 transition-opacity group-hover:opacity-100">
            <PlayCircle className="h-12 w-12 text-white" />
          </span>
        )}
        {duracao(t.durationSeconds) && (
          <span className="absolute bottom-2 right-2 rounded bg-black/70 px-1.5 py-0.5 text-[10px] font-medium text-white">{duracao(t.durationSeconds)}</span>
        )}
      </div>
      <div className="flex flex-1 flex-col gap-1.5 p-4">
        <div className="flex items-start justify-between gap-2">
          <h3 className="text-sm font-semibold leading-snug">{t.title}</h3>
          {t.watched && <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-500" aria-label="Assistido" />}
        </div>
        {t.description && <p className="text-xs text-muted-foreground">{t.description}</p>}
        {!disponivel && <Badge variant="secondary" className="mt-auto w-fit gap-1 text-[10px]"><Clock className="h-3 w-3" />Em breve</Badge>}
      </div>
    </div>
  )
  return disponivel ? <Link href={`/tutoriais/${t.slug}`}>{corpo}</Link> : <div className="opacity-70">{corpo}</div>
}

export default async function TutoriaisPage() {
  const videos = await listTutorialsForUser()
  const disponiveis = videos.filter((v) => v.videoUrl)
  const assistidos = disponiveis.filter((v) => v.watched).length
  const categorias = [...new Set(videos.map((v) => v.category))]

  return (
    <div className="mx-auto max-w-5xl space-y-8 p-8">
      <div>
        <h1 className="text-2xl font-bold">Tutoriais</h1>
        <p className="mt-1 text-sm text-muted-foreground">Vídeos curtos que mostram, passo a passo, como usar cada parte do Satori.</p>
        {disponiveis.length > 0 && (
          <div className="mt-4 max-w-sm">
            <div className="mb-1 flex justify-between text-xs text-muted-foreground">
              <span>{assistidos} de {disponiveis.length} assistidos</span>
              <span>{Math.round((assistidos / disponiveis.length) * 100)}%</span>
            </div>
            <div className="h-1.5 overflow-hidden rounded-full bg-muted">
              <div className="h-full rounded-full bg-emerald-500 transition-all" style={{ width: `${(assistidos / disponiveis.length) * 100}%` }} />
            </div>
          </div>
        )}
      </div>

      {videos.length === 0 && <p className="text-sm text-muted-foreground">Nenhum tutorial disponível ainda.</p>}

      {categorias.map((cat) => (
        <section key={cat} className="space-y-3">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">{cat}</h2>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {videos.filter((v) => v.category === cat).map((v) => <Card key={v.id} t={v} />)}
          </div>
        </section>
      ))}
    </div>
  )
}
