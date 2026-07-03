// Wrapper da Evolution Go — cada tenant tem seu próprio servidor externo,
// com uma instância já criada e conectada por ele mesmo (fora da nossa
// plataforma). Não criamos instância nem exibimos QR code — só operamos
// uma instância que já existe, usando o token dela (guardado em
// tenants.evolution_api_key) como header `apikey` em toda chamada.
//
// Confirmado contra a documentação oficial (docs/wiki do repo
// evolution-foundation/evolution-go) em 2026-07-03:
// - Endpoints não levam o nome da instância na URL — o servidor resolve
//   a instância a partir do próprio `apikey` (token da instância).
// - Não existe /webhook/set/{instance} separado: o webhook é configurado
//   junto com POST /instance/connect (campo webhookUrl).
// - /send/media usa `url` (não `media`) e `type` (não `mediatype`).
// - Toda resposta de sucesso vem como { message: "success", data: {...} }.
// - O ID da mensagem enviada vem em data.Info.ID (PascalCase, não key.id).
// - GET /instance/status retorna { data: { connected, loggedIn, name, myJid } }.
// - Áudio de saída só aceita `url` (http) ou `file` (multipart) em
//   /send/media — não aceita data: URI inline, por isso sendAudio usa
//   multipart/form-data com o binário decodificado.
// - subscribe: a documentação é inconsistente entre páginas (uma mostra
//   categorias maiúsculas tipo "MESSAGE", outra mostra "messages.upsert"
//   estilo Evolution API clássica) — por segurança, omitimos o filtro e
//   deixamos o servidor mandar tudo; o parser do nosso lado ignora o que
//   não reconhece.

import { createAdminClient } from './supabase-admin.ts'

export interface EvolutionClient {
  url: string
  apiKey: string
  instanceName: string
  sendText(number: string, text: string): Promise<string | null>
  sendMedia(number: string, mediaUrl: string, caption?: string, mediaType?: 'image' | 'video' | 'document'): Promise<string | null>
  sendAudio(number: string, audioBase64: string): Promise<string | null>
  sendPresence(number: string, presence: 'composing' | 'recording' | 'paused', delayMs?: number): Promise<void>
  checkConnection(): Promise<{ state: string; connected: boolean }>
  connectAndSetWebhook(webhookUrl: string): Promise<void>
}

/**
 * Retorna um cliente Evolution Go configurado com as credenciais do tenant.
 * URL e token da instância são lidos diretamente da tabela tenants.
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
    throw new Error(`[getEvolutionClient] Evolution Go não configurada para tenant ${tenantId}`)
  }
  if (!tenant.evolution_api_key) {
    throw new Error(`[getEvolutionClient] Token da instância não configurado para tenant ${tenantId}`)
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
      const res = await fetch(`${url}/send/text`, {
        method: 'POST',
        headers: headers(),
        body: JSON.stringify({ number, text }),
      })
      if (!res.ok) throw new Error(`Evolution Go send/text: ${await res.text()}`)
      const data = await res.json()
      return data?.data?.Info?.ID ?? null
    },

    async sendMedia(number: string, mediaUrl: string, caption?: string, mediaType: 'image' | 'video' | 'document' = 'image'): Promise<string | null> {
      const res = await fetch(`${url}/send/media`, {
        method: 'POST',
        headers: headers(),
        body: JSON.stringify({
          number,
          url: mediaUrl,
          type: mediaType,
          caption: caption ?? '',
        }),
      })
      if (!res.ok) throw new Error(`Evolution Go send/media: ${await res.text()}`)
      const data = await res.json()
      return data?.data?.Info?.ID ?? null
    },

    async sendAudio(number: string, audioBase64: string): Promise<string | null> {
      // /send/media só aceita `url` (http) ou `file` (multipart) — não aceita
      // data: URI inline — por isso mandamos o áudio decodificado como arquivo.
      const byteString = atob(audioBase64)
      const bytes = new Uint8Array(byteString.length)
      for (let i = 0; i < byteString.length; i++) bytes[i] = byteString.charCodeAt(i)

      const form = new FormData()
      form.append('number', number)
      form.append('type', 'audio')
      form.append('file', new Blob([bytes], { type: 'audio/ogg' }), 'audio.ogg')

      const res = await fetch(`${url}/send/media`, {
        method: 'POST',
        headers: { apikey: apiKey }, // sem Content-Type: o fetch define o boundary do multipart sozinho
        body: form,
      })
      if (!res.ok) throw new Error(`Evolution Go send/media (audio): ${await res.text()}`)
      const data = await res.json()
      return data?.data?.Info?.ID ?? null
    },

    async sendPresence(number: string, presence: 'composing' | 'recording' | 'paused', _delayMs = 3000): Promise<void> {
      // Não existe estado "recording" — grava-se com state:"composing" + isAudio:true
      const state = presence === 'recording' ? 'composing' : presence
      const isAudio = presence === 'recording'
      try {
        await fetch(`${url}/message/presence`, {
          method: 'POST',
          headers: headers(),
          body: JSON.stringify({ number, state, isAudio }),
        })
      } catch {
        // Não crítico — ignora falha de presença
      }
    },

    async checkConnection(): Promise<{ state: string; connected: boolean }> {
      try {
        const res = await fetch(`${url}/instance/status`, { headers: headers() })
        if (!res.ok) return { state: 'not_found', connected: false }
        const body = await res.json()
        const d = body?.data ?? {}
        const connected = d.connected === true && d.loggedIn === true
        const state = d.connected && d.loggedIn ? 'open' : d.connected ? 'connecting' : 'close'
        return { state, connected }
      } catch {
        return { state: 'error', connected: false }
      }
    },

    async connectAndSetWebhook(webhookUrl: string): Promise<void> {
      const res = await fetch(`${url}/instance/connect`, {
        method: 'POST',
        headers: headers(),
        // Não filtra por `subscribe` de propósito: se o nome de algum evento
        // estiver errado aqui, corremos o risco de nunca mais receber
        // mensagem nenhuma. Preferimos receber tudo e ignorar no parser.
        body: JSON.stringify({ webhookUrl }),
      })
      if (!res.ok) throw new Error(`Evolution Go instance/connect: ${await res.text()}`)
    },
  }
}

/**
 * Valida que uma instância existe e está acessível com o token informado,
 * sem persistir nada — usado no onboarding pra checar URL+token+instância
 * antes de salvar o tenant.
 */
export async function checkEvolutionConnection(params: {
  url: string
  apiKey: string
}): Promise<{ state: string; connected: boolean }> {
  try {
    const base = params.url.replace(/\/$/, '')
    const res = await fetch(`${base}/instance/status`, {
      headers: { apikey: params.apiKey },
    })
    if (!res.ok) return { state: 'not_found', connected: false }
    const body = await res.json()
    const d = body?.data ?? {}
    const connected = d.connected === true && d.loggedIn === true
    const state = d.connected && d.loggedIn ? 'open' : d.connected ? 'connecting' : 'close'
    return { state, connected }
  } catch {
    return { state: 'error', connected: false }
  }
}

/**
 * Registra nosso webhook (com o segredo por tenant embutido na URL) na
 * instância já existente do tenant, com credenciais explícitas (usado no
 * onboarding, antes de tudo estar persistido no banco).
 */
export async function setEvolutionWebhook(params: {
  url: string
  apiKey: string
  webhookUrl: string
}): Promise<void> {
  const base = params.url.replace(/\/$/, '')
  const res = await fetch(`${base}/instance/connect`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', apikey: params.apiKey },
    body: JSON.stringify({ webhookUrl: params.webhookUrl }),
  })
  if (!res.ok) throw new Error(`Evolution Go instance/connect: ${await res.text()}`)
}
