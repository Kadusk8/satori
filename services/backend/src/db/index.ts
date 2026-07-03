// Conexão com o Postgres (Neon) — este serviço roda como backend confiável
// (equivalente ao service_role do Supabase), então conecta direto com
// BYPASSRLS, sem a camada withClaims que o app Next.js usa.

import { Client, Pool, types } from 'pg'
import { drizzle } from 'drizzle-orm/node-postgres'
import { sql } from 'drizzle-orm'
import * as schema from './schema.js'

const connectionString = process.env.DATABASE_URL
if (!connectionString) {
  throw new Error('DATABASE_URL não configurada')
}

// `pg` por padrão converte a coluna `date` (OID 1082) num JS Date à meia-noite
// UTC — mas todo o código deste serviço (schedule-reminder, tools de agenda)
// trata `date` como string YYYY-MM-DD, igual ao formato que o PostgREST
// (supabase-js) sempre devolvia no código original. Sem isso, comparações
// de data quebram silenciosamente (new Date(`${date}T...`) vira Invalid Date).
types.setTypeParser(1082, (val) => val)

// Garante BYPASSRLS pra toda query desta conexão — o usuário do pool já é
// membro de service_role (ver neon/schema.sql), só falta assumir o role.
// Feito dentro do próprio connect() (não via evento 'connect' do Pool, que
// não é aguardado — o client entraria disponível no pool antes do SET ROLE
// terminar, deixando a 1ª query de cada conexão nova correr com o role errado).
//
// IMPORTANTE: pg-pool chama client.connect(callback) no estilo callback, não
// Promise (ver node_modules/pg-pool/index.js) — uma sobrecarga que só
// implementa a forma "sem argumento" nunca invoca esse callback e trava o
// pool pra sempre no primeiro checkout. Por isso suportamos os dois estilos.
class ServiceRoleClient extends Client {
  // @ts-expect-error — a assinatura real do pg-pool (callback OU promise) não
  // bate 1:1 com os tipos declarados de Client.connect; ambas as formas abaixo
  // são suportadas em runtime, que é o que o pg-pool efetivamente usa.
  connect(callback?: (err?: Error) => void): void | Promise<void> {
    if (callback) {
      super.connect((err?: Error) => {
        if (err) return callback(err)
        super
          .query('set role service_role')
          .then(() => callback())
          .catch((setRoleErr) => callback(setRoleErr))
      })
      return
    }
    return (async () => {
      await super.connect()
      await super.query('set role service_role')
    })()
  }
}

export const pool = new Pool({
  connectionString,
  ssl: connectionString.includes('sslmode=require') ? { rejectUnauthorized: false } : undefined,
  max: 10,
  Client: ServiceRoleClient as unknown as typeof Client,
})

export const db = drizzle(pool, { schema })

export async function getTenantLlmKeys(
  tenantId: string,
  encKey: string | null
): Promise<{
  anthropic_api_key: string | null
  openai_api_key: string | null
  gemini_api_key: string | null
  elevenlabs_api_key: string | null
} | null> {
  const result = await pool.query(
    'select * from get_tenant_llm_keys($1, $2)',
    [tenantId, encKey]
  )
  return result.rows[0] ?? null
}

export async function getDecryptedEvolutionKey(
  tenantId: string,
  encKey: string | null
): Promise<string | null> {
  const result = await pool.query(
    'select get_decrypted_evolution_key($1, $2) as key',
    [tenantId, encKey]
  )
  return result.rows[0]?.key ?? null
}

export { sql }
