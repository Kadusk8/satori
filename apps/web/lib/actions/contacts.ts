'use server'

import { revalidatePath } from 'next/cache'
import { eq } from 'drizzle-orm'
import { withClaims } from '@/lib/db'
import { contacts } from '@/lib/db/schema'
import { getDbClaims } from '@/lib/auth/session'

async function claimsOrThrow() {
  const claims = await getDbClaims()
  if (!claims?.tenant_id) throw new Error('Tenant não identificado.')
  return claims
}

function revalidateContactPaths() {
  revalidatePath('/conversations')
  revalidatePath('/contacts')
}

/** Observação livre sobre o lead — qualquer usuário do tenant pode editar
 * (RLS via withClaims já restringe ao próprio tenant). */
export async function updateContactNotes(contactId: string, notes: string) {
  const claims = await claimsOrThrow()
  await withClaims(claims, (tx) =>
    tx.update(contacts).set({ notes: notes.trim() || null }).where(eq(contacts.id, contactId))
  )
  revalidateContactPaths()
}

/** Nome exibido no painel, editado pelo operador — não sobrescreve o nome
 * real do WhatsApp (whatsapp_name), só o "apelido" usado no CRM. */
export async function updateContactName(contactId: string, name: string) {
  const claims = await claimsOrThrow()
  await withClaims(claims, (tx) =>
    tx.update(contacts).set({ customName: name.trim() || null }).where(eq(contacts.id, contactId))
  )
  revalidateContactPaths()
}

export async function updateContactTags(contactId: string, tags: string[]) {
  const claims = await claimsOrThrow()
  const cleaned = Array.from(new Set(tags.map((t) => t.trim().toLowerCase()).filter(Boolean))).slice(0, 20)
  await withClaims(claims, (tx) =>
    tx.update(contacts).set({ tags: cleaned }).where(eq(contacts.id, contactId))
  )
  revalidateContactPaths()
}
