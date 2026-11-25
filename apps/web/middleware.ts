// Middleware quase-passthrough — só decide o que a raiz (/) mostra conforme
// o domínio. Nenhuma lógica de autenticação real aqui.
//
// Por que existe, mesmo fazendo pouco: sem NENHUM middleware.ts, o
// adaptador @vercel/next (rodado por `vercel build`/deploy) pula por
// completo a etapa de tracing/geração de serverless functions — confirmado
// empiricamente comparando `.vercel/output/functions/` com e sem este
// arquivo.
//
// A proteção de rotas real já é feita nos layouts de server component:
//   - app/(dashboard)/layout.tsx → getSessionClaims() + redirect('/login')
//   - app/(admin)/layout.tsx     → idem para área admin
import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

export function middleware(request: NextRequest) {
  // admin.satori.ia.br (painel do super admin) não tem landing page própria
  // — a raiz vai direto pro login, como já era o comportamento antigo.
  // satori.ia.br (domínio do cliente) mostra a landing page em app/page.tsx.
  if (request.nextUrl.pathname === '/' && request.nextUrl.hostname.startsWith('admin.')) {
    return NextResponse.redirect(new URL('/login', request.url))
  }

  // Repassa o path atual pros Server Components (layouts não têm acesso à URL),
  // usado pra montar ?callbackUrl= quando a sessão expira. Sobrescreve qualquer
  // x-pathname vindo do cliente; o valor ainda é validado em safeCallbackPath.
  const requestHeaders = new Headers(request.headers)
  requestHeaders.set('x-pathname', request.nextUrl.pathname + request.nextUrl.search)
  return NextResponse.next({ request: { headers: requestHeaders } })
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
}
