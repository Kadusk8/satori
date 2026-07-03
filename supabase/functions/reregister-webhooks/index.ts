// Utilitário de operação — roda uma vez após a migration 026 (webhook_secret)
// pra re-registrar o webhook de todo tenant que já tinha uma instância
// Evolution Go configurada ANTES dessa mudança. Sem isso, o webhook antigo
// (sem `?ts=`) continua salvo na instância e passa a tomar 401.
//
// Não aparece no config.toml, então usa verify_jwt = true (padrão) — só
// pode ser chamada com o service role key, igual onboard-tenant:
//
//   curl -X POST "$SUPABASE_URL/functions/v1/reregister-webhooks" \
//     -H "Authorization: Bearer $SUPABASE_SERVICE_ROLE_KEY" \
//     -H "apikey: $SUPABASE_SERVICE_ROLE_KEY"
//
// Idempotente — pode rodar mais de uma vez sem efeito colateral.

import { createAdminClient } from '../_shared/supabase-admin.ts'
import { setEvolutionWebhook } from '../_shared/evolution-client.ts'

interface TenantRow {
  id: string
  name: string
  evolution_api_url: string | null
  evolution_api_key: string | null
  webhook_secret: string
}

interface ResultRow {
  tenantId: string
  name: string
  status: 'ok' | 'skipped' | 'error'
  detail?: string
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, {
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
      },
    })
  }

  if (req.method !== 'POST') {
    return Response.json({ error: 'Método não permitido' }, { status: 405 })
  }

  const supabase = createAdminClient()
  const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? ''
  const encryptionKey = Deno.env.get('ENCRYPTION_KEY') ?? null

  const { data: tenants, error } = await supabase
    .from('tenants')
    .select('id, name, evolution_api_url, evolution_api_key, webhook_secret')
    .not('evolution_api_url', 'is', null)

  if (error) {
    return Response.json({ error: error.message }, { status: 500 })
  }

  const results: ResultRow[] = []

  for (const tenant of (tenants ?? []) as TenantRow[]) {
    if (!tenant.evolution_api_url || !tenant.evolution_api_key) {
      results.push({ tenantId: tenant.id, name: tenant.name, status: 'skipped', detail: 'Evolution não configurada' })
      continue
    }

    try {
      let apiKey = tenant.evolution_api_key
      try {
        const { data: decrypted, error: keyError } = await supabase.rpc('get_decrypted_evolution_key', {
          p_tenant_id: tenant.id,
          p_enc_key: encryptionKey,
        })
        if (!keyError && decrypted) apiKey = decrypted as string
      } catch {
        // chave em texto plano (sem criptografia) — usa valor direto
      }

      const webhookUrl = `${supabaseUrl}/functions/v1/webhook-evolution?ts=${tenant.webhook_secret}`
      await setEvolutionWebhook({ url: tenant.evolution_api_url, apiKey, webhookUrl })

      results.push({ tenantId: tenant.id, name: tenant.name, status: 'ok' })
    } catch (err) {
      const detail = err instanceof Error ? err.message : 'erro desconhecido'
      console.error(`[reregister-webhooks] falhou pra tenant ${tenant.id}:`, detail)
      results.push({ tenantId: tenant.id, name: tenant.name, status: 'error', detail })
    }
  }

  return Response.json({
    total: results.length,
    ok: results.filter((r) => r.status === 'ok').length,
    skipped: results.filter((r) => r.status === 'skipped').length,
    failed: results.filter((r) => r.status === 'error').length,
    results,
  })
})
