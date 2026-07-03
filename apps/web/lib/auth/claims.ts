import { sql } from 'drizzle-orm'
import { withAdmin, type DbClaims } from '@/lib/db'

/**
 * Monta os claims de sessão de um usuário chamando get_session_claims() no
 * banco — substitui o custom_access_token_hook do Supabase. Roda com bypass
 * (withAdmin) porque precisa ler super_admins/users antes de qualquer contexto
 * de RLS existir.
 */
export async function getClaimsForUser(userId: string): Promise<DbClaims> {
  return withAdmin(async (tx) => {
    const res = await tx.execute(
      sql`select get_session_claims(${userId}::uuid) as c`
    )
    const row = (res.rows?.[0] ?? {}) as { c?: DbClaims }
    return row.c ?? { sub: userId, role: 'authenticated', is_super_admin: false }
  })
}
