'use client'

export const dynamic = 'force-dynamic'

import { useState, useMemo, useCallback, useEffect } from 'react'
import { ChevronLeft, ChevronRight, Plus, Calendar, Clock, List, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { AppointmentForm } from '@/components/appointments/appointment-form'
import {
  type Appointment,
  formatDate,
  getWeekDays,
  getWeekStart,
  toDateString,
  todayString,
  generateSlots,
  STATUS_CONFIG,
} from '@/components/appointments/appointment-utils'
import { cn } from '@/lib/utils'
import { createClient } from '@/lib/supabase/client'
import { toast } from 'sonner'

// ── Tipos do banco ────────────────────────────────────────────────────────────

interface DBAppointment {
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
  contacts: {
    id: string
    whatsapp_name: string | null
    custom_name: string | null
    whatsapp_number: string
  }
}

interface DBTenant {
  appointment_duration_minutes: number
  appointment_slot_interval_minutes: number
  business_hours: Record<string, { start: string; end: string } | null>
}

function mapAppointment(row: DBAppointment): Appointment {
  return {
    id: row.id,
    contactId: row.contact_id,
    contactName: row.contacts.custom_name ?? row.contacts.whatsapp_name ?? row.contacts.whatsapp_number,
    contactPhone: row.contacts.whatsapp_number,
    conversationId: row.conversation_id ?? undefined,
    title: row.title,
    notes: row.notes,
    date: row.date,
    startTime: row.start_time,
    endTime: row.end_time,
    status: row.status,
    assignedTo: row.assigned_to ?? undefined,
  }
}

type ViewMode = 'week' | 'day' | 'list'

// ── AppointmentChip ───────────────────────────────────────────────────────────

function AppointmentChip({
  appointment,
  onClick,
}: {
  appointment: Appointment
  onClick: () => void
}) {
  const cfg = STATUS_CONFIG[appointment.status]
  return (
    <button
      onClick={onClick}
      className={cn(
        'w-full rounded-md px-2 py-1 text-left text-xs font-medium transition-opacity hover:opacity-80',
        cfg.class
      )}
    >
      <span className="block truncate">{appointment.contactName}</span>
      {appointment.title && (
        <span className="block truncate opacity-75">{appointment.title}</span>
      )}
    </button>
  )
}

// ── Componente principal ──────────────────────────────────────────────────────

export default function AppointmentsPage() {
  const [appointments, setAppointments] = useState<Appointment[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [slotConfig, setSlotConfig] = useState({
    startHour: 8,
    endHour: 18,
    slotMinutes: 30,
    durationMinutes: 30,
  })

  const [viewMode, setViewMode] = useState<ViewMode>('week')
  const [weekStart, setWeekStart] = useState(() => getWeekStart(new Date()))
  const [selectedDate, setSelectedDate] = useState(todayString())
  const [formState, setFormState] = useState<{
    open: boolean
    appointment: Appointment | null
    defaultDate?: string
    defaultTime?: string
  }>({ open: false, appointment: null })

  const weekDays = useMemo(() => getWeekDays(weekStart), [weekStart])
  const today = todayString()

  // ── Carrega tenant config + agendamentos ──────────────────────────────────

  const loadData = useCallback(async () => {
    const supabase = createClient()

    // Carrega configuração do tenant (horários e duração)
    const { data: { user } } = await supabase.auth.getUser()
    if (user) {
      const tenantId = user.user_metadata?.tenant_id ?? (user.app_metadata?.tenant_id as string | undefined)
      if (tenantId) {
        const { data: tenant } = await supabase
          .from('tenants')
          .select('appointment_duration_minutes, appointment_slot_interval_minutes, business_hours')
          .eq('id', tenantId)
          .single()

        if (tenant) {
          const t = tenant as unknown as DBTenant
          const hours = t.business_hours
          // Extrai hora de início/fim do primeiro dia útil configurado
          const days = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun']
          let startHour = 8
          let endHour = 18
          for (const day of days) {
            const dayConfig = hours?.[day]
            if (dayConfig) {
              startHour = parseInt(dayConfig.start.split(':')[0], 10)
              endHour = parseInt(dayConfig.end.split(':')[0], 10)
              break
            }
          }

          setSlotConfig({
            startHour,
            endHour,
            slotMinutes: t.appointment_slot_interval_minutes ?? 30,
            durationMinutes: t.appointment_duration_minutes ?? 30,
          })
        }
      }
    }

    // Carrega agendamentos (próximos 60 dias + últimos 7)
    const from = new Date()
    from.setDate(from.getDate() - 7)
    const to = new Date()
    to.setDate(to.getDate() + 60)

    const { data, error } = await supabase
      .from('appointments')
      .select(`
        id, contact_id, conversation_id, assigned_to, title, notes, date, start_time, end_time, status,
        contacts ( id, whatsapp_name, custom_name, whatsapp_number )
      `)
      .gte('date', toDateString(from))
      .lte('date', toDateString(to))
      .order('date', { ascending: true })
      .order('start_time', { ascending: true })

    if (error) {
      toast.error('Erro ao carregar agendamentos: ' + error.message)
      return
    }

    setAppointments((data ?? []).map((a) => mapAppointment(a as unknown as DBAppointment)))
  }, [])

  useEffect(() => {
    setIsLoading(true)
    loadData().finally(() => setIsLoading(false))
  }, [loadData])

  // ── Realtime: agendamentos ────────────────────────────────────────────────

  useEffect(() => {
    const supabase = createClient()
    const channel = supabase
      .channel('appointments-realtime')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'appointments' },
        async (payload) => {
          if (payload.eventType === 'DELETE') {
            setAppointments((prev) => prev.filter((a) => a.id !== (payload.old as { id: string }).id))
            return
          }

          const { data } = await supabase
            .from('appointments')
            .select(`
              id, contact_id, conversation_id, assigned_to, title, notes, date, start_time, end_time, status,
              contacts ( id, whatsapp_name, custom_name, whatsapp_number )
            `)
            .eq('id', (payload.new as { id: string }).id)
            .single()

          if (!data) return
          const mapped = mapAppointment(data as unknown as DBAppointment)

          setAppointments((prev) => {
            const exists = prev.find((a) => a.id === mapped.id)
            if (exists) return prev.map((a) => (a.id === mapped.id ? mapped : a))
            return [...prev, mapped].sort((a, b) =>
              `${a.date}${a.startTime}`.localeCompare(`${b.date}${b.startTime}`)
            )
          })
        }
      )
      .subscribe()

    return () => { supabase.removeChannel(channel) }
  }, [])

  // ── Slots para o dia selecionado ──────────────────────────────────────────

  const daySlots = useMemo(
    () => generateSlots(selectedDate, appointments, slotConfig),
    [selectedDate, appointments, slotConfig]
  )

  const hours = useMemo(() => {
    const h: string[] = []
    for (let i = slotConfig.startHour; i < slotConfig.endHour; i++) {
      h.push(`${String(i).padStart(2, '0')}:00`)
    }
    return h
  }, [slotConfig.startHour, slotConfig.endHour])

  // ── Navegação ─────────────────────────────────────────────────────────────

  const prevWeek = () => {
    const d = new Date(weekStart)
    d.setDate(d.getDate() - 7)
    setWeekStart(d)
  }

  const nextWeek = () => {
    const d = new Date(weekStart)
    d.setDate(d.getDate() + 7)
    setWeekStart(d)
  }

  const goToday = () => {
    setWeekStart(getWeekStart(new Date()))
    setSelectedDate(today)
  }

  // ── CRUD ──────────────────────────────────────────────────────────────────

  const handleSave = useCallback(async (data: Omit<Appointment, 'id'> & { id?: string }) => {
    const supabase = createClient()

    // Busca o contact_id pelo telefone ou usa o existente
    let contactId = data.contactId
    if (!contactId || contactId.startsWith('c')) {
      // Tenta buscar contato pelo telefone
      const phone = data.contactPhone.replace(/\D/g, '')
      const { data: contact } = await supabase
        .from('contacts')
        .select('id')
        .ilike('whatsapp_number', `%${phone}%`)
        .maybeSingle()

      if (contact) {
        contactId = contact.id
      } else {
        // Cria contato
        const { data: { user } } = await supabase.auth.getUser()
        const tenantId = user?.user_metadata?.tenant_id ?? user?.app_metadata?.tenant_id
        if (!tenantId) {
          toast.error('Tenant não identificado')
          return
        }

        const { data: newContact, error: contactError } = await supabase
          .from('contacts')
          .insert({
            tenant_id: tenantId,
            whatsapp_number: data.contactPhone,
            custom_name: data.contactName,
          })
          .select('id')
          .single()

        if (contactError || !newContact) {
          toast.error('Erro ao criar contato: ' + contactError?.message)
          return
        }
        contactId = newContact.id
      }
    }

    const payload = {
      contact_id: contactId,
      conversation_id: data.conversationId ?? null,
      assigned_to: data.assignedTo ?? null,
      title: data.title,
      notes: data.notes,
      date: data.date,
      start_time: data.startTime,
      end_time: data.endTime,
      status: data.status,
    }

    if (data.id) {
      const { error } = await supabase
        .from('appointments')
        .update(payload)
        .eq('id', data.id)

      if (error) {
        toast.error('Erro ao salvar agendamento: ' + error.message)
        return
      }
      toast.success('Agendamento atualizado.')
    } else {
      const { data: { user } } = await supabase.auth.getUser()
      const tenantId = user?.user_metadata?.tenant_id ?? user?.app_metadata?.tenant_id
      if (!tenantId) {
        toast.error('Tenant não identificado')
        return
      }

      const { error } = await supabase
        .from('appointments')
        .insert({ ...payload, tenant_id: tenantId })

      if (error) {
        toast.error('Erro ao criar agendamento: ' + error.message)
        return
      }
      toast.success('Agendamento criado.')
    }
    // Realtime atualiza a lista automaticamente
  }, [])

  const openNew = (date?: string, time?: string) =>
    setFormState({ open: true, appointment: null, defaultDate: date, defaultTime: time })

  const openEdit = (appointment: Appointment) =>
    setFormState({ open: true, appointment, defaultDate: appointment.date })

  // ── Visão semanal ─────────────────────────────────────────────────────────

  const WeekView = () => (
    <div className="flex-1 overflow-auto">
      <div className="grid sticky top-0 z-10 bg-background border-b" style={{ gridTemplateColumns: '64px repeat(7, 1fr)' }}>
        <div className="border-r" />
        {weekDays.map((day) => {
          const isToday = day === today
          const isSelected = day === selectedDate
          const label = formatDate(day)
          return (
            <button
              key={day}
              onClick={() => { setSelectedDate(day); setViewMode('day') }}
              className={cn(
                'flex flex-col items-center py-2 px-1 border-r text-xs font-medium transition-colors hover:bg-muted/50',
                isToday && 'text-primary',
                isSelected && 'bg-primary/5'
              )}
            >
              <span className="capitalize">{label.split(', ')[0]}</span>
              <span className={cn(
                'text-base font-semibold mt-0.5 h-7 w-7 rounded-full flex items-center justify-center',
                isToday && 'bg-primary text-primary-foreground'
              )}>
                {label.split(', ')[1]?.split(' ')[0]}
              </span>
            </button>
          )
        })}
      </div>

      <div className="relative">
        {hours.map((hour) => (
          <div
            key={hour}
            className="grid border-b"
            style={{ gridTemplateColumns: '64px repeat(7, 1fr)', minHeight: '56px' }}
          >
            <div className="border-r px-2 pt-1">
              <span className="text-xs text-muted-foreground">{hour}</span>
            </div>
            {weekDays.map((day) => {
              const dayApps = appointments.filter(
                (a) =>
                  a.date === day &&
                  a.startTime >= hour &&
                  a.startTime < `${String(Number(hour.split(':')[0]) + 1).padStart(2, '0')}:00`
              )
              return (
                <div
                  key={day}
                  className="border-r p-1 space-y-0.5 cursor-pointer hover:bg-muted/30 transition-colors"
                  onClick={() => openNew(day, hour)}
                >
                  {dayApps.map((a) => (
                    <AppointmentChip
                      key={a.id}
                      appointment={a}
                      onClick={(e?: React.MouseEvent) => {
                        e?.stopPropagation?.()
                        openEdit(a)
                      }}
                    />
                  ))}
                </div>
              )
            })}
          </div>
        ))}
      </div>
    </div>
  )

  // ── Visão dia ─────────────────────────────────────────────────────────────

  const DayView = () => (
    <div className="flex-1 overflow-auto p-6">
      <div className="max-w-lg mx-auto space-y-2">
        <h3 className="text-sm font-semibold text-muted-foreground mb-4 capitalize">
          {formatDate(selectedDate)}
        </h3>
        {daySlots.map((slot) => {
          const app = appointments.find(
            (a) => a.date === slot.date && a.startTime === slot.startTime && a.status !== 'cancelled'
          )
          return (
            <div
              key={slot.startTime}
              className={cn(
                'flex items-center gap-3 rounded-xl border px-4 py-2.5 transition-colors',
                app ? 'bg-primary/5 border-primary/20' : 'hover:bg-muted/40 cursor-pointer'
              )}
              onClick={() => !app && openNew(slot.date, slot.startTime)}
            >
              <span className="text-sm font-mono text-muted-foreground w-12 shrink-0">
                {slot.startTime}
              </span>
              {app ? (
                <div className="flex flex-1 items-center gap-3">
                  <div className="flex-1">
                    <p className="text-sm font-medium">{app.contactName}</p>
                    {app.title && <p className="text-xs text-muted-foreground">{app.title}</p>}
                  </div>
                  <span className={cn('rounded-full px-2 py-0.5 text-xs font-medium', STATUS_CONFIG[app.status].class)}>
                    {STATUS_CONFIG[app.status].label}
                  </span>
                  <Button variant="ghost" size="sm" onClick={(e) => { e.stopPropagation(); openEdit(app) }}>
                    Editar
                  </Button>
                </div>
              ) : (
                <span className="text-xs text-muted-foreground">Disponível — clique para agendar</span>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )

  // ── Visão lista ───────────────────────────────────────────────────────────

  const ListView = () => {
    const sorted = [...appointments].sort(
      (a, b) => `${a.date}${a.startTime}`.localeCompare(`${b.date}${b.startTime}`)
    )
    return (
      <div className="flex-1 overflow-auto p-6">
        <div className="max-w-2xl mx-auto rounded-lg border bg-background overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-muted/30">
                <th className="text-left font-medium text-muted-foreground px-4 py-3">Data</th>
                <th className="text-left font-medium text-muted-foreground px-4 py-3">Horário</th>
                <th className="text-left font-medium text-muted-foreground px-4 py-3">Cliente</th>
                <th className="text-left font-medium text-muted-foreground px-4 py-3">Serviço</th>
                <th className="text-left font-medium text-muted-foreground px-4 py-3">Status</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y">
              {sorted.map((a) => (
                <tr key={a.id} className="hover:bg-muted/30 transition-colors">
                  <td className="px-4 py-3 capitalize">{formatDate(a.date)}</td>
                  <td className="px-4 py-3 font-mono text-xs">{a.startTime}–{a.endTime}</td>
                  <td className="px-4 py-3">
                    <p className="font-medium">{a.contactName}</p>
                    <p className="text-xs text-muted-foreground">{a.contactPhone}</p>
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">{a.title ?? '—'}</td>
                  <td className="px-4 py-3">
                    <span className={cn('rounded-full px-2 py-0.5 text-xs font-medium', STATUS_CONFIG[a.status].class)}>
                      {STATUS_CONFIG[a.status].label}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <Button variant="ghost" size="sm" onClick={() => openEdit(a)}>
                      Editar
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {sorted.length === 0 && (
            <div className="py-12 text-center text-muted-foreground text-sm">
              Nenhum agendamento no período
            </div>
          )}
        </div>
      </div>
    )
  }

  // ── Loading ───────────────────────────────────────────────────────────────

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-screen text-muted-foreground text-sm gap-2">
        <Loader2 className="h-4 w-4 animate-spin" />
        Carregando agenda...
      </div>
    )
  }

  return (
    <div className="flex flex-col h-screen">
      {/* Header */}
      <div className="flex items-center gap-4 px-8 py-4 border-b bg-background shrink-0">
        <h1 className="text-xl font-bold">Agenda</h1>

        <div className="flex items-center gap-1 ml-4">
          <Button variant="outline" size="sm" className="h-8 w-8 p-0" onClick={prevWeek}>
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <span className="text-sm font-medium min-w-[160px] text-center">
            {formatDate(weekDays[0])} – {formatDate(weekDays[6])}
          </span>
          <Button variant="outline" size="sm" className="h-8 w-8 p-0" onClick={nextWeek}>
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>

        <Button variant="outline" size="sm" onClick={goToday}>Hoje</Button>

        <div className="ml-auto flex items-center gap-2">
          <div className="flex rounded-lg border overflow-hidden text-sm">
            {([
              { value: 'week', icon: Calendar, label: 'Semana' },
              { value: 'day', icon: Clock, label: 'Dia' },
              { value: 'list', icon: List, label: 'Lista' },
            ] as const).map((v) => (
              <button
                key={v.value}
                onClick={() => setViewMode(v.value)}
                className={cn(
                  'flex items-center gap-1.5 px-3 py-1.5 transition-colors text-xs',
                  viewMode === v.value
                    ? 'bg-primary text-primary-foreground'
                    : 'hover:bg-muted text-muted-foreground'
                )}
              >
                <v.icon className="h-3.5 w-3.5" />
                {v.label}
              </button>
            ))}
          </div>

          <Button onClick={() => openNew(selectedDate)} className="gap-2">
            <Plus className="h-4 w-4" />
            Agendar
          </Button>
        </div>
      </div>

      {/* Conteúdo */}
      {viewMode === 'week' && <WeekView />}
      {viewMode === 'day' && <DayView />}
      {viewMode === 'list' && <ListView />}

      {/* Modal */}
      {formState.open && (
        <AppointmentForm
          appointment={formState.appointment}
          defaultDate={formState.defaultDate}
          defaultStartTime={formState.defaultTime}
          slotDurationMinutes={slotConfig.durationMinutes}
          onSave={handleSave}
          onClose={() => setFormState({ open: false, appointment: null })}
        />
      )}
    </div>
  )
}
