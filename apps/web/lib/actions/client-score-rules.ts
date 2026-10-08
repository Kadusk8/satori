'use server'

import { revalidatePath } from 'next/cache'
import { and, eq, inArray } from 'drizzle-orm'
import { withClaims } from '@/lib/db'
import { clientScoreRules, products } from '@/lib/db/schema'
import { getSessionClaims, getDbClaims } from '@/lib/auth/session'
import { isManager } from '@/lib/auth/permissions'
import type { ScoreRules } from '@/lib/client-score'

async function requireManagerClaims() {
  const claims = await getSessionClaims()
  if (!claims.tenantId || !isManager(claims.userRole)) {
    throw new Error('Sem permissão para alterar as regras de pontuação.')
  }
  const dbClaims = (await getDbClaims())!
  return { tenantId: claims.tenantId, dbClaims }
}

function intInRange(value: number, min: number, max: number, field: string) {
  if (!Number.isFinite(value) || Math.trunc(value) !== value || value < min || value > max) {
    throw new Error(`${field}: informe um número inteiro entre ${min} e ${max}.`)
  }
  return value
}

export async function saveClientScoreRules(input: ScoreRules) {
  const { tenantId, dbClaims } = await requireManagerClaims()

  const pointsPerVisit = intInRange(input.pointsPerVisit, 0, 100_000, 'Pontos por visita')
  const pointsPerSpendStep = intInRange(input.pointsPerSpendStep, 0, 100_000, 'Pontos por valor gasto')
  const noShowPenalty = intInRange(input.noShowPenalty, 0, 100_000, 'Penalidade por falta')
  const inactiveAfterDays = intInRange(input.inactiveAfterDays, 1, 3650, 'Dias até ficar inativo')
  const windowMonths =
    input.windowMonths === null ? null : intInRange(input.windowMonths, 1, 120, 'Janela de meses')
  if (!Number.isFinite(input.spendStep) || input.spendStep <= 0 || input.spendStep > 1_000_000) {
    throw new Error('Valor gasto: informe um valor maior que zero.')
  }

  const tiers = input.tiers.map((t) => ({
    name: t.name.trim(),
    min_points: intInRange(t.minPoints, 0, 10_000_000, `Faixa "${t.name}"`),
  }))
  if (tiers.some((t) => !t.name)) throw new Error('Toda faixa precisa de um nome.')
  if (new Set(tiers.map((t) => t.name.toLowerCase())).size !== tiers.length) {
    throw new Error('Há faixas com o mesmo nome.')
  }
  if (tiers.length > 10) throw new Error('No máximo 10 faixas.')
  tiers.sort((a, b) => a.min_points - b.min_points)

  const bonusProductIds = [...new Set(input.serviceBonuses.map((b) => b.productId))]
  if (bonusProductIds.length !== input.serviceBonuses.length) {
    throw new Error('Cada serviço só pode ter um bônus.')
  }

  await withClaims(dbClaims, async (tx) => {
    // Bônus só pra produtos do próprio tenant
    const owned = bonusProductIds.length
      ? await tx
          .select({ id: products.id })
          .from(products)
          .where(and(eq(products.tenantId, tenantId), inArray(products.id, bonusProductIds)))
      : []
    const ownedIds = new Set(owned.map((p) => p.id))
    const serviceBonuses = input.serviceBonuses
      .filter((b) => ownedIds.has(b.productId))
      .map((b) => ({
        product_id: b.productId,
        points: intInRange(b.points, -100_000, 100_000, 'Bônus por serviço'),
      }))

    const values = {
      pointsPerVisit,
      spendStep: String(input.spendStep),
      pointsPerSpendStep,
      noShowPenalty,
      windowMonths,
      inactiveAfterDays,
      serviceBonuses,
      tiers,
      updatedAt: new Date(),
    }

    await tx
      .insert(clientScoreRules)
      .values({ tenantId, ...values })
      .onConflictDoUpdate({ target: clientScoreRules.tenantId, set: values })
  })

  revalidatePath('/settings/score')
  revalidatePath('/contacts', 'layout')
}
