'use server'

import { revalidatePath } from 'next/cache'
import { and, asc, eq, gte, ilike, inArray, lte } from 'drizzle-orm'
import { withClaims } from '@/lib/db'
import { appointments, appointmentServices, contacts, products, tenants, users } from '@/lib/db/schema'
import { getDbClaims } from '@/lib/auth/session'
import { triggerEvent, tenantChannel } from '@/lib/realtime/server'

export interface DBAppointmentRow {
  id: string
  contact_id: string
  conversation_id: string | null
  assigned_to: string | null
  title: string | null
  notes: string | null
  date: string
  start_time: string
  end_time: string
  status: 'pending' | 'confirmed' | 'cancelled' | 'completed' | 'no_show'
  contacts: { id: string; whatsapp_name: string | null; custom_name: string | null; whatsapp_number: string }
  services: CompletedService[]
}

/** Serviço realizado num atendimento concluído — preço vem sempre do catálogo. */
export interface CompletedService {
  productId: string
  professionalId: string | null
}

export interface CompletionOptions {
  products: { id: string; name: string; price: number }[]
  professionals: { id: string; name: string }[]
  currentUserId: string
}

export interface TenantScheduleConfig {
  appointment_duration_minutes: number
  appointment_slot_interval_minutes: number
  business_hours: Record<string, { start: string; end: string } | null>
  tenant_id: string
}

async function claimsOrThrow() {
  const c = await getDbClaims()
  if (!c?.tenant_id) throw new Error('Tenant não identificado.')
  return c
}

export async function getTenantScheduleConfig(): Promise<TenantScheduleConfig | null> {
  const claims = await claimsOrThrow()
  return withClaims(claims, async (tx) => {
    const rows = await tx
      .select({
        appointment_duration_minutes: tenants.appointmentDurationMinutes,
        appointment_slot_interval_minutes: tenants.appointmentSlotIntervalMinutes,
        business_hours: tenants.businessHours,
        tenant_id: tenants.id,
      })
      .from(tenants)
      .where(eq(tenants.id, claims.tenant_id!))
      .limit(1)
    return (rows[0] as unknown as TenantScheduleConfig) ?? null
  })
}

export async function listAppointments(fromDate: string, toDate: string): Promise<DBAppointmentRow[]> {
  const claims = await claimsOrThrow()
  const rows = await withClaims(claims, (tx) =>
    tx
      .select({
        id: appointments.id,
        contact_id: appointments.contactId,
        conversation_id: appointments.conversationId,
        assigned_to: appointments.assignedTo,
        title: appointments.title,
        notes: appointments.notes,
        date: appointments.date,
        start_time: appointments.startTime,
        end_time: appointments.endTime,
        status: appointments.status,
        c_id: contacts.id,
        c_wname: contacts.whatsappName,
        c_custom: contacts.customName,
        c_number: contacts.whatsappNumber,
      })
      .from(appointments)
      .innerJoin(contacts, eq(contacts.id, appointments.contactId))
      .where(and(gte(appointments.date, fromDate), lte(appointments.date, toDate)))
      .orderBy(asc(appointments.date), asc(appointments.startTime))
  )

  const ids = rows.map((r) => r.id)
  const serviceRows = ids.length
    ? await withClaims(claims, (tx) =>
        tx
          .select({
            appointmentId: appointmentServices.appointmentId,
            productId: appointmentServices.productId,
            professionalId: appointmentServices.professionalId,
          })
          .from(appointmentServices)
          .where(inArray(appointmentServices.appointmentId, ids))
      )
    : []
  const servicesByAppt = new Map<string, CompletedService[]>()
  for (const s of serviceRows) {
    if (!s.productId) continue
    const list = servicesByAppt.get(s.appointmentId) ?? []
    list.push({ productId: s.productId, professionalId: s.professionalId })
    servicesByAppt.set(s.appointmentId, list)
  }

  return rows.map((r) => ({
    id: r.id,
    contact_id: r.contact_id,
    conversation_id: r.conversation_id,
    assigned_to: r.assigned_to,
    title: r.title,
    notes: r.notes,
    date: r.date,
    start_time: r.start_time,
    end_time: r.end_time,
    status: r.status as DBAppointmentRow['status'],
    contacts: { id: r.c_id, whatsapp_name: r.c_wname, custom_name: r.c_custom, whatsapp_number: r.c_number },
    services: servicesByAppt.get(r.id) ?? [],
  }))
}

/** Catálogo e equipe pro modal de conclusão do atendimento. */
export async function getCompletionOptions(): Promise<CompletionOptions> {
  const claims = await claimsOrThrow()
  return withClaims(claims, async (tx) => {
    const productRows = await tx
      .select({ id: products.id, name: products.name, price: products.price })
      .from(products)
      .where(eq(products.tenantId, claims.tenant_id!))
      .orderBy(asc(products.name))
    const userRows = await tx
      .select({ id: users.id, name: users.fullName })
      .from(users)
      .where(and(eq(users.tenantId, claims.tenant_id!), eq(users.active, true)))
      .orderBy(asc(users.fullName))
    return {
      products: productRows.map((p) => ({ id: p.id, name: p.name, price: Number(p.price ?? 0) })),
      professionals: userRows,
      currentUserId: claims.sub,
    }
  })
}

export interface AppointmentInput {
  id?: string
  contactId: string
  contactName: string
  contactPhone: string
  conversationId?: string
  assignedTo?: string
  title: string | null
  notes: string | null
  date: string
  startTime: string
  endTime: string
  status: 'pending' | 'confirmed' | 'cancelled' | 'completed' | 'no_show'
  /** Só considerado quando status = 'completed'; substitui os serviços já registrados. */
  services?: CompletedService[]
}

export async function saveAppointment(input: AppointmentInput): Promise<void> {
  const claims = await claimsOrThrow()

  await withClaims(claims, async (tx) => {
    // Resolve o contato: existente por telefone, ou cria um novo.
    let contactId = input.contactId
    if (!contactId || contactId.startsWith('c')) {
      const phone = input.contactPhone.replace(/\D/g, '')
      const existing = await tx
        .select({ id: contacts.id })
        .from(contacts)
        .where(ilike(contacts.whatsappNumber, `%${phone}%`))
        .limit(1)

      if (existing[0]) {
        contactId = existing[0].id
      } else {
        const created = await tx
          .insert(contacts)
          .values({ tenantId: claims.tenant_id!, whatsappNumber: input.contactPhone, customName: input.contactName })
          .returning({ id: contacts.id })
        contactId = created[0].id
      }
    }

    const values = {
      contactId,
      conversationId: input.conversationId ?? null,
      assignedTo: input.assignedTo ?? null,
      title: input.title,
      notes: input.notes,
      date: input.date,
      startTime: input.startTime,
      endTime: input.endTime,
      status: input.status,
    }

    let appointmentId = input.id
    if (appointmentId) {
      await tx.update(appointments).set({ ...values, updatedAt: new Date() }).where(eq(appointments.id, appointmentId))
    } else {
      const created = await tx
        .insert(appointments)
        .values({ ...values, tenantId: claims.tenant_id! })
        .returning({ id: appointments.id })
      appointmentId = created[0].id
    }

    if (input.status === 'completed' && input.services) {
      await replaceCompletedServices(tx, claims.tenant_id!, appointmentId, input.services)
    }
  })

  revalidatePath('/appointments')
  revalidatePath('/contacts', 'layout')
  await triggerEvent(tenantChannel(claims.tenant_id!), 'appointment:changed', {})
}

type Tx = Parameters<Parameters<typeof withClaims>[1]>[0]

/**
 * Regrava os serviços do atendimento concluído. Nome e preço são lidos do
 * catálogo aqui no servidor (nunca do client) e congelados na linha; produto
 * e profissional precisam ser do próprio tenant.
 */
async function replaceCompletedServices(
  tx: Tx,
  tenantId: string,
  appointmentId: string,
  services: CompletedService[]
) {
  const productIds = [...new Set(services.map((s) => s.productId))]
  const professionalIds = [...new Set(services.flatMap((s) => (s.professionalId ? [s.professionalId] : [])))]

  const catalog = productIds.length
    ? await tx
        .select({ id: products.id, name: products.name, price: products.price })
        .from(products)
        .where(and(eq(products.tenantId, tenantId), inArray(products.id, productIds)))
    : []
  const team = professionalIds.length
    ? await tx
        .select({ id: users.id })
        .from(users)
        .where(and(eq(users.tenantId, tenantId), inArray(users.id, professionalIds)))
    : []

  const productById = new Map(catalog.map((p) => [p.id, p]))
  const validPros = new Set(team.map((u) => u.id))

  const rows = services.flatMap((s) => {
    const product = productById.get(s.productId)
    if (!product) return []
    return [{
      tenantId,
      appointmentId,
      productId: product.id,
      serviceName: product.name,
      price: String(product.price ?? 0),
      professionalId: s.professionalId && validPros.has(s.professionalId) ? s.professionalId : null,
    }]
  })

  await tx.delete(appointmentServices).where(eq(appointmentServices.appointmentId, appointmentId))
  if (rows.length) await tx.insert(appointmentServices).values(rows)
}
