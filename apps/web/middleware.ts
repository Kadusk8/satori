import NextAuth from 'next-auth'
import { authConfig } from './auth.config'

// Gate de rota edge-safe: usa só o authConfig (verifica o JWT, sem banco).
// A checagem fina de papel (super admin vs tenant) fica nos layouts.
export default NextAuth(authConfig).auth

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)'],
}
