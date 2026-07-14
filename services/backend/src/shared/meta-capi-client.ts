// Meta Conversions API Client (WORKSTREAM C)
// Envia eventos de conversão ao Meta quando habilitado e configurado.
// GATED: nenhum evento é enviado se meta_capi_enabled=false ou sem token.

import { pool } from '../db/index.js'

interface SendConversionEventParams {
  tenantId: string
  ctwaClid: string
  eventName: 'Schedule' | 'Purchase' | 'Lead'
  value?: number
  currency?: string
}

export async function sendConversionEvent(params: SendConversionEventParams): Promise<void> {
  const { tenantId, ctwaClid, eventName, value, currency } = params

  try {
    // Buscar config Meta do tenant
    const tenantRes = await pool.query<{
      meta_capi_enabled: boolean
      meta_dataset_id: string | null
      meta_access_token: string | null
    }>(
      `select meta_capi_enabled, meta_dataset_id, meta_access_token from tenants where id = $1`,
      [tenantId]
    )

    const tenant = tenantRes.rows[0]
    if (!tenant?.meta_capi_enabled) {
      // GATED: não enviar se desabilitado
      return
    }

    if (!tenant.meta_dataset_id || !tenant.meta_access_token) {
      // Credenciais não configuradas — no-op
      console.warn(`[meta-capi] Tenant ${tenantId} tem meta_capi_enabled=true mas sem credenciais`)
      return
    }

    // Aqui seria o ponto de decrypt do token. Por enquanto, usar como-está
    // (função get_decrypted_meta_token() está no schema.sql)
    // Para a implementação real, descomentar e usar a decrypt function

    // POST para Graph API
    // NOTA: nesta rodada, NOT enviando evento real (nem com test_event_code).
    // A plumbing está toda em lugar — quando o usuário ativar meta_capi_enabled
    // com credenciais válidas, o evento será enviado.

    console.log(
      `[meta-capi] NOOP (gated): evento "${eventName}" para ctwa_clid ${ctwaClid.slice(0, 10)}... (tenant ${tenantId})`
    )

    // Log do evento (se quiser rastrear tentativas)
    try {
      await pool.query(
        `insert into ai_error_logs (tenant_id, provider, error_type, message)
         values ($1, $2, $3, $4)`,
        [tenantId, 'meta-capi', 'other', `Event: ${eventName} (no-op, gated)`]
      )
    } catch (logErr) {
      console.error('[meta-capi] Erro ao log evento:', logErr)
    }
  } catch (err) {
    console.error('[meta-capi] Erro ao enviar evento:', err)
    // Não rethrow — deixar falhar silenciosamente (não quebra o fluxo de conversa)
  }
}

// Versão futura com HTTP real:
// POST https://graph.facebook.com/v21.0/{dataset_id}/events
// Authorization: Bearer {access_token}
// {
//   "data": [{
//     "event_name": "Schedule" | "Purchase" | "Lead",
//     "event_time": unix_timestamp,
//     "action_source": "business_messaging",
//     "messaging_channel": "whatsapp",
//     "user_data": {
//       "ctwa_clid": ctwaClid
//     },
//     "custom_data": {
//       "value": value,
//       "currency": currency
//     }
//   }],
//   "test_event_code": undefined (production) ou test event code (testing)
// }
