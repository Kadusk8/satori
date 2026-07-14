// Monitor de qualidade da IA (WORKSTREAM B)
// Roda 1x/dia, agrega flags das últimas 24h por tenant+tipo.
// Se um tipo passa de ≥3, grava um ai_error_logs pra alertar o dashboard do admin.
// Porta de supabase/functions/monitor-ai-quality/index.ts (antes disparado por pg_cron+pg_net).

import { pool } from '../db/index.js'

interface FlagAggregation {
  tenant_id: string
  flag_type: string
  count: number
}

export async function runMonitorAiQuality(): Promise<void> {
  try {
    // Agregar flags das últimas 24h por tenant+tipo
    const aggRes = await pool.query<FlagAggregation>(
      `select tenant_id, flag_type, count(*) as count
       from ai_quality_flags
       where created_at >= now() - interval '24 hours'
       group by tenant_id, flag_type`,
    )

    for (const row of aggRes.rows) {
      if (row.count >= 3) {
        // Limite ultrapassado — registrar um alerta em ai_error_logs
        const message = `[Quality Monitor 24h] Detectados ${row.count} eventos de tipo "${row.flag_type}"`
        try {
          await pool.query(
            `insert into ai_error_logs (tenant_id, provider, error_type, message)
             values ($1, $2, $3, $4)`,
            [row.tenant_id, 'quality-monitor', 'other', message]
          )
          console.log(
            `[monitor-ai-quality] Alerta criado para tenant ${row.tenant_id}: ${row.flag_type} (${row.count} eventos)`
          )
        } catch (logErr) {
          console.error('[monitor-ai-quality] Erro ao registrar alerta:', logErr)
        }
      }
    }

    console.log('[monitor-ai-quality] Ciclo completo — monitoramento diário concluído')
  } catch (err) {
    console.error('[monitor-ai-quality] Erro geral:', err)
    throw err
  }
}
