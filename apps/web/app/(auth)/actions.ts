'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { AuthError } from 'next-auth'
import { signIn, signOut } from '@/auth'
import { getClaimsForUser } from '@/lib/auth/claims'
import { findAuthUserByEmail } from '@/lib/auth/users'

export async function login(formData: FormData) {
  const email = formData.get('email') as string
  const password = formData.get('password') as string

  try {
    await signIn('credentials', { email, password, redirect: false })
  } catch (error) {
    if (error instanceof AuthError) {
      return { error: 'Email ou senha incorretos.' }
    }
    throw error
  }

  // Decide o destino pelo papel (claims montados no login).
  const user = await findAuthUserByEmail(email)
  const claims = user ? await getClaimsForUser(user.id) : null

  revalidatePath('/', 'layout')
  if (claims?.is_super_admin) redirect('/admin')
  redirect('/dashboard')
}

export async function logout() {
  await signOut({ redirect: false })
  revalidatePath('/', 'layout')
  redirect('/login')
}
