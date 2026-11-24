// Config do NextAuth v5 (substitui o Supabase Auth). Credentials provider +
// sessão JWT (stateless, sem adapter de banco). Os claims de RLS são montados
// no callback jwt via get_session_claims() e expostos na sessão.

import NextAuth from 'next-auth'
import Credentials from 'next-auth/providers/credentials'
import { sql } from 'drizzle-orm'
import { authConfig } from './auth.config'
import { withAdmin, type DbClaims } from '@/lib/db'
import { authUsers } from '@/lib/db/schema'
import { verifyPassword } from '@/lib/auth/password'
import { clearLoginFailures, clientIp, isLoginBlocked, recordLoginFailure } from '@/lib/auth/rate-limit'
import { getClaimsForUser } from '@/lib/auth/claims'

export const { handlers, auth, signIn, signOut } = NextAuth({
  ...authConfig,
  providers: [
    Credentials({
      credentials: {
        email: { label: 'Email', type: 'email' },
        password: { label: 'Senha', type: 'password' },
      },
      authorize: async (credentials, request) => {
        const email = String(credentials?.email ?? '').trim().toLowerCase()
        const password = String(credentials?.password ?? '')
        if (!email || !password) return null

        const ip = clientIp(request.headers)
        if (isLoginBlocked(email, ip)) return null

        const user = await withAdmin(async (tx) => {
          const res = await tx.execute(
            sql`select id, email, password_hash, full_name
                from ${authUsers}
                where lower(email) = ${email}
                limit 1`
          )
          return res.rows?.[0] as unknown as
            | { id: string; email: string; password_hash: string | null; full_name: string | null }
            | undefined
        })

        // Usuário inexistente conta como falha (não revela se o e-mail existe).
        if (!user?.password_hash) {
          recordLoginFailure(email, ip)
          return null
        }
        const ok = await verifyPassword(password, user.password_hash)
        if (!ok) {
          recordLoginFailure(email, ip)
          return null
        }
        clearLoginFailures(email)

        return { id: user.id, email: user.email, name: user.full_name ?? undefined }
      },
    }),
  ],
  callbacks: {
    ...authConfig.callbacks,
    async jwt({ token, user }) {
      if (user?.id) {
        token.claims = await getClaimsForUser(user.id)
        token.claimsCheckedAt = Date.now()
        return token
      }

      // Revalida a cada 5 min: usuário desativado, rebaixado ou tenant suspenso/cancelado
      // perde o acesso sem esperar o token expirar.
      const checkedAt = typeof token.claimsCheckedAt === 'number' ? token.claimsCheckedAt : 0
      if (Date.now() - checkedAt > 5 * 60 * 1000) {
        const previous = token.claims as DbClaims | undefined
        if (!previous?.sub) return null
        const fresh = await getClaimsForUser(previous.sub)
        const hadAccess = Boolean(previous.is_super_admin || previous.tenant_id)
        const hasAccess = Boolean(fresh.is_super_admin || fresh.tenant_id)
        if (hadAccess && !hasAccess) return null // desativado
        if (fresh.tenant_id && !fresh.is_super_admin) {
          const status = await withAdmin(async (tx) => {
            const res = await tx.execute(sql`select status from tenants where id = ${fresh.tenant_id}::uuid limit 1`)
            return (res.rows?.[0] as { status?: string } | undefined)?.status
          })
          if (status === 'suspended' || status === 'cancelled') return null
        }
        token.claims = fresh
        token.claimsCheckedAt = Date.now()
      }
      return token
    },
    async session({ session, token }) {
      if (token.claims) session.claims = token.claims as typeof session.claims
      return session
    },
  },
})
