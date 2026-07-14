'use server'

import { revalidatePath } from 'next/cache'
import { and, eq, sql } from 'drizzle-orm'
import { withAdmin } from '@/lib/db'
import { tenants, aiAgents, users, authUsers } from '@/lib/db/schema'
import { encryptedColumn } from '@/lib/db/encryption'
import { checkEvolutionConnection, setEvolutionWebhook } from '@/lib/evolution/client'

const ENCRYPTION_KEY = process.env.ENCRYPTION_KEY ?? null

export async function updateTenantStatus(tenantId: string, status: 'active' | 'suspended' | 'cancelled') {
  await withAdmin((tx) => tx.update(tenants).set({ status }).where(eq(tenants.id, tenantId)))
  revalidatePath(`/admin/tenants/${tenantId}`)
  revalidatePath('/admin/tenants')
}

export async function updateTenant(tenantId: string, data: {
  name?: string
  business_segment?: string
  business_description?: string
  owner_name?: string
  owner_email?: string
  owner_phone?: string
  city?: string
  state?: string
  website?: string
  plan?: string
  max_messages_month?: number
  max_products?: number
  max_operators?: number
}) {
  const patch = {
    name: data.name,
    businessSegment: data.business_segment,
    businessDescription: data.business_description,
    ownerName: data.owner_name,
    ownerEmail: data.owner_email,
    ownerPhone: data.owner_phone,
    city: data.city,
    state: data.state,
    website: data.website,
    plan: data.plan,
    maxMessagesMonth: data.max_messages_month,
    maxProducts: data.max_products,
    maxOperators: data.max_operators,
    updatedAt: new Date(),
  }
  // Remove undefined pra não sobrescrever colunas não enviadas.
  const cleaned = Object.fromEntries(Object.entries(patch).filter(([, v]) => v !== undefined))

  await withAdmin(async (tx) => {
    await tx.update(tenants).set(cleaned).where(eq(tenants.id, tenantId))

    // O email do owner também é a credencial de login (auth_users.email) —
    // sem isso, mudar aqui só atualizava o metadado do tenant e o login
    // continuava exigindo o email antigo.
    const newEmail = data.owner_email?.trim().toLowerCase()
    if (newEmail) {
      const [owner] = await tx
        .select({ id: users.id, email: users.email })
        .from(users)
        .where(and(eq(users.tenantId, tenantId), eq(users.role, 'owner')))
        .limit(1)

      if (owner && owner.email.toLowerCase() !== newEmail) {
        const [conflict] = await tx
          .select({ id: authUsers.id })
          .from(authUsers)
          .where(eq(authUsers.email, newEmail))
          .limit(1)
        if (conflict && conflict.id !== owner.id) {
          throw new Error('Esse email já está em uso por outra conta — escolha outro.')
        }

        await tx.update(authUsers).set({ email: newEmail, updatedAt: new Date() }).where(eq(authUsers.id, owner.id))
        await tx.update(users).set({ email: newEmail }).where(eq(users.id, owner.id))
      }
    }
  })

  revalidatePath(`/admin/tenants/${tenantId}`)
  revalidatePath('/admin/tenants')
  revalidatePath('/admin/plans')
}

export async function updateTenantBusinessHours(tenantId: string, data: {
  businessHours: Record<string, { enabled: boolean; start: string; end: string }>
  timezone: string
  appointmentDurationMinutes: number
}) {
  await withAdmin((tx) =>
    tx
      .update(tenants)
      .set({
        businessHours: data.businessHours,
        timezone: data.timezone,
        appointmentDurationMinutes: data.appointmentDurationMinutes,
        updatedAt: new Date(),
      })
      .where(eq(tenants.id, tenantId))
  )
  revalidatePath(`/admin/tenants/${tenantId}`)
}

export async function updateAgent(agentId: string, data: {
  name?: string
  system_prompt?: string
  greeting_message?: string
  out_of_hours_message?: string
  personality?: string
}, tenantId: string) {
  const patch = {
    name: data.name,
    systemPrompt: data.system_prompt,
    greetingMessage: data.greeting_message,
    outOfHoursMessage: data.out_of_hours_message,
    personality: data.personality,
    updatedAt: new Date(),
  }
  const cleaned = Object.fromEntries(Object.entries(patch).filter(([, v]) => v !== undefined))
  await withAdmin((tx) => tx.update(aiAgents).set(cleaned).where(eq(aiAgents.id, agentId)))
  revalidatePath(`/admin/tenants/${tenantId}`)
}

export async function updateTenantLLM(tenantId: string, data: {
  llmProvider: 'openai' | 'gemini' | 'anthropic' | 'openrouter'
  llmModel: string
  llmApiKey: string
  agentId: string
}) {
  // A chave e o provedor ficam no próprio agente (BYOK por agente) — cada
  // agente do tenant pode usar um provedor/chave diferente.
  await withAdmin((tx) =>
    tx
      .update(aiAgents)
      .set({
        model: data.llmModel,
        llmProvider: data.llmProvider,
        llmApiKey: encryptedColumn(data.llmApiKey, 'encrypt_llm_key'),
        updatedAt: new Date(),
      })
      .where(eq(aiAgents.id, data.agentId))
  )
  revalidatePath(`/admin/tenants/${tenantId}`)
}

export async function updateTenantAudio(tenantId: string, data: {
  agentId: string
  voiceId: string | null
  audioResponseEnabled: boolean
  elevenLabsApiKey?: string
}) {
  await withAdmin(async (tx) => {
    await tx
      .update(aiAgents)
      .set({
        voiceId: data.voiceId || null,
        audioResponseEnabled: data.audioResponseEnabled,
        updatedAt: new Date(),
      })
      .where(eq(aiAgents.id, data.agentId))

    if (data.elevenLabsApiKey?.trim()) {
      await tx
        .update(tenants)
        .set({ elevenlabsApiKey: data.elevenLabsApiKey.trim(), updatedAt: new Date() })
        .where(eq(tenants.id, tenantId))
    }
  })
  revalidatePath(`/admin/tenants/${tenantId}`)
}

// Edita a config da Meta Conversions API de um tenant — dataset/pixel ID,
// access token (write-only, criptografado) e o toggle de ativação. Cada
// tenant tem suas próprias credenciais; meta_capi_enabled é o gate: sem ele,
// nenhum evento é enviado ao Meta mesmo com credenciais configuradas.
// Deixar o token em branco mantém o atual.
export async function updateTenantMetaCapi(tenantId: string, data: {
  metaDatasetId: string
  metaCapiEnabled: boolean
  metaAccessToken?: string
}) {
  const metaDatasetId = data.metaDatasetId.trim()

  await withAdmin((tx) =>
    tx
      .update(tenants)
      .set({
        metaDatasetId: metaDatasetId || null,
        metaCapiEnabled: data.metaCapiEnabled,
        ...(data.metaAccessToken?.trim()
          ? { metaAccessToken: encryptedColumn(data.metaAccessToken.trim(), 'encrypt_meta_token') }
          : {}),
        updatedAt: new Date(),
      })
      .where(eq(tenants.id, tenantId))
  )

  revalidatePath(`/admin/tenants/${tenantId}`)
}

// Registra/atualiza o webhook na instância Evolution Go do tenant e persiste
// o status de conexão. Compartilhado por reconnectEvolution e
// updateEvolutionConnection.
async function syncEvolutionWebhook(tenantId: string, evolutionApiUrl: string, evolutionApiKey: string, webhookSecret: string): Promise<{ connected: boolean; webhookUrl: string }> {
  const backendUrl = (process.env.BACKEND_PUBLIC_URL ?? '').replace(/\/$/, '')
  if (!backendUrl) throw new Error('BACKEND_PUBLIC_URL não configurada no servidor.')
  const webhookUrl = `${backendUrl}/webhook-evolution?ts=${webhookSecret}`

  await setEvolutionWebhook({ url: evolutionApiUrl, apiKey: evolutionApiKey, webhookUrl })
  const { connected } = await checkEvolutionConnection({ url: evolutionApiUrl, apiKey: evolutionApiKey })

  await withAdmin((tx) =>
    tx.update(tenants).set({ whatsappConnected: connected, updatedAt: new Date() }).where(eq(tenants.id, tenantId))
  )
  revalidatePath(`/admin/tenants/${tenantId}`)

  return { connected, webhookUrl }
}

// Re-registra o webhook na instância Evolution Go do tenant (útil quando o
// registro automático do onboarding falhou, ou a instância foi recriada) e
// atualiza o status de conexão. Usado pelo botão "Reconectar" no admin.
export async function reconnectEvolution(tenantId: string): Promise<{ connected: boolean; webhookUrl: string }> {
  const row = await withAdmin(async (tx) => {
    const res = await tx.execute(sql`
      select evolution_api_url, webhook_secret,
             get_decrypted_evolution_key(id, ${ENCRYPTION_KEY}) as evolution_api_key
      from tenants where id = ${tenantId} limit 1
    `)
    return res.rows?.[0] as {
      evolution_api_url: string | null
      webhook_secret: string
      evolution_api_key: string | null
    } | undefined
  })

  if (!row?.evolution_api_url || !row.evolution_api_key) {
    throw new Error('Evolution Go não configurada para este tenant (URL ou API key ausente/ilegível — tente reeditar a conexão).')
  }

  return syncEvolutionWebhook(tenantId, row.evolution_api_url, row.evolution_api_key, row.webhook_secret)
}

// Edita a URL/instância/API key da Evolution Go de um tenant já existente —
// útil quando a chave salva ficou ilegível (ex: rotação de ENCRYPTION_KEY) ou
// a instância mudou. Deixar a API key em branco mantém a atual.
export async function updateEvolutionConnection(tenantId: string, data: {
  evolutionApiUrl: string
  evolutionInstanceName: string
  evolutionApiKey?: string
}): Promise<{ connected: boolean; webhookUrl: string }> {
  const evolutionApiUrl = data.evolutionApiUrl.trim().replace(/\/$/, '')
  const evolutionInstanceName = data.evolutionInstanceName.trim()
  if (!evolutionApiUrl || !evolutionInstanceName) {
    throw new Error('URL e instância da Evolution Go são obrigatórias.')
  }

  await withAdmin((tx) =>
    tx
      .update(tenants)
      .set({
        evolutionApiUrl,
        evolutionInstanceName,
        ...(data.evolutionApiKey?.trim()
          ? { evolutionApiKey: encryptedColumn(data.evolutionApiKey.trim(), 'encrypt_evolution_key') }
          : {}),
        updatedAt: new Date(),
      })
      .where(eq(tenants.id, tenantId))
  )

  const row = await withAdmin(async (tx) => {
    const res = await tx.execute(sql`
      select webhook_secret, get_decrypted_evolution_key(id, ${ENCRYPTION_KEY}) as evolution_api_key
      from tenants where id = ${tenantId} limit 1
    `)
    return res.rows?.[0] as { webhook_secret: string; evolution_api_key: string | null } | undefined
  })

  if (!row?.evolution_api_key) {
    throw new Error('Não foi possível ler a API key salva — confira o valor digitado.')
  }

  return syncEvolutionWebhook(tenantId, evolutionApiUrl, row.evolution_api_key, row.webhook_secret)
}

export async function deleteTenant(tenantId: string) {
  await withAdmin((tx) => tx.delete(tenants).where(eq(tenants.id, tenantId)))
  revalidatePath('/admin/tenants')
}
