'use server'

export async function resetPassword(email: string, password: string) {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY

  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error('Variáveis de ambiente não configuradas')
  }

  const res = await fetch(`${supabaseUrl}/functions/v1/reset-password`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${serviceRoleKey}`,
      'apikey': serviceRoleKey,
    },
    body: JSON.stringify({ email, password }),
  })

  const json = await res.json()

  if (!res.ok) {
    console.error('[reset-password] Erro HTTP', res.status, json)
    throw new Error(json.error ?? 'Erro ao resetar senha')
  }

  return json
}
