'use server'

import { revalidatePath } from 'next/cache'
import { and, asc, eq, gte, ilike, lte } from 'drizzle-orm'
import { withClaims } from '@/lib/db'
import { appointments, contacts, tenants } from '@/lib/db/schema'
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
  }))
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

    if (input.id) {
      await tx.update(appointments).set({ ...values, updatedAt: new Date() }).where(eq(appointments.id, input.id))
    } else {
      await tx.insert(appointments).values({ ...values, tenantId: claims.tenant_id! })
    }
  })

  revalidatePath('/appointments')
  await triggerEvent(tenantChannel(claims.tenant_id!), 'appointment:changed', {})
}
