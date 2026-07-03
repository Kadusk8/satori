// Camada de conexão com o Postgres (Neon em produção, Postgres local em dev),
// substituindo o client @supabase/supabase-js. Usa node-postgres (`pg`), que
// fala tanto com o endpoint pooled do Neon quanto com um Postgres local — o
// que mantém tudo rodável e testável fora de serverless.
//
// Duas portas de entrada sancionadas — NÃO exporte um `db` cru: todo acesso
// passa por `withClaims` (RLS ligada) ou `withAdmin` (BYPASSRLS), pra não
// vazar dado entre tenants por esquecer o contexto.
//
// Modelo (igual ao que o Supabase faz por baixo dos panos):
//   - O usuário de conexão (DATABASE_URL) é membro dos roles `authenticated`
//     e `service_role`, mas NÃO tem o atributo BYPASSRLS por si só.
//   - withClaims: `SET LOCAL ROLE authenticated` + grava os claims na GUC
//     `request.jwt.claims` → as policies RLS (auth.jwt()/auth.role()) valem.
//     Super admin funciona porque get_session_claims devolve role='service_role'
//     nos claims, satisfazendo as policies service_role_*.
//   - withAdmin: `SET LOCAL ROLE service_role` (BYPASSRLS) → acesso irrestrito,
//     só pra código de servidor confiável (páginas admin, serviço backend).
//
// Requer no banco: GRANT authenticated, service_role TO <db_user>;

import { Pool } from 'pg'
import { drizzle } from 'drizzle-orm/node-postgres'
import { sql } from 'drizzle-orm'
import * as schema from './schema'

const connectionString = process.env.DATABASE_URL
if (!connectionString) {
  console.warn('[db] DATABASE_URL não configurada — chamadas ao banco vão falhar.')
}

// Pool global reaproveitado entre invocações (evita estourar conexões).
const globalForPool = globalThis as unknown as { __zap_pool?: Pool }
const pool =
  globalForPool.__zap_pool ??
  new Pool({
    connectionString,
    ssl: connectionString?.includes('sslmode=require') ? { rejectUnauthorized: false } : undefined,
    max: 10,
  })
if (process.env.NODE_ENV !== 'production') globalForPool.__zap_pool = pool

const rawDb = drizzle(pool, { schema })

export type DbClaims = {
  sub: string
  role?: string
  tenant_id?: string | null
  user_role?: string | null
  is_super_admin?: boolean
}

type Tx = Parameters<Parameters<typeof rawDb.transaction>[0]>[0]

/**
 * Executa `fn` numa transação com RLS ativa, no contexto do usuário informado.
 * Os claims são exatamente o JSON que `get_session_claims(userId)` devolve.
 */
export async function withClaims<T>(claims: DbClaims, fn: (tx: Tx) => Promise<T>): Promise<T> {
  return rawDb.transaction(async (tx) => {
    await tx.execute(sql`set local role authenticated`)
    await tx.execute(
      sql`select set_config('request.jwt.claims', ${JSON.stringify(claims)}, true)`
    )
    return fn(tx)
  })
}

/**
 * Executa `fn` numa transação com BYPASSRLS (role service_role). Use apenas em
 * código de servidor confiável — nunca com input direto de usuário sem checar
 * o tenant na mão.
 */
export async function withAdmin<T>(fn: (tx: Tx) => Promise<T>): Promise<T> {
  return rawDb.transaction(async (tx) => {
    await tx.execute(sql`set local role service_role`)
    return fn(tx)
  })
}

export { pool, schema }
