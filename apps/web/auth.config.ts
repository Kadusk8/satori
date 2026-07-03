import type { NextAuthConfig } from 'next-auth'

// Config edge-safe do NextAuth — compartilhada entre o middleware (que só
// verifica o JWT, sem tocar em banco/bcrypt) e o auth.ts completo (Node).
// NÃO importe pg/bcrypt aqui.

const PUBLIC_PATHS = ['/', '/login', '/register']

export const authConfig = {
  pages: { signIn: '/login' },
  trustHost: true,
  session: { strategy: 'jwt' },
  providers: [], // preenchido em auth.ts (Credentials)
  callbacks: {
    authorized({ auth, request: { nextUrl } }) {
      const { pathname } = nextUrl
      const isPublic =
        PUBLIC_PATHS.includes(pathname) ||
        pathname.startsWith('/auth/') ||
        pathname.startsWith('/api/auth') ||
        pathname.startsWith('/api/webhook')
      if (isPublic) return true
      return !!auth?.user // se não logado, redireciona pra pages.signIn
    },
  },
} satisfies NextAuthConfig
