// Meta Conversions API Client (WORKSTREAM C)
// Envia eventos de conversão ao Meta quando o tenant tem meta_capi_enabled=true
// e credenciais válidas configuradas. GATED por tenant: cada empresa liga/desliga
// e usa suas próprias credenciais (meta_dataset_id + meta_access_token,
// criptografado) — configurável em /admin/tenants/[id].

import { pool } from '../db/index.js'
import { getDecryptedMetaToken } from '../db/index.js'

const ENCRYPTION_KEY = process.env.ENCRYPTION_KEY ?? null
const GRAPH_API_VERSION = 'v21.0'

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
    const tenantRes = await pool.query<{
      meta_capi_enabled: boolean
      meta_dataset_id: string | null
    }>(
      `select meta_capi_enabled, meta_dataset_id from tenants where id = $1`,
      [tenantId]
    )

    const tenant = tenantRes.rows[0]
    if (!tenant?.meta_capi_enabled) {
      // GATED: tenant não ativou o envio — no-op.
      return
    }

    if (!tenant.meta_dataset_id) {
      console.warn(`[meta-capi] Tenant ${tenantId} tem meta_capi_enabled=true mas sem meta_dataset_id`)
      return
    }

    const accessToken = await getDecryptedMetaToken(tenantId, ENCRYPTION_KEY)
    if (!accessToken) {
      console.warn(`[meta-capi] Tenant ${tenantId} tem meta_capi_enabled=true mas sem access token legível`)
      return
    }

    const eventTime = Math.floor(Date.now() / 1000)
    const customData: Record<string, unknown> = {}
    if (value !== undefined) customData.value = value
    if (currency) customData.currency = currency

    // Token via header, não query string — evita que ele fique em logs de proxy/CDN,
    // ferramentas de rede ou em qualquer lugar que capture a URL da requisição.
    const url = `https://graph.facebook.com/${GRAPH_API_VERSION}/${tenant.meta_dataset_id}/events`
    const body = {
      data: [
        {
          event_name: eventName,
          event_time: eventTime,
          action_source: 'business_messaging',
          messaging_channel: 'whatsapp',
          user_data: {
            ctwa_clid: ctwaClid,
          },
          ...(Object.keys(customData).length > 0 ? { custom_data: customData } : {}),
        },
      ],
    }

    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify(body),
    })

    const resBody = await res.json().catch(() => null)

    if (!res.ok) {
      console.error(`[meta-capi] Falha ao enviar evento "${eventName}" (tenant ${tenantId}): ${res.status} ${JSON.stringify(resBody)}`)
      await pool.query(
        `insert into ai_error_logs (tenant_id, provider, error_type, message)
         values ($1, $2, $3, $4)`,
        [tenantId, 'meta-capi', 'other', `Falha ao enviar "${eventName}": HTTP ${res.status} — ${JSON.stringify(resBody).slice(0, 500)}`]
      ).catch((logErr) => console.error('[meta-capi] Erro ao log falha:', logErr))
      return
    }

    console.log(`[meta-capi] Evento "${eventName}" enviado (tenant ${tenantId}, ctwa_clid ${ctwaClid.slice(0, 10)}...)`, resBody)
  } catch (err) {
    console.error('[meta-capi] Erro ao enviar evento:', err)
    // Não rethrow — uma falha no reporte de conversão não pode quebrar o
    // fluxo de agendamento/atendimento que a disparou.
  }
}
