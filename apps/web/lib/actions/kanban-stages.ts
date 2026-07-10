'use server'

import { revalidatePath } from 'next/cache'
import { eq } from 'drizzle-orm'
import { withClaims } from '@/lib/db'
import { kanbanStages, conversations } from '@/lib/db/schema'
import { getSessionClaims, getDbClaims } from '@/lib/auth/session'
import { isManager } from '@/lib/auth/permissions'
import { PROTECTED_STAGE_SLUGS } from '@/lib/kanban-stage-slugs'

async function requireManagerClaims() {
  const claims = await getSessionClaims()
  if (!claims.tenantId || !isManager(claims.userRole)) {
    throw new Error('Sem permissão para gerenciar as colunas do kanban.')
  }
  const dbClaims = (await getDbClaims())!
  return { tenantId: claims.tenantId, dbClaims }
}

function slugify(name: string): string {
  return (
    name
      .toLowerCase()
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .replace(/[^a-z0-9]+/g, '_')
      .replace(/^_+|_+$/g, '')
      .slice(0, 60) || 'estagio'
  )
}

function revalidateKanbanPaths() {
  revalidatePath('/conversations')
  revalidatePath('/settings/kanban')
}

export async function createKanbanStage(input: { name: string; color: string }) {
  const { tenantId, dbClaims } = await requireManagerClaims()
  const name = input.name.trim()
  if (!name) throw new Error('Nome é obrigatório.')

  await withClaims(dbClaims, async (tx) => {
    const existing = await tx
      .select({ position: kanbanStages.position, slug: kanbanStages.slug })
      .from(kanbanStages)
      .where(eq(kanbanStages.tenantId, tenantId))

    const maxPosition = existing.reduce((m, s) => Math.max(m, s.position), -1)
    const baseSlug = slugify(name)
    let slug = baseSlug
    let n = 1
    const usedSlugs = new Set(existing.map((s) => s.slug))
    while (usedSlugs.has(slug)) slug = `${baseSlug}_${++n}`

    await tx.insert(kanbanStages).values({
      tenantId,
      name,
      slug,
      color: input.color || '#6366f1',
      position: maxPosition + 1,
    })
  })

  revalidateKanbanPaths()
}

export async function updateKanbanStage(id: string, input: { name?: string; color?: string }) {
  const { dbClaims } = await requireManagerClaims()

  await withClaims(dbClaims, async (tx) => {
    const patch: Record<string, unknown> = {}
    if (input.name !== undefined && input.name.trim()) patch.name = input.name.trim()
    if (input.color !== undefined && input.color) patch.color = input.color
    if (Object.keys(patch).length === 0) return
    // RLS (tenant_isolation) já restringe esse update ao tenant da sessão.
    await tx.update(kanbanStages).set(patch).where(eq(kanbanStages.id, id))
  })

  revalidateKanbanPaths()
}

export async function setDefaultKanbanStage(id: string) {
  const { tenantId, dbClaims } = await requireManagerClaims()

  await withClaims(dbClaims, async (tx) => {
    await tx.update(kanbanStages).set({ isDefault: false }).where(eq(kanbanStages.tenantId, tenantId))
    await tx.update(kanbanStages).set({ isDefault: true }).where(eq(kanbanStages.id, id))
  })

  revalidateKanbanPaths()
}

export async function reorderKanbanStages(orderedIds: string[]) {
  const { tenantId, dbClaims } = await requireManagerClaims()

  await withClaims(dbClaims, async (tx) => {
    // RLS já restringe a leitura/escrita ao tenant da sessão — confere aqui só
    // pra ignorar ids que não pertencem a essa lista (defesa em profundidade).
    const rows = await tx.select({ id: kanbanStages.id }).from(kanbanStages).where(eq(kanbanStages.tenantId, tenantId))
    const validIds = new Set(rows.map((r) => r.id))
    for (let i = 0; i < orderedIds.length; i++) {
      if (!validIds.has(orderedIds[i])) continue
      await tx.update(kanbanStages).set({ position: i }).where(eq(kanbanStages.id, orderedIds[i]))
    }
  })

  revalidateKanbanPaths()
}

export async function deleteKanbanStage(id: string) {
  const { tenantId, dbClaims } = await requireManagerClaims()

  await withClaims(dbClaims, async (tx) => {
    const stages = await tx.select().from(kanbanStages).where(eq(kanbanStages.tenantId, tenantId))
    const target = stages.find((s) => s.id === id)
    if (!target) throw new Error('Coluna não encontrada.')
    if (stages.length <= 1) throw new Error('Não é possível excluir a última coluna do kanban.')
    if ((PROTECTED_STAGE_SLUGS as readonly string[]).includes(target.slug)) {
      throw new Error('Esta é uma coluna padrão do sistema, usada pra mover cards automaticamente — ela não pode ser excluída.')
    }

    const remaining = stages.filter((s) => s.id !== id)
    const fallback = remaining.find((s) => s.isDefault) ?? remaining.sort((a, b) => a.position - b.position)[0]

    // Move as conversas da coluna excluída pra coluna de fallback antes de
    // excluir — conversations.kanban_stage_id referencia kanban_stages sem
    // ON DELETE, então excluir com conversas ainda apontando pra cá quebraria
    // com erro de foreign key.
    await tx.update(conversations).set({ kanbanStageId: fallback.id }).where(eq(conversations.kanbanStageId, id))

    if (target.isDefault) {
      await tx.update(kanbanStages).set({ isDefault: true }).where(eq(kanbanStages.id, fallback.id))
    }

    await tx.delete(kanbanStages).where(eq(kanbanStages.id, id))
  })

  revalidateKanbanPaths()
}
