'use server'

import { revalidatePath } from 'next/cache'
import { eq, sql } from 'drizzle-orm'
import { withAdmin, withClaims } from '@/lib/db'
import { tutorialVideos, tutorialProgress } from '@/lib/db/schema'
import { getDbClaims } from '@/lib/auth/session'

// Ações do admin rodam com withAdmin (ignora o RLS): a checagem de super admin tem que
// estar DENTRO de cada ação, porque o layout do /admin não protege a chamada direta.
async function requireSuperAdmin(): Promise<void> {
  const claims = await getDbClaims()
  if (!claims?.is_super_admin) throw new Error('Apenas o super admin pode gerenciar os tutoriais.')
}

function revalidar() {
  revalidatePath('/tutoriais')
  revalidatePath('/admin/tutoriais')
}

/** Marca o vídeo como assistido para o usuário logado (idempotente). */
export async function markTutorialWatched(videoId: string): Promise<void> {
  const claims = await getDbClaims()
  if (!claims) throw new Error('Não autenticado.')
  await withClaims(claims, (tx) =>
    tx.insert(tutorialProgress).values({ userId: claims.sub, videoId }).onConflictDoNothing(),
  )
  revalidatePath('/tutoriais')
}

export async function unmarkTutorialWatched(videoId: string): Promise<void> {
  const claims = await getDbClaims()
  if (!claims) throw new Error('Não autenticado.')
  await withClaims(claims, (tx) =>
    tx.delete(tutorialProgress).where(sql`${tutorialProgress.videoId} = ${videoId} and ${tutorialProgress.userId} = ${claims.sub}`),
  )
  revalidatePath('/tutoriais')
}

export async function updateTutorial(
  id: string,
  data: { title: string; description: string; category: string; audience: 'all' | 'manager'; published: boolean },
): Promise<void> {
  await requireSuperAdmin()
  const title = data.title.trim()
  if (!title) throw new Error('O título é obrigatório.')
  await withAdmin((tx) =>
    tx.update(tutorialVideos).set({
      title,
      description: data.description.trim() || null,
      category: data.category.trim() || 'Geral',
      audience: data.audience,
      published: data.published,
      updatedAt: new Date(),
    }).where(eq(tutorialVideos.id, id)),
  )
  revalidar()
}

/** Anexa (ou troca/remove) o arquivo do vídeo. url vazia = volta para "em breve". */
export async function setTutorialMedia(
  id: string,
  media: { videoUrl: string; posterUrl?: string | null; durationSeconds?: number | null },
): Promise<void> {
  await requireSuperAdmin()
  const url = media.videoUrl.trim()
  if (url && !/^https:\/\//i.test(url)) throw new Error('A URL do vídeo precisa começar com https://')
  await withAdmin((tx) =>
    tx.update(tutorialVideos).set({
      videoUrl: url || null,
      posterUrl: url ? (media.posterUrl ?? null) : null,
      durationSeconds: url ? (media.durationSeconds ?? null) : null,
      updatedAt: new Date(),
    }).where(eq(tutorialVideos.id, id)),
  )
  revalidar()
}

/** Troca a posição de dois vídeos vizinhos (direção -1 sobe, 1 desce). */
export async function moveTutorial(id: string, direction: -1 | 1): Promise<void> {
  await requireSuperAdmin()
  await withAdmin(async (tx) => {
    const todos = await tx.select({ id: tutorialVideos.id }).from(tutorialVideos).orderBy(tutorialVideos.position, tutorialVideos.createdAt)
    const i = todos.findIndex((t) => t.id === id)
    const j = i + direction
    if (i < 0 || j < 0 || j >= todos.length) return
    const ordem = todos.map((t) => t.id)
    ;[ordem[i], ordem[j]] = [ordem[j], ordem[i]]
    for (const [pos, vid] of ordem.entries()) {
      await tx.update(tutorialVideos).set({ position: pos }).where(eq(tutorialVideos.id, vid))
    }
  })
  revalidar()
}
