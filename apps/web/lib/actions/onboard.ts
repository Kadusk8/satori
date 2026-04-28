'use server'

import type { OnboardingPayload } from '@/types/onboarding'

export async function onboardTenant(payload: OnboardingPayload & { currentStepId?: string }) {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY

  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error('Variáveis de ambiente não configuradas no servidor')
  }

  const res = await fetch(`${supabaseUrl}/functions/v1/onboard-tenant`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${serviceRoleKey}`,
      'apikey': serviceRoleKey,
    },
    body: JSON.stringify(payload),
  })

  const json = await res.json().catch(() => ({ error: 'Resposta inválida da edge function' }))

  if (!res.ok) {
    // Loga no servidor para debug
    console.error('[onboard-tenant] Erro HTTP', res.status, JSON.stringify(json))
    throw new Error(json.error ?? json.message ?? `Erro ${res.status}`)
  }

  return json
}
