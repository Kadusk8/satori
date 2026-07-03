import crypto from 'node:crypto'

// Tokens stateless assinados (HMAC-SHA256) pra reset de senha e convite de
// operador — substituem o resetPasswordForEmail / inviteUserByEmail do
// Supabase, sem precisar de tabela de tokens. Assinados com AUTH_SECRET.

export type TokenPurpose = 'reset' | 'invite'

interface TokenPayload {
  email: string
  purpose: TokenPurpose
  exp: number // epoch segundos
}

function secret(): string {
  const s = process.env.AUTH_SECRET
  if (!s) throw new Error('AUTH_SECRET não configurada')
  return s
}

function b64url(input: Buffer | string): string {
  return Buffer.from(input).toString('base64url')
}

function sign(data: string): string {
  return crypto.createHmac('sha256', secret()).update(data).digest('base64url')
}

/** Gera um token assinado válido por `ttlHours` (padrão 24h). */
export function createToken(email: string, purpose: TokenPurpose, ttlHours = 24): string {
  const payload: TokenPayload = {
    email: email.trim().toLowerCase(),
    purpose,
    exp: Math.floor(Date.now() / 1000) + ttlHours * 3600,
  }
  const body = b64url(JSON.stringify(payload))
  return `${body}.${sign(body)}`
}

/** Valida assinatura + expiração + propósito. Retorna o email ou null. */
export function verifyToken(token: string, purpose: TokenPurpose): string | null {
  const parts = token.split('.')
  if (parts.length !== 2) return null
  const [body, providedSig] = parts

  const expectedSig = sign(body)
  // Comparação em tempo constante
  const a = Buffer.from(providedSig)
  const b = Buffer.from(expectedSig)
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null

  try {
    const payload = JSON.parse(Buffer.from(body, 'base64url').toString('utf-8')) as TokenPayload
    if (payload.purpose !== purpose) return null
    if (payload.exp < Math.floor(Date.now() / 1000)) return null
    return payload.email
  } catch {
    return null
  }
}
