import { timingSafeEqual } from 'node:crypto'

// Comparação em tempo constante do header Authorization com o BACKEND_TOKEN.
// O token é obrigatório (index.ts aborta a inicialização sem ele).
export function isValidBackendAuth(header: string | undefined): boolean {
  const token = process.env.BACKEND_TOKEN
  if (!token || !header) return false
  const expected = Buffer.from(`Bearer ${token}`)
  const given = Buffer.from(header)
  return given.length === expected.length && timingSafeEqual(given, expected)
}
