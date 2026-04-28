'use server'

import { revalidatePath } from 'next/cache'
import { createServiceClient } from '@/lib/supabase/server'

export async function updateTenantStatus(tenantId: string, status: 'active' | 'suspended' | 'cancelled') {
  const supabase = createServiceClient()
  const { error } = await supabase
    .from('tenants')
    .update({ status })
    .eq('id', tenantId)
  if (error) throw new Error(error.message)
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
}) {
  const supabase = createServiceClient()
  const { error } = await supabase
    .from('tenants')
    .update({ ...data, updated_at: new Date().toISOString() })
    .eq('id', tenantId)
  if (error) throw new Error(error.message)
  revalidatePath(`/admin/tenants/${tenantId}`)
  revalidatePath('/admin/tenants')
}

export async function updateAgent(agentId: string, data: {
  name?: string
  system_prompt?: string
  greeting_message?: string
  out_of_hours_message?: string
  personality?: string
}, tenantId: string) {
  const supabase = createServiceClient()
  const { error } = await supabase
    .from('ai_agents')
    .update({ ...data, updated_at: new Date().toISOString() })
    .eq('id', agentId)
  if (error) throw new Error(error.message)
  revalidatePath(`/admin/tenants/${tenantId}`)
}

export async function updateTenantLLM(tenantId: string, data: {
  llmProvider: 'openai' | 'gemini' | 'anthropic'
  llmModel: string
  llmApiKey: string
  agentId: string
}) {
  const supabase = createServiceClient()

  // Salva a chave no campo correto do tenant e zera os outros
  const keyFields = {
    openai_api_key: data.llmProvider === 'openai' ? data.llmApiKey : null,
    gemini_api_key: data.llmProvider === 'gemini' ? data.llmApiKey : null,
    anthropic_api_key: data.llmProvider === 'anthropic' ? data.llmApiKey : null,
  }
  const { error: tenantError } = await supabase
    .from('tenants')
    .update({ ...keyFields, updated_at: new Date().toISOString() })
    .eq('id', tenantId)
  if (tenantError) throw new Error(tenantError.message)

  // Atualiza o modelo no agente
  const { error: agentError } = await supabase
    .from('ai_agents')
    .update({ model: data.llmModel, updated_at: new Date().toISOString() })
    .eq('id', data.agentId)
  if (agentError) throw new Error(agentError.message)

  revalidatePath(`/admin/tenants/${tenantId}`)
}

export async function updateTenantAudio(tenantId: string, data: {
  agentId: string
  voiceId: string | null
  audioResponseEnabled: boolean
  elevenLabsApiKey?: string
}) {
  const supabase = createServiceClient()

  const { error: agentError } = await supabase
    .from('ai_agents')
    .update({
      voice_id: data.voiceId || null,
      audio_response_enabled: data.audioResponseEnabled,
      updated_at: new Date().toISOString(),
    })
    .eq('id', data.agentId)
  if (agentError) throw new Error(agentError.message)

  if (data.elevenLabsApiKey?.trim()) {
    const { error: tenantError } = await supabase
      .from('tenants')
      .update({
        elevenlabs_api_key: data.elevenLabsApiKey.trim(),
        updated_at: new Date().toISOString(),
      })
      .eq('id', tenantId)
    if (tenantError) throw new Error(tenantError.message)
  }

  revalidatePath(`/admin/tenants/${tenantId}`)
}

export async function deleteTenant(tenantId: string) {
  const supabase = createServiceClient()
  const { error } = await supabase
    .from('tenants')
    .delete()
    .eq('id', tenantId)
  if (error) throw new Error(error.message)
  revalidatePath('/admin/tenants')
}
