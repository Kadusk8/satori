import { createAdminClient } from '../_shared/supabase-admin.ts'

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

  let payload: { email: string; password: string }
  try {
    payload = await req.json()
  } catch {
    return Response.json({ error: 'Payload inválido' }, { status: 400 })
  }

  const { email, password } = payload

  if (!email || !password) {
    return Response.json(
      { error: 'Email e password são obrigatórios' },
      { status: 400 }
    )
  }

  try {
    const supabase = createAdminClient()

    // Buscar o usuário pelo email
    const { data: users } = await supabase.auth.admin.listUsers()
    const user = users?.users?.find((u: { email?: string }) => u.email === email)

    if (!user) {
      return Response.json({ error: 'Usuário não encontrado' }, { status: 404 })
    }

    // Atualizar a senha
    const { error } = await supabase.auth.admin.updateUserById(user.id, {
      password: password,
    })

    if (error) {
      throw new Error(`Erro ao atualizar senha: ${error.message}`)
    }

    return Response.json(
      { success: true, message: 'Senha atualizada com sucesso', userId: user.id },
      {
        headers: { 'Access-Control-Allow-Origin': '*' },
      }
    )
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Erro interno'
    console.error('[reset-password] ERROR:', message)
    return Response.json(
      { error: message },
      {
        status: 500,
        headers: { 'Access-Control-Allow-Origin': '*' },
      }
    )
  }
})
