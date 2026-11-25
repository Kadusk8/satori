import type { NextAuthConfig } from 'next-auth'

// Config edge-safe do NextAuth — compartilhada entre o middleware (que só
// verifica o JWT, sem tocar em banco/bcrypt) e o auth.ts completo (Node).
// NÃO importe pg/bcrypt aqui.

// Sem '/register': criação de conta é exclusiva do super admin (onboarding
// de tenant) ou de convite de operador — nunca self-service.
const PUBLIC_PATHS = ['/', '/login']

export const authConfig = {
  pages: { signIn: '/login' },
  trustHost: true,
  // Sessão deslizante: expira após 7 dias SEM uso; cada uso renova (updateAge 1h).
  // Antes era 12h fixas — no app instalado o operador caía no login toda manhã ao
  // tocar no push. A segurança não depende da duração: os claims são revalidados
  // a cada 5 min no callback jwt (auth.ts), então desativado/suspenso perde o acesso.
  session: { strategy: 'jwt', maxAge: 7 * 24 * 60 * 60, updateAge: 60 * 60 },
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
