import { auth } from '@/auth'
import type { DbClaims } from '@/lib/db'

export interface SessionClaims {
  userId: string | null
  isSuperAdmin: boolean
  tenantId: string | null
  userRole: string | null
}

/**
 * Claims prontos pra `withClaims()` (formato get_session_claims). Retorna null
 * se não houver sessão. Super admin carrega role='service_role'.
 */
export async function getDbClaims(): Promise<DbClaims | null> {
  const session = await auth()
  const claims = session?.claims as DbClaims | undefined
  if (!claims?.sub) return null
  return claims
}

/**
 * Lê os claims da sessão do NextAuth. Substitui o get-claims.ts do Supabase
 * (que decodificava o JWT do Supabase na mão). Mesma forma de retorno, pra
 * facilitar a troca 1:1 nas páginas/layouts no cutover.
 */
export async function getSessionClaims(): Promise<SessionClaims> {
  const session = await auth()
  const claims = session?.claims as DbClaims | undefined
  return {
    userId: claims?.sub ?? null,
    isSuperAdmin: claims?.is_super_admin === true,
    tenantId: typeof claims?.tenant_id === 'string' ? claims.tenant_id : null,
    userRole: typeof claims?.user_role === 'string' ? claims.user_role : null,
  }
}
