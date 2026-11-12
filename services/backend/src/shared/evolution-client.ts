// Wrapper da Evolution Go — porta 1:1 de supabase/functions/_shared/evolution-client.ts.
// Cada tenant tem seu próprio servidor externo, com uma instância já criada e
// conectada por ele mesmo (fora da nossa plataforma). Não criamos instância
// nem exibimos QR code — só operamos uma instância que já existe, usando o
// token dela (guardado em tenants.evolution_api_key) como header `apikey`.
//
// Confirmado contra a doc oficial do evolution-foundation/evolution-go:
// - Endpoints não levam o nome da instância na URL — resolvida pelo `apikey`.
// - /send/media usa `url` (não `media`) e `type` (não `mediatype`).
// - Toda resposta de sucesso vem como { message: "success", data: {...} }.
// - O ID da mensagem enviada vem em data.Info.ID.

import { and, eq } from 'drizzle-orm'
import { db, getDecryptedEvolutionKey } from '../db/index.js'
import { contacts, tenants } from '../db/schema.js'
import { getSandbox } from './sandbox.js'
import { sendWithLidRetry } from './lid-retry.js'
import { uploadAudio } from './cloudinary.js'
import { randomUUID } from 'node:crypto'

export interface EvolutionClient {
  url: string
  apiKey: string
  instanceName: string
  sendText(number: string, text: string): Promise<string | null>
  sendMedia(number: string, mediaUrl: string, caption?: string, mediaType?: 'image' | 'video' | 'document' | 'audio'): Promise<string | null>
  sendAudio(number: string, audioBase64: string): Promise<string | null>
  sendLocation(number: string, latitude: number, longitude: number, name?: string, address?: string): Promise<string | null>
  sendPresence(number: string, presence: 'composing' | 'recording' | 'paused', delayMs?: number): Promise<void>
  checkConnection(): Promise<{ state: string; connected: boolean }>
  connectAndSetWebhook(webhookUrl: string): Promise<void>
  /** Pede ao Evolution Go pra reconectar a instância (POST /instance/reconnect). */
  reconnect(): Promise<void>
}

/**
 * Retorna um cliente Evolution Go configurado com as credenciais do tenant.
 */
export async function getEvolutionClient(tenantId: string, encryptionKey?: string | null): Promise<EvolutionClient> {
  // Simulador de teste: nada vai pro WhatsApp. O áudio TTS da resposta é guardado (Cloudinary)
  // pra a tela de teste tocar; texto e mídia já são lidos da tabela messages.
  const sandbox = getSandbox()
  if (sandbox) {
    return {
      url: 'sandbox',
      apiKey: 'sandbox',
      instanceName: 'sandbox',
      async sendText() { return null },
      async sendMedia() { return null },
      async sendAudio(_number: string, audioBase64: string) {
        try {
          sandbox.audioUrl = await uploadAudio(tenantId, `sandbox-${randomUUID()}`, Buffer.from(audioBase64, 'base64'), 'audio/mpeg')
        } catch (err) {
          console.error('[sandbox] Falha ao subir áudio da resposta:', err)
        }
        return null
      },
      async sendLocation() { return null },
      async sendPresence() { /* sem "digitando…" no teste */ },
      async checkConnection() { return { state: 'sandbox', connected: true } },
      async connectAndSetWebhook() { /* não se aplica */ },
      async reconnect() { /* não se aplica */ },
    }
  }
  const rows = await db
    .select({
      evolutionApiUrl: tenants.evolutionApiUrl,
      evolutionInstanceName: tenants.evolutionInstanceName,
      evolutionApiKey: tenants.evolutionApiKey,
    })
    .from(tenants)
    .where(eq(tenants.id, tenantId))
    .limit(1)

  const tenant = rows[0]
  if (!tenant) throw new Error(`[getEvolutionClient] Tenant ${tenantId} não encontrado`)
  if (!tenant.evolutionApiUrl) throw new Error(`[getEvolutionClient] Evolution Go não configurada para tenant ${tenantId}`)
  if (!tenant.evolutionApiKey) throw new Error(`[getEvolutionClient] Token da instância não configurado para tenant ${tenantId}`)

  // Descriptografa via RPC. Se falhar ou não houver chave, usa o valor direto
  // (compatibilidade texto plano).
  let apiKey: string = tenant.evolutionApiKey
  try {
    const decrypted = await getDecryptedEvolutionKey(tenantId, encryptionKey ?? null)
    if (decrypted) apiKey = decrypted
  } catch {
    // chave em texto plano ou sem criptografia — usa valor direto
  }

  const url = tenant.evolutionApiUrl.replace(/\/$/, '')
  const instanceName = tenant.evolutionInstanceName ?? ''

  // Reenvio pelo LID quando o Evolution recusa o número (ver shared/lid-retry.ts).
  function withLidRetry<T>(number: string, send: (target: string) => Promise<T>): Promise<T> {
    return sendWithLidRetry(
      number,
      send,
      async (n) => {
        const rows = await db
          .select({ lid: contacts.whatsappLid })
          .from(contacts)
          .where(and(eq(contacts.tenantId, tenantId), eq(contacts.whatsappNumber, n)))
          .limit(1)
        return rows[0]?.lid ?? null
      },
      (n) => console.warn(`[evolution-client] ${n} recusado ("not registered"); reenviando pelo LID`)
    )
  }

  function headers(): Record<string, string> {
    return { 'Content-Type': 'application/json', apikey: apiKey }
  }

  return {
    url,
    apiKey,
    instanceName,

    async sendText(number: string, text: string): Promise<string | null> {
      return withLidRetry(number, async (target) => {
        const res = await fetch(`${url}/send/text`, {
          method: 'POST',
          headers: headers(),
          body: JSON.stringify({ number: target, text }),
        })
        if (!res.ok) throw new Error(`Evolution Go send/text: ${await res.text()}`)
        const data = (await res.json()) as any
        return data?.data?.Info?.ID ?? null
      })
    },

    async sendMedia(number: string, mediaUrl: string, caption?: string, mediaType: 'image' | 'video' | 'document' | 'audio' = 'image'): Promise<string | null> {
      return withLidRetry(number, async (target) => {
        const res = await fetch(`${url}/send/media`, {
          method: 'POST',
          headers: headers(),
          body: JSON.stringify({ number: target, url: mediaUrl, type: mediaType, caption: caption ?? '' }),
        })
        if (!res.ok) throw new Error(`Evolution Go send/media: ${await res.text()}`)
        const data = (await res.json()) as any
        return data?.data?.Info?.ID ?? null
      })
    },

    async sendAudio(number: string, audioBase64: string): Promise<string | null> {
      // /send/media só aceita `url` (http) ou `file` (multipart) — não aceita
      // data: URI inline — por isso mandamos o áudio decodificado como arquivo.
      const bytes = Buffer.from(audioBase64, 'base64')

      return withLidRetry(number, async (target) => {
        const form = new FormData()
        form.append('number', target)
        form.append('type', 'audio')
        form.append('file', new Blob([bytes], { type: 'audio/ogg' }), 'audio.ogg')

        const res = await fetch(`${url}/send/media`, {
          method: 'POST',
          headers: { apikey: apiKey }, // sem Content-Type: o fetch define o boundary do multipart sozinho
          body: form,
        })
        if (!res.ok) throw new Error(`Evolution Go send/media (audio): ${await res.text()}`)
        const data = (await res.json()) as any
        return data?.data?.Info?.ID ?? null
      })
    },

    // Confirmado contra o OpenAPI oficial (Evolution-Go/send-message.yaml,
    // schema SendLocation): POST /send/location com { number, latitude,
    // longitude, name?, address? } — nomes/tipos exatos, sem "type" nem "url"
    // (diferente de /send/media).
    async sendLocation(number: string, latitude: number, longitude: number, name?: string, address?: string): Promise<string | null> {
      return withLidRetry(number, async (target) => {
        const res = await fetch(`${url}/send/location`, {
          method: 'POST',
          headers: headers(),
          body: JSON.stringify({ number: target, latitude, longitude, name, address }),
        })
        if (!res.ok) throw new Error(`Evolution Go send/location: ${await res.text()}`)
        const data = (await res.json()) as any
        return data?.data?.Info?.ID ?? null
      })
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
        const body = (await res.json()) as any
        const d = body?.data ?? {}
        // A Evolution Go devolve os campos em PascalCase (Connected/LoggedIn),
        // não camelCase — checar os dois formatos por segurança.
        const isConnected = d.connected === true || d.Connected === true
        const isLoggedIn = d.loggedIn === true || d.LoggedIn === true
        const connected = isConnected && isLoggedIn
        const state = isConnected && isLoggedIn ? 'open' : isConnected ? 'connecting' : 'close'
        return { state, connected }
      } catch {
        return { state: 'error', connected: false }
      }
    },

    async connectAndSetWebhook(webhookUrl: string): Promise<void> {
      const res = await fetch(`${url}/instance/connect`, {
        method: 'POST',
        headers: headers(),
        body: JSON.stringify({ webhookUrl, subscribe: ['MESSAGE', 'CONNECTION', 'LABEL', 'CONTACT'] }),
      })
      if (!res.ok) throw new Error(`Evolution Go instance/connect: ${await res.text()}`)
    },

    async reconnect(): Promise<void> {
      const res = await fetch(`${url}/instance/reconnect`, { method: 'POST', headers: headers() })
      if (!res.ok) throw new Error(`Evolution Go instance/reconnect: ${await res.text()}`)
    },
  }
}
