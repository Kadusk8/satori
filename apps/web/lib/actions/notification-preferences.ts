'use server'

import { eq } from 'drizzle-orm'
import { z } from 'zod'
import { withClaims } from '@/lib/db'
import { users } from '@/lib/db/schema'
import { getDbClaims } from '@/lib/auth/session'

// Cada usuário só lê/altera as PRÓPRIAS preferências — nunca recebe userId como
// input. Gravação via withClaims (policy operator_self_update / owner_admin_manage),
// mesmo caminho de updateAvailability; o .set() só toca as colunas de push.

export type NotificationPreferences = {
  onlyAssigned: boolean
  /** 'HH:MM' ou null (sem horário silencioso). */
  quietStart: string | null
  quietEnd: string | null
}

const hhmm = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Horário inválido')

const schema = z
  .object({
    onlyAssigned: z.boolean(),
    quietStart: hhmm.nullable(),
    quietEnd: hhmm.nullable(),
  })
  .refine((v) => (v.quietStart === null) === (v.quietEnd === null), {
    message: 'Informe o início e o fim do horário silencioso.',
  })
  .refine((v) => v.quietStart === null || v.quietStart !== v.quietEnd, {
    message: 'O início e o fim do horário silencioso precisam ser diferentes.',
  })

async function requireUser() {
  const claims = await getDbClaims()
  if (!claims?.sub || !claims.tenant_id) throw new Error('Sessão inválida.')
  return claims
}

export async function getMyNotificationPreferences(): Promise<NotificationPreferences> {
  const claims = await requireUser()
  const [row] = await withClaims(claims, (tx) =>
    tx
      .select({
        onlyAssigned: users.pushOnlyAssigned,
        quietStart: users.pushQuietStart,
        quietEnd: users.pushQuietEnd,
      })
      .from(users)
      .where(eq(users.id, claims.sub!))
      .limit(1)
  )
  return {
    onlyAssigned: row?.onlyAssigned ?? false,
    // TIME vem como 'HH:MM:SS' do Postgres; a UI trabalha com 'HH:MM'.
    quietStart: row?.quietStart?.slice(0, 5) ?? null,
    quietEnd: row?.quietEnd?.slice(0, 5) ?? null,
  }
}

export async function updateMyNotificationPreferences(
  input: NotificationPreferences
): Promise<{ error?: string }> {
  const parsed = schema.safeParse(input)
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? 'Dados inválidos.' }

  const claims = await requireUser()
  await withClaims(claims, (tx) =>
    tx
      .update(users)
      .set({
        pushOnlyAssigned: parsed.data.onlyAssigned,
        pushQuietStart: parsed.data.quietStart,
        pushQuietEnd: parsed.data.quietEnd,
      })
      .where(eq(users.id, claims.sub!))
  )
  return {}
}
