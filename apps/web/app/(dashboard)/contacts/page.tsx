export const dynamic = 'force-dynamic'

import { desc, eq, sql } from 'drizzle-orm'
import { withClaims } from '@/lib/db'
import { contacts } from '@/lib/db/schema'
import { getDbClaims } from '@/lib/auth/session'
import { ContactsTable } from './contacts-table'

export default async function ContactsPage() {
  const claims = await getDbClaims()
  if (!claims?.tenant_id) {
    return (
      <div className="p-8">
        <p className="text-sm text-muted-foreground">Não foi possível identificar sua empresa.</p>
      </div>
    )
  }

  const rows = await withClaims(claims, (tx) =>
    tx
      .select({
        id: contacts.id,
        whatsappNumber: contacts.whatsappNumber,
        whatsappName: contacts.whatsappName,
        customName: contacts.customName,
        tags: contacts.tags,
        notes: contacts.notes,
        lastContactAt: contacts.lastContactAt,
        totalConversations: sql<number>`(select count(*)::int from conversations c where c.contact_id = ${contacts.id})`,
      })
      .from(contacts)
      .where(eq(contacts.tenantId, claims.tenant_id!))
      .orderBy(desc(contacts.lastContactAt))
  )

  const initialContacts = rows.map((r) => ({
    id: r.id,
    name: r.customName ?? r.whatsappName ?? r.whatsappNumber,
    phone: r.whatsappNumber,
    whatsappName: r.whatsappName,
    tags: r.tags ?? [],
    notes: r.notes,
    totalConversations: Number(r.totalConversations),
    lastContactAt: (r.lastContactAt instanceof Date ? r.lastContactAt : new Date(r.lastContactAt)).toISOString(),
  }))

  return (
    <div className="p-8 space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Contatos</h1>
        <p className="text-muted-foreground text-sm mt-1">
          {initialContacts.length} lead{initialContacts.length === 1 ? '' : 's'} e clientes
        </p>
      </div>

      <ContactsTable initialContacts={initialContacts} />
    </div>
  )
}
