import type { DbClaims } from '@/lib/db'

// Estende a sessão do NextAuth pra carregar os claims (tenant_id, user_role,
// is_super_admin) que antes vinham do custom_access_token_hook do Supabase.
declare module 'next-auth' {
  interface Session {
    claims?: DbClaims
  }
}

declare module 'next-auth/jwt' {
  interface JWT {
    claims?: DbClaims
  }
}
