export const dynamic = 'force-dynamic'

import Link from 'next/link'
import { notFound } from 'next/navigation'
import { ArrowLeft, ArrowRight } from 'lucide-react'
import { listTutorialsForUser } from '@/lib/data/tutorials'
import { TutorialPlayer } from '@/components/tutorials/tutorial-player'

export default async function TutorialPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  const videos = (await listTutorialsForUser()).filter((v) => v.videoUrl)
  const i = videos.findIndex((v) => v.slug === slug)
  if (i < 0) notFound()
  const atual = videos[i]
  const anterior = videos[i - 1]
  const proximo = videos[i + 1]

  return (
    <div className="mx-auto max-w-3xl space-y-6 p-8">
      <Link href="/tutoriais" className="flex items-center gap-1.5 text-xs text-muted-foreground transition-colors hover:text-foreground">
        <ArrowLeft className="h-3.5 w-3.5" /> Tutoriais
      </Link>
      <div>
        <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{atual.category}</p>
        <h1 className="mt-1 text-2xl font-bold">{atual.title}</h1>
        {atual.description && <p className="mt-1 text-sm text-muted-foreground">{atual.description}</p>}
      </div>

      <TutorialPlayer key={atual.id} videoId={atual.id} videoUrl={atual.videoUrl!} posterUrl={atual.posterUrl} initialWatched={atual.watched} />

      <div className="flex items-center justify-between border-t pt-4 text-sm">
        {anterior ? (
          <Link href={`/tutoriais/${anterior.slug}`} className="flex items-center gap-1.5 text-muted-foreground transition-colors hover:text-foreground">
            <ArrowLeft className="h-4 w-4" /> {anterior.title}
          </Link>
        ) : <span />}
        {proximo && (
          <Link href={`/tutoriais/${proximo.slug}`} className="flex items-center gap-1.5 text-muted-foreground transition-colors hover:text-foreground">
            {proximo.title} <ArrowRight className="h-4 w-4" />
          </Link>
        )}
      </div>
    </div>
  )
}
