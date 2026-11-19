'use client'

import { useState, useTransition } from 'react'
import { CheckCircle2, Circle } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { markTutorialWatched, unmarkTutorialWatched } from '@/lib/actions/tutorials'

// YouTube e Vimeo viram iframe; qualquer outra URL https (Cloudinary, mp4...) toca no <video>.
function embedUrl(url: string): string | null {
  const yt = url.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/)([\w-]{11})/)
  if (yt) return `https://www.youtube.com/embed/${yt[1]}?rel=0`
  const vimeo = url.match(/vimeo\.com\/(?:video\/)?(\d+)/)
  if (vimeo) return `https://player.vimeo.com/video/${vimeo[1]}`
  return null
}

interface TutorialPlayerProps {
  videoId: string
  videoUrl: string
  posterUrl: string | null
  initialWatched: boolean
}

export function TutorialPlayer({ videoId, videoUrl, posterUrl, initialWatched }: TutorialPlayerProps) {
  const [watched, setWatched] = useState(initialWatched)
  const [pending, startTransition] = useTransition()
  const embed = embedUrl(videoUrl)

  function marcar(valor: boolean) {
    setWatched(valor)
    startTransition(async () => {
      try {
        if (valor) await markTutorialWatched(videoId)
        else await unmarkTutorialWatched(videoId)
      } catch (err) {
        setWatched(!valor)
        toast.error(err instanceof Error ? err.message : 'Não foi possível salvar.')
      }
    })
  }

  return (
    <div className="space-y-3">
      <div className="aspect-video w-full overflow-hidden rounded-lg border bg-black">
        {embed ? (
          <iframe src={embed} title="Tutorial" className="h-full w-full" allow="fullscreen; picture-in-picture" allowFullScreen />
        ) : (
          <video
            src={videoUrl}
            poster={posterUrl ?? undefined}
            controls
            playsInline
            preload="metadata"
            className="h-full w-full"
            onEnded={() => { if (!watched) marcar(true) }}
          />
        )}
      </div>
      <div className="flex items-center justify-between gap-3">
        <p className="text-xs text-muted-foreground">
          {embed ? 'Depois de assistir, marque como assistido.' : 'O vídeo é marcado como assistido quando termina.'}
        </p>
        <Button variant={watched ? 'secondary' : 'outline'} size="sm" disabled={pending} onClick={() => marcar(!watched)} className="gap-1.5">
          {watched ? <CheckCircle2 className="h-4 w-4 text-emerald-500" /> : <Circle className="h-4 w-4" />}
          {watched ? 'Assistido' : 'Marcar como assistido'}
        </Button>
      </div>
    </div>
  )
}
