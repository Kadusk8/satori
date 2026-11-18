'use server'

import { revalidatePath } from 'next/cache'
import { and, eq } from 'drizzle-orm'
import { withClaims } from '@/lib/db'
import { appointments, contacts, conversations, messages } from '@/lib/db/schema'
import { getDbClaims } from '@/lib/auth/session'
import { isManager } from '@/lib/auth/permissions'
import { triggerEvent, tenantChannel } from '@/lib/realtime/server'

async function claimsOrThrow() {
  const claims = await getDbClaims()
  if (!claims?.tenant_id) throw new Error('Tenant não identificado.')
  return claims
}

function revalidateContactPaths() {
  revalidatePath('/conversations')
  revalidatePath('/contacts')
}

/**
 * Exclui o contato e todo o histórico dele no tenant — só dono/admin.
 * messages.contact_id e appointments.contact_id são FK NO ACTION, e o Postgres checa a de
 * messages antes de a cascata conversations → messages rodar — então apaga na ordem
 * explícita: agendamentos → mensagens → conversas → contato (follow-ups saem em cascata).
 * Se a pessoa mandar mensagem de novo, o webhook recria o contato do zero.
 */
export async function deleteContact(contactId: string): Promise<void> {
  const claims = await claimsOrThrow()
  if (!isManager(claims.user_role)) throw new Error('Só o dono ou um admin pode excluir contatos.')
  const tenantId = claims.tenant_id!

  await withClaims(claims, async (tx) => {
    await tx
      .delete(appointments)
      .where(and(eq(appointments.contactId, contactId), eq(appointments.tenantId, tenantId)))
    await tx
      .delete(messages)
      .where(and(eq(messages.contactId, contactId), eq(messages.tenantId, tenantId)))
    await tx
      .delete(conversations)
      .where(and(eq(conversations.contactId, contactId), eq(conversations.tenantId, tenantId)))
    const deleted = await tx
      .delete(contacts)
      .where(and(eq(contacts.id, contactId), eq(contacts.tenantId, tenantId)))
      .returning({ id: contacts.id })
    if (deleted.length === 0) throw new Error('Contato não encontrado.')
  })

  // Kanban aberto em outra aba some com o card do contato excluído.
  await triggerEvent(tenantChannel(tenantId), 'conversation:changed', { contactId })
  revalidateContactPaths()
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
