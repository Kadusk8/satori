// Config do NextAuth v5 (substitui o Supabase Auth). Credentials provider +
// sessão JWT (stateless, sem adapter de banco). Os claims de RLS são montados
// no callback jwt via get_session_claims() e expostos na sessão.
//
// ADITIVO: este arquivo ainda não é importado por nenhuma página em produção.
// A troca dos fluxos (login/layouts/middleware) é o cutover coordenado da
// migração, travado no provisionamento do Neon (Fase 0).

import NextAuth from 'next-auth'
import Credentials from 'next-auth/providers/credentials'
import { sql } from 'drizzle-orm'
import { authConfig } from './auth.config'
import { withAdmin } from '@/lib/db'
import { authUsers } from '@/lib/db/schema'
import { verifyPassword } from '@/lib/auth/password'
import { getClaimsForUser } from '@/lib/auth/claims'

export const { handlers, auth, signIn, signOut } = NextAuth({
  ...authConfig,
  providers: [
    Credentials({
      credentials: {
        email: { label: 'Email', type: 'email' },
        password: { label: 'Senha', type: 'password' },
      },
      authorize: async (credentials) => {
        const email = String(credentials?.email ?? '').trim().toLowerCase()
        const password = String(credentials?.password ?? '')
        if (!email || !password) return null

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

        if (!user?.password_hash) return null
        const ok = await verifyPassword(password, user.password_hash)
        if (!ok) return null

        return { id: user.id, email: user.email, name: user.full_name ?? undefined }
      },
    }),
  ],
  callbacks: {
    ...authConfig.callbacks,
    async jwt({ token, user }) {
      // Só recalcula os claims no login (quando `user` está presente).
      if (user?.id) {
        token.claims = await getClaimsForUser(user.id)
      }
      return token
    },
    async session({ session, token }) {
      if (token.claims) session.claims = token.claims as typeof session.claims
      return session
    },
  },
})
