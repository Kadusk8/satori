import { createClient } from 'jsr:@supabase/supabase-js@2'

// Cliente com service_role — acesso total, sem RLS
// NUNCA expor SUPABASE_SERVICE_ROLE_KEY no frontend
export function createAdminClient() {
  const url = Deno.env.get('SUPABASE_URL')
  const key = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')

  if (!url || !key) {
    throw new Error('SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY são obrigatórios')
  }

  return createClient(url, key, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  })
}
