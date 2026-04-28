'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'

export async function login(formData: FormData) {
  const supabase = await createClient()

  const email = formData.get('email') as string
  const password = formData.get('password') as string

  const { error } = await supabase.auth.signInWithPassword({ email, password })

  if (error) {
    return { error: error.message }
  }

  // Verificar role para redirecionar
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    return { error: 'Erro ao obter dados do usuário.' }
  }

  // Checar se é super admin
  const { data: superAdmin, error: superAdminError } = await supabase
    .from('super_admins')
    .select('id')
    .eq('id', user.id)
    .single()

  revalidatePath('/', 'layout')

  // Se conseguiu encontrar super admin, redireciona para admin
  // Senão redireciona para dashboard (user comum)
  if (superAdmin) {
    redirect('/admin')
  } else {
    redirect('/dashboard')
  }
}

export async function register(formData: FormData) {
  const supabase = await createClient()

  const email = formData.get('email') as string
  const password = formData.get('password') as string
  const fullName = formData.get('full_name') as string

  const { error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      data: {
        full_name: fullName,
      },
    },
  })

  if (error) {
    return { error: error.message }
  }

  revalidatePath('/', 'layout')
  redirect('/login?registered=true')
}

export async function logout() {
  const supabase = await createClient()
  await supabase.auth.signOut()
  revalidatePath('/', 'layout')
  redirect('/login')
}
