// Middleware passthrough — sem lógica de autenticação aqui.
//
// Por que: o harness que o Next.js injeta em todo middleware de Edge Runtime
// referencia `__dirname`, que não existe no isolamento V8 real da Vercel em
// produção → ReferenceError em toda rota (não reproduz local, só no ambiente
// de produção de verdade). `runtime: 'nodejs'` abaixo roda o middleware sob
// Node.js de verdade, sem passar pelo harness de Edge — resolve por completo.
//
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
  runtime: 'nodejs',
  // Exclui arquivos estáticos do Next.js e assets — tudo mais passa.
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
}
