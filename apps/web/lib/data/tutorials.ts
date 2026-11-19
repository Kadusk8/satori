import { asc, eq } from 'drizzle-orm'
import { withClaims, withAdmin } from '@/lib/db'
import { tutorialVideos, tutorialProgress } from '@/lib/db/schema'
import { getSessionClaims, getDbClaims } from '@/lib/auth/session'
import { isManager } from '@/lib/auth/permissions'

export interface TutorialItem {
  id: string
  slug: string
  title: string
  description: string | null
  category: string
  audience: string
  videoUrl: string | null
  posterUrl: string | null
  durationSeconds: number | null
  position: number
  published: boolean
  watched: boolean
}

const colunas = {
  id: tutorialVideos.id,
  slug: tutorialVideos.slug,
  title: tutorialVideos.title,
  description: tutorialVideos.description,
  category: tutorialVideos.category,
  audience: tutorialVideos.audience,
  videoUrl: tutorialVideos.videoUrl,
  posterUrl: tutorialVideos.posterUrl,
  durationSeconds: tutorialVideos.durationSeconds,
  position: tutorialVideos.position,
  published: tutorialVideos.published,
}

/** Vídeos que o usuário logado pode ver (vendedor não vê os de gestão), com o progresso dele. */
export async function listTutorialsForUser(): Promise<TutorialItem[]> {
  const claims = await getSessionClaims()
  const dbClaims = await getDbClaims()
  if (!dbClaims) return []
  const manager = isManager(claims.userRole)

  return withClaims(dbClaims, async (tx) => {
    const [videos, watched] = await Promise.all([
      tx.select(colunas).from(tutorialVideos).orderBy(asc(tutorialVideos.position)),
      tx.select({ videoId: tutorialProgress.videoId }).from(tutorialProgress).where(eq(tutorialProgress.userId, dbClaims.sub)),
    ])
    const vistos = new Set(watched.map((w) => w.videoId))
    return videos
      .filter((v) => manager || v.audience === 'all')
      .map((v) => ({ ...v, watched: vistos.has(v.id) }))
  })
}

/** Todos os vídeos (inclusive rascunhos) para o super admin gerenciar. */
export async function listTutorialsForAdmin(): Promise<Omit<TutorialItem, 'watched'>[]> {
  return withAdmin((tx) => tx.select(colunas).from(tutorialVideos).orderBy(asc(tutorialVideos.position)))
}
