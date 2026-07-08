'use server'

import { revalidatePath } from 'next/cache'
import { eq } from 'drizzle-orm'
import { withAdmin, withClaims } from '@/lib/db'
import { users, tenants } from '@/lib/db/schema'
import { getSessionClaims, getDbClaims } from '@/lib/auth/session'
import { upsertAuthUser } from '@/lib/auth/users'
import { createToken } from '@/lib/auth/tokens'
import { sendOperatorInviteEmail } from '@/lib/email/resend'
import { isManager } from '@/lib/auth/permissions'

async function requireOwnerOrAdmin() {
  const claims = await getSessionClaims()
  if (!claims.tenantId || !isManager(claims.userRole)) {
    throw new Error('Sem permissão para gerenciar a equipe.')
  }
  return { tenantId: claims.tenantId, userRole: claims.userRole }
}

/** Cada vendedor só altera a própria disponibilidade — nunca recebe userId como input. */
export async function updateAvailability(isAvailable: boolean): Promise<void> {
  const claims = await getSessionClaims()
  if (!claims.userId) throw new Error('Sessão inválida.')
  const dbClaims = (await getDbClaims())!
  await withClaims(dbClaims, (tx) =>
    tx.update(users).set({ isAvailable }).where(eq(users.id, claims.userId!))
  )
  revalidatePath('/conversations')
}

export async function inviteOperator(input: { email: string; fullName: string; role: 'admin' | 'operator' }) {
  const { tenantId } = await requireOwnerOrAdmin()

  const email = input.email.trim().toLowerCase()
  const fullName = input.fullName.trim()
  const role = input.role === 'admin' ? 'admin' : 'operator'
  if (!email || !fullName) throw new Error('Nome e email são obrigatórios.')

  // Cria a identidade sem senha (será definida pelo link de convite) e vincula
  // ao tenant como users. Tudo com bypass (auth_users/users só service_role).
  const { userId, companyName } = await withAdmin(async (tx) => {
    const authUserId = await upsertAuthUser({ email, fullName, password: null })
    await tx
      .insert(users)
      .values({ id: authUserId, tenantId, fullName, email, role })
      .onConflictDoNothing()
    const t = await tx.select({ name: tenants.name }).from(tenants).where(eq(tenants.id, tenantId)).limit(1)
    return { userId: authUserId, companyName: t[0]?.name ?? 'ZapAgent' }
  })
  void userId

  const token = createToken(email, 'invite')
  await sendOperatorInviteEmail(email, token, companyName)

  revalidatePath('/team')
}

export async function updateOperator(
  userId: string,
  data: { full_name?: string; role?: 'admin' | 'operator'; active?: boolean }
) {
  const { tenantId } = await requireOwnerOrAdmin()

  await withAdmin(async (tx) => {
    // Confere tenant + não-owner antes de alterar (bypass ignora RLS).
    const target = await tx
      .select({ tenantId: users.tenantId, role: users.role })
      .from(users)
      .where(eq(users.id, userId))
      .limit(1)

    if (!target[0]) throw new Error('Vendedor não encontrado.')
    if (target[0].tenantId !== tenantId) throw new Error('Sem permissão para alterar esse usuário.')
    if (target[0].role === 'owner') throw new Error('Não é possível alterar o owner por aqui.')

    const patch: Record<string, unknown> = {}
    if (data.full_name !== undefined) patch.fullName = data.full_name
    if (data.role !== undefined) patch.role = data.role
    if (data.active !== undefined) patch.active = data.active
    if (Object.keys(patch).length > 0) {
      await tx.update(users).set(patch).where(eq(users.id, userId))
    }
  })

  revalidatePath('/team')
}
