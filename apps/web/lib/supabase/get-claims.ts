import type { SupabaseClient } from '@supabase/supabase-js'

// Claims customizados injetados no JWT pelo custom_access_token_hook
// (supabase/migrations/021_auth_custom_claims_hook.sql, 025_fix_jwt_role_claim.sql).
// Não vêm em user.app_metadata/user_metadata — só no payload do access_token.
export interface SessionClaims {
  isSuperAdmin: boolean
  tenantId: string | null
  userRole: string | null
}

function decodeAccessToken(accessToken: string): Record<string, unknown> {
  const payload = accessToken.split('.')[1]
  return JSON.parse(Buffer.from(payload, 'base64').toString('utf-8'))
}

export async function getSessionClaims(supabase: SupabaseClient): Promise<SessionClaims> {
  const { data: { session } } = await supabase.auth.getSession()

  if (!session?.access_token) {
    return { isSuperAdmin: false, tenantId: null, userRole: null }
  }

  try {
    const claims = decodeAccessToken(session.access_token)
    return {
      isSuperAdmin: claims.is_super_admin === true,
      tenantId: typeof claims.tenant_id === 'string' ? claims.tenant_id : null,
      userRole: typeof claims.user_role === 'string' ? claims.user_role : null,
    }
  } catch {
    return { isSuperAdmin: false, tenantId: null, userRole: null }
  }
}
