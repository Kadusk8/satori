// Wrapper da Evolution API v2 — configuração por tenant (sem URL global)
// Cada tenant tem sua própria URL e API key, armazenadas na tabela tenants.

import { createAdminClient } from './supabase-admin.ts'

// ── Tipos ──────────────────────────────────────────────────────────────────

export interface EvolutionClient {
  url: string
  apiKey: string
  instanceName: string
  sendText(number: string, text: string): Promise<string | null>
  sendMedia(number: string, mediaUrl: string, caption?: string): Promise<string | null>
  sendAudio(number: string, audioBase64: string): Promise<string | null>
  sendPresence(number: string, presence: 'composing' | 'recording' | 'paused', delayMs?: number): Promise<void>
  checkConnection(): Promise<{ state: string; connected: boolean }>
  createInstance(params: CreateInstanceParams): Promise<{ instanceName: string; status: string }>
  setWebhook(webhookUrl: string): Promise<void>
}

interface CreateInstanceParams {
  connectionType: 'baileys' | 'cloud_api'
  cloudApiToken?: string
  cloudApiBusinessId?: string
}

// ── Cliente por tenant ─────────────────────────────────────────────────────

/**
 * Retorna um cliente Evolution API configurado com as credenciais do tenant.
 * URL, API key e nome da instância são lidos diretamente da tabela tenants.
 */
export async function getEvolutionClient(tenantId: string, encryptionKey?: string | null): Promise<EvolutionClient> {
  const supabase = createAdminClient()

  const { data: tenant, error } = await supabase
    .from('tenants')
    .select('evolution_api_url, evolution_instance_name, evolution_api_key')
    .eq('id', tenantId)
    .single()

  if (error || !tenant) {
    throw new Error(`[getEvolutionClient] Tenant ${tenantId} não encontrado`)
  }
  if (!tenant.evolution_api_url) {
    throw new Error(`[getEvolutionClient] Evolution API não configurada para tenant ${tenantId}`)
  }
  if (!tenant.evolution_api_key) {
    throw new Error(`[getEvolutionClient] Evolution API key não configurada para tenant ${tenantId}`)
  }

  // Descriptografa via RPC passando a chave de criptografia.
  // Se falhar ou não houver chave, usa o valor direto (compatibilidade texto plano).
  let apiKey: string = tenant.evolution_api_key as string
  try {
    const { data: decrypted, error: keyError } = await supabase
      .rpc('get_decrypted_evolution_key', { p_tenant_id: tenantId, p_enc_key: encryptionKey ?? null })
    if (!keyError && decrypted) {
      apiKey = decrypted as string
    }
  } catch {
    // chave em texto plano ou sem criptografia — usa valor direto
  }

  const url = tenant.evolution_api_url.replace(/\/$/, '')
  const instanceName = tenant.evolution_instance_name ?? ''

  function headers() {
    return {
      'Content-Type': 'application/json',
      apikey: apiKey,
    }
  }

  return {
    url,
    apiKey,
    instanceName,

    async sendText(number: string, text: string): Promise<string | null> {
      const res = await fetch(`${url}/message/sendText/${instanceName}`, {
        method: 'POST',
        headers: headers(),
        body: JSON.stringify({ number, text }),
      })
      if (!res.ok) throw new Error(`Evolution sendText: ${await res.text()}`)
      const data = await res.json()
      return data?.key?.id ?? null
    },

    async sendMedia(number: string, mediaUrl: string, caption?: string): Promise<string | null> {
      const res = await fetch(`${url}/message/sendMedia/${instanceName}`, {
        method: 'POST',
        headers: headers(),
        body: JSON.stringify({
          number,
          mediatype: 'image',
          media: mediaUrl,
          caption: caption ?? '',
        }),
      })
      if (!res.ok) throw new Error(`Evolution sendMedia: ${await res.text()}`)
      const data = await res.json()
      return data?.key?.id ?? null
    },

    async sendAudio(number: string, audioBase64: string): Promise<string | null> {
      // Usa base64 puro. A API Evolution usa um validador que falha se tiver o prefixo data:audio/mpeg;base64,
      const res = await fetch(`${url}/message/sendWhatsAppAudio/${instanceName}`, {
        method: 'POST',
        headers: headers(),
        body: JSON.stringify({
          number,
          audio: audioBase64,
        }),
      })
      if (!res.ok) throw new Error(`Evolution sendAudio: ${await res.text()}`)
      const data = await res.json()
      return data?.key?.id ?? null
    },

    async sendPresence(number: string, presence: 'composing' | 'recording' | 'paused', delayMs = 3000): Promise<void> {
      try {
        await fetch(`${url}/chat/sendPresence/${instanceName}`, {
          method: 'POST',
          headers: headers(),
          body: JSON.stringify({ number, presence, delay: delayMs }),
        })
      } catch {
        // Não crítico — ignora falha de presença
      }
    },

    async checkConnection(): Promise<{ state: string; connected: boolean }> {
      try {
        const res = await fetch(`${url}/instance/connectionState/${instanceName}`, {
          headers: headers(),
        })
        if (!res.ok) return { state: 'not_found', connected: false }
        const data = await res.json()
        return { state: data.state ?? 'unknown', connected: data.state === 'open' }
      } catch {
        return { state: 'error', connected: false }
      }
    },

    async createInstance(params: CreateInstanceParams): Promise<{ instanceName: string; status: string }> {
      const body =
        params.connectionType === 'cloud_api'
          ? {
              instanceName,
              integration: 'WHATSAPP-BUSINESS',
              businessId: params.cloudApiBusinessId,
              accessToken: params.cloudApiToken,
            }
          : {
              instanceName,
              qrcode: true,
              integration: 'WHATSAPP-BAILEYS',
            }

      const res = await fetch(`${url}/instance/create`, {
        method: 'POST',
        headers: headers(),
        body: JSON.stringify(body),
      })
      if (!res.ok) throw new Error(`Evolution createInstance: ${await res.text()}`)
      return res.json()
    },

    async setWebhook(webhookUrl: string): Promise<void> {
      const res = await fetch(`${url}/webhook/set/${instanceName}`, {
        method: 'POST',
        headers: headers(),
        body: JSON.stringify({
          url: webhookUrl,
          webhook_by_events: true,
          events: ['MESSAGES_UPSERT', 'CONNECTION_UPDATE', 'CONTACTS_UPSERT'],
        }),
      })
      if (!res.ok) throw new Error(`Evolution setWebhook: ${await res.text()}`)
    },
  }
}

// ── Funções standalone (credenciais explícitas) ────────────────────────────
// Usadas no onboard-tenant onde URL e key já estão em memória,
// antes de serem persistidas no banco.

/**
 * Cria instância na Evolution API com credenciais explícitas.
 */
export async function createEvolutionInstance(params: {
  url: string
  apiKey: string
  instanceName: string
  connectionType: 'baileys' | 'cloud_api'
  cloudApiToken?: string
  cloudApiBusinessId?: string
}): Promise<{ instanceName: string; status: string; qrcode?: string }> {
  const base = params.url.replace(/\/$/, '')
  const body =
    params.connectionType === 'cloud_api'
      ? {
          instanceName: params.instanceName,
          integration: 'WHATSAPP-BUSINESS',
          businessId: params.cloudApiBusinessId,
          accessToken: params.cloudApiToken,
        }
      : {
          instanceName: params.instanceName,
          qrcode: true,
          integration: 'WHATSAPP-BAILEYS',
        }

  const res = await fetch(`${base}/instance/create`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', apikey: params.apiKey },
    body: JSON.stringify(body),
  })
  if (!res.ok) throw new Error(`Evolution createInstance: ${await res.text()}`)
  return res.json()
}

/**
 * Configura webhook na Evolution API com credenciais explícitas.
 */
export async function setEvolutionWebhook(params: {
  url: string
  apiKey: string
  instanceName: string
  webhookUrl: string
}): Promise<void> {
  const base = params.url.replace(/\/$/, '')
  const res = await fetch(`${base}/webhook/set/${params.instanceName}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', apikey: params.apiKey },
    body: JSON.stringify({
      webhook: {
        enabled: true,
        url: params.webhookUrl,
        webhookByEvents: false,
        webhookBase64: false,
        events: ['MESSAGES_UPSERT', 'CONNECTION_UPDATE', 'CONTACTS_UPSERT'],
      },
    }),
  })
  if (!res.ok) throw new Error(`Evolution setWebhook: ${await res.text()}`)
}

/**
 * Verifica o estado de conexão de uma instância com credenciais explícitas.
 * Usado no onboard-tenant para checar se instância já existe antes de criar.
 */
export async function checkEvolutionConnection(params: {
  url: string
  apiKey: string
  instanceName: string
}): Promise<{ state: string; connected: boolean }> {
  try {
    const base = params.url.replace(/\/$/, '')
    const res = await fetch(
      `${base}/instance/connectionState/${params.instanceName}`,
      { headers: { apikey: params.apiKey } }
    )
    if (!res.ok) return { state: 'not_found', connected: false }
    const data = await res.json()
    return { state: data.state ?? 'unknown', connected: data.state === 'open' }
  } catch {
    return { state: 'error', connected: false }
  }
}
