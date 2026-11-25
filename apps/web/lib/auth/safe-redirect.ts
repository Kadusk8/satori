// Valida o destino pós-login (?callbackUrl=). Só aceita path relativo da própria
// origem — qualquer coisa que o browser possa interpretar como outro host
// (`//evil.com`, `/\evil.com`, `https://...`) vira null, pra não virar open redirect.

const BASE = 'http://satori.invalid'

export function safeCallbackPath(raw: unknown): string | null {
  if (typeof raw !== 'string' || raw.length === 0 || raw.length > 512) return null
  if (!raw.startsWith('/') || raw.startsWith('//') || raw.includes('\\')) return null
  // Caracteres de controle podem ser removidos pelo browser e mudar o significado da URL.
  if (/[\u0000-\u001f\u007f]/.test(raw)) return null

  let url: URL
  try {
    url = new URL(raw, BASE)
  } catch {
    return null
  }
  if (url.origin !== BASE) return null
  // Evita loop de volta pro login/logout.
  if (url.pathname === '/login' || url.pathname.startsWith('/api/auth')) return null

  return url.pathname + url.search + url.hash
}
