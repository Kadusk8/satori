// Helpers de criação/gestão de usuários no store de identidade (auth_users),
// substituindo supabase.auth.admin.createUser/updateUserById/listUsers.
// Todos rodam com bypass (withAdmin) porque mexem em auth_users (só service_role).

import { sql } from 'drizzle-orm'
import { withAdmin } from '@/lib/db'
import { authUsers } from '@/lib/db/schema'
import { hashPassword } from './password'

export interface AuthUserRow {
  id: string
  email: string
  full_name: string | null
}

/** Busca um usuário de identidade pelo email (case-insensitive). */
export async function findAuthUserByEmail(email: string): Promise<AuthUserRow | null> {
  const normalized = email.trim().toLowerCase()
  return withAdmin(async (tx) => {
    const res = await tx.execute(
      sql`select id, email, full_name from ${authUsers} where lower(email) = ${normalized} limit 1`
    )
    return (res.rows?.[0] as unknown as AuthUserRow | undefined) ?? null
  })
}

/**
 * Cria (ou atualiza, se o email já existir) um usuário de identidade.
 * Retorna o id — que vira o id compartilhado em super_admins/users.
 * Se `password` vier null, o hash fica NULL (fluxo de convite: a senha é
 * definida depois pelo link de reset).
 */
export async function upsertAuthUser(params: {
  email: string
  fullName?: string | null
  password?: string | null
  emailVerified?: boolean
}): Promise<string> {
  const email = params.email.trim().toLowerCase()
  const passwordHash = params.password ? await hashPassword(params.password) : null
  const verified = params.emailVerified ? new Date() : null

  return withAdmin(async (tx) => {
    const res = await tx.execute(sql`
      insert into ${authUsers} (email, password_hash, full_name, email_verified)
      values (${email}, ${passwordHash}, ${params.fullName ?? null}, ${verified})
      on conflict (email) do update set
        full_name = coalesce(excluded.full_name, ${authUsers.fullName}),
        password_hash = coalesce(${passwordHash}, ${authUsers.passwordHash}),
        email_verified = coalesce(${verified}, ${authUsers.emailVerified}),
        updated_at = now()
      returning id
    `)
    return (res.rows?.[0] as { id: string }).id
  })
}

/** Define/redefine a senha de um usuário pelo email. */
export async function setPasswordByEmail(email: string, newPassword: string): Promise<boolean> {
  const normalized = email.trim().toLowerCase()
  const passwordHash = await hashPassword(newPassword)
  return withAdmin(async (tx) => {
    const res = await tx.execute(sql`
      update ${authUsers}
      set password_hash = ${passwordHash}, email_verified = coalesce(email_verified, now()), updated_at = now()
      where lower(email) = ${normalized}
      returning id
    `)
    return (res.rows?.length ?? 0) > 0
  })
}
