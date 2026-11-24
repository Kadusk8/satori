'use server'

import { findAuthUserByEmail, getPasswordFingerprint, setPasswordByEmail } from '@/lib/auth/users'
import { createToken, verifyTokenPayload } from '@/lib/auth/tokens'
import { sendPasswordResetEmail } from '@/lib/email/resend'

/**
 * Dispara o email de redefinição de senha. Sempre retorna sucesso (não revela
 * se o email existe — evita enumeração de contas).
 */
export async function requestPasswordReset(formData: FormData) {
  const email = (formData.get('email') as string)?.trim().toLowerCase()
  if (!email) return { success: true }

  try {
    const user = await findAuthUserByEmail(email)
    if (user) {
      const token = createToken(email, 'reset', 1, await getPasswordFingerprint(email))
      await sendPasswordResetEmail(email, token)
    }
  } catch (err) {
    console.error('[requestPasswordReset] erro:', err)
    // Não vaza o erro pro cliente.
  }

  return { success: true }
}

/**
 * Define a nova senha a partir do token do link (reset ou convite).
 */
export async function resetPasswordWithToken(token: string, password: string) {
  if (password.length < 8) {
    return { error: 'A senha deve ter pelo menos 8 caracteres.' }
  }

  // Aceita tanto token de reset quanto de convite de operador.
  const payload = verifyTokenPayload(token, 'reset') ?? verifyTokenPayload(token, 'invite')
  // O fingerprint precisa bater com o hash atual: depois de usado (senha trocada) o link morre.
  if (!payload || payload.pf !== (await getPasswordFingerprint(payload.email))) {
    return { error: 'Link inválido ou expirado. Solicite um novo.' }
  }

  const ok = await setPasswordByEmail(payload.email, password)
  if (!ok) {
    return { error: 'Não foi possível redefinir a senha.' }
  }

  return { success: true }
}
