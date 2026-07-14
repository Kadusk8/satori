import { sql, type SQL } from 'drizzle-orm'

// evolution_api_key/openai_api_key/gemini_api_key/ai_agents.llm_api_key/
// tenants.meta_access_token são colunas TEXT que o schema espera
// criptografadas (pgp_sym_encrypt via encrypt_evolution_key/encrypt_llm_key/
// encrypt_meta_token — get_decrypted_evolution_key/get_tenant_llm_keys/
// get_agent_llm_key/get_decrypted_meta_token do lado do services/backend
// assumem esse formato). Sem ENCRYPTION_KEY configurada, grava em texto puro
// mesmo (mesmo fallback das funções SQL).
const ENCRYPTION_KEY = process.env.ENCRYPTION_KEY ?? null

export function encryptedColumn(
  raw: string | null | undefined,
  fn: 'encrypt_evolution_key' | 'encrypt_llm_key' | 'encrypt_meta_token'
): SQL | string | null {
  if (!raw) return null
  if (!ENCRYPTION_KEY) return raw
  if (fn === 'encrypt_evolution_key') return sql`encrypt_evolution_key(${raw}, ${ENCRYPTION_KEY})`
  if (fn === 'encrypt_llm_key') return sql`encrypt_llm_key(${raw}, ${ENCRYPTION_KEY})`
  return sql`encrypt_meta_token(${raw}, ${ENCRYPTION_KEY})`
}
