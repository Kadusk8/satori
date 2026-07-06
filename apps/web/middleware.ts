// Middleware passthrough — sem lógica de autenticação aqui.
//
// Por que existe, mesmo sem fazer nada: sem NENHUM middleware.ts, o
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

export function middleware(_request: NextRequest) {
  return NextResponse.next()
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
}
