'use server'

import { revalidatePath } from 'next/cache'
import { and, eq } from 'drizzle-orm'
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

export interface ContactProfileInput {
  name: string
  email: string
  phone: string
  birthDate: string
  document: string
  address: string
  notes: string
}

/** Cadastro completo do cliente (página /contacts/[id]). */
export async function updateContactProfile(contactId: string, input: ContactProfileInput) {
  const claims = await claimsOrThrow()
  const name = input.name.trim()
  if (!name) throw new Error('O nome não pode ficar em branco.')
  const email = input.email.trim()
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Error('E-mail inválido.')
  const birthDate = input.birthDate.trim()
  if (birthDate && !/^\d{4}-\d{2}-\d{2}$/.test(birthDate)) throw new Error('Data de nascimento inválida.')

  await withClaims(claims, (tx) =>
    tx
      .update(contacts)
      .set({
        customName: name,
        email: email || null,
        phone: input.phone.trim() || null,
        birthDate: birthDate || null,
        document: input.document.trim() || null,
        address: input.address.trim() || null,
        notes: input.notes.trim() || null,
      })
      .where(and(eq(contacts.id, contactId), eq(contacts.tenantId, claims.tenant_id!)))
  )
  revalidateContactPaths()
  revalidatePath(`/contacts/${contactId}`)
}
