'use server'

import { revalidatePath } from 'next/cache'
import { eq } from 'drizzle-orm'
import { withAdmin } from '@/lib/db'
import { tenants, aiAgents } from '@/lib/db/schema'
import { encryptedColumn } from '@/lib/db/encryption'

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
  await withAdmin((tx) => tx.update(tenants).set(cleaned).where(eq(tenants.id, tenantId)))
  revalidatePath(`/admin/tenants/${tenantId}`)
  revalidatePath('/admin/tenants')
  revalidatePath('/admin/plans')
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

export async function deleteTenant(tenantId: string) {
  await withAdmin((tx) => tx.delete(tenants).where(eq(tenants.id, tenantId)))
  revalidatePath('/admin/tenants')
}
