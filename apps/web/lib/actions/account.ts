'use server'

import { eq } from 'drizzle-orm'
import { withAdmin } from '@/lib/db'
import { authUsers } from '@/lib/db/schema'
import { getSessionClaims } from '@/lib/auth/session'
import { hashPassword, verifyPassword } from '@/lib/auth/password'

/** Troca a própria senha — nunca recebe um userId de terceiro como input. */
export async function changeOwnPassword(currentPassword: string, newPassword: string) {
  const claims = await getSessionClaims()
  if (!claims.userId) throw new Error('Sessão inválida.')
  if (newPassword.length < 8) throw new Error('A nova senha precisa ter pelo menos 8 caracteres.')

  await withAdmin(async (tx) => {
    const rows = await tx
      .select({ passwordHash: authUsers.passwordHash })
      .from(authUsers)
      .where(eq(authUsers.id, claims.userId!))
      .limit(1)

    const passwordHash = rows[0]?.passwordHash
    if (!passwordHash) throw new Error('Não foi possível verificar a senha atual.')

    const valid = await verifyPassword(currentPassword, passwordHash)
    if (!valid) throw new Error('Senha atual incorreta.')

    const newHash = await hashPassword(newPassword)
    await tx.update(authUsers).set({ passwordHash: newHash, updatedAt: new Date() }).where(eq(authUsers.id, claims.userId!))
  })
}
