// Middleware passthrough — sem lógica de autenticação aqui.
//
// Por que: next-auth v5 + jose + ua-parser-js usam __dirname nos seus
// bundles internos, que não existe no Edge Runtime da Vercel.
// A proteção de rotas já é feita nos layouts de server component:
//   - app/(dashboard)/layout.tsx → getSessionClaims() + redirect('/login')
//   - app/(admin)/layout.tsx     → idem para área admin
//
// O middleware apenas garante que rotas de _next/static, imagens e
// favicon passam sem processamento desnecessário.

import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

export function middleware(_request: NextRequest) {
  return NextResponse.next()
}

export const config = {
  // Exclui arquivos estáticos do Next.js e assets — tudo mais passa.
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
}
