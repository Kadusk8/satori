// Zera messages_used_month de todos os tenants ativos no início de cada mês —
// porta do job pg_cron 'reset-monthly-message-counts' (comentado em
// neon/schema.sql porque pg_net/pg_cron não são portáveis pro Neon). Sem
// isso, um tenant que bate max_messages_month fica bloqueado pra sempre.

import { pool } from '../db/index.js'

export async function runResetMonthlyMessageCounts(): Promise<{ reset: number }> {
  const before = await pool.query<{ count: string }>(
    `select count(*)::text as count from tenants where active = true`
  )
  await pool.query('select reset_monthly_message_counts()')
  const reset = Number(before.rows[0]?.count ?? 0)
  console.log(`[reset-monthly-counts] messages_used_month zerado para ${reset} tenant(s) ativo(s)`)
  return { reset }
}
