// Utilitários de data para o calendário de agendamentos (sem dependências externas)
// Timezone do tenant: America/Sao_Paulo (padrão)

export const TIMEZONE = 'America/Sao_Paulo'

export interface AppointmentSlot {
  date: string  // YYYY-MM-DD
  startTime: string  // HH:MM
  endTime: string    // HH:MM
  available: boolean
}

export interface Appointment {
  id: string
  contactId: string
  contactName: string
  contactPhone: string
  conversationId?: string
  title: string | null
  notes: string | null
  date: string        // YYYY-MM-DD
  startTime: string   // HH:MM
  endTime: string     // HH:MM
  status: 'pending' | 'confirmed' | 'cancelled' | 'completed' | 'no_show'
  assignedTo?: string
}

// Formata data para exibição
export function formatDate(dateStr: string): string {
  return new Intl.DateTimeFormat('pt-BR', {
    weekday: 'short',
    day: '2-digit',
    month: 'short',
    timeZone: TIMEZONE,
  }).format(new Date(dateStr + 'T12:00:00'))
}

export function formatDateLong(dateStr: string): string {
  return new Intl.DateTimeFormat('pt-BR', {
    weekday: 'long',
    day: '2-digit',
    month: 'long',
    timeZone: TIMEZONE,
  }).format(new Date(dateStr + 'T12:00:00'))
}

// Retorna os 7 dias da semana a partir de uma data
export function getWeekDays(startDate: Date): string[] {
  const days: string[] = []
  for (let i = 0; i < 7; i++) {
    const d = new Date(startDate)
    d.setDate(d.getDate() + i)
    days.push(toDateString(d))
  }
  return days
}

// Retorna a segunda-feira da semana que contém a data
export function getWeekStart(date: Date): Date {
  const d = new Date(date)
  const day = d.getDay() // 0=dom, 1=seg...
  const diff = day === 0 ? -6 : 1 - day
  d.setDate(d.getDate() + diff)
  d.setHours(0, 0, 0, 0)
  return d
}

export function toDateString(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
}

export function todayString(): string {
  return toDateString(new Date())
}

// Gera slots de horário para um dia
export function generateSlots(
  date: string,
  existingAppointments: Appointment[],
  config: {
    startHour: number
    endHour: number
    slotMinutes: number
    durationMinutes: number
  }
): AppointmentSlot[] {
  const slots: AppointmentSlot[] = []
  const { startHour, endHour, slotMinutes, durationMinutes } = config

  for (let hour = startHour; hour < endHour; hour++) {
    for (let min = 0; min < 60; min += slotMinutes) {
      const startTime = `${String(hour).padStart(2, '0')}:${String(min).padStart(2, '0')}`
      const endMinutes = hour * 60 + min + durationMinutes
      const endTime = `${String(Math.floor(endMinutes / 60)).padStart(2, '0')}:${String(endMinutes % 60).padStart(2, '0')}`

      if (endMinutes > endHour * 60) break

      const overlaps = existingAppointments.some(
        (a) =>
          a.date === date &&
          a.status !== 'cancelled' &&
          a.startTime < endTime &&
          a.endTime > startTime
      )

      slots.push({ date, startTime, endTime, available: !overlaps })
    }
  }

  return slots
}

export const STATUS_CONFIG = {
  pending: { label: 'Pendente', class: 'bg-yellow-500/10 text-yellow-600' },
  confirmed: { label: 'Confirmado', class: 'bg-green-500/10 text-green-600' },
  cancelled: { label: 'Cancelado', class: 'bg-red-500/10 text-red-500' },
  completed: { label: 'Concluído', class: 'bg-blue-500/10 text-blue-600' },
  no_show: { label: 'Não compareceu', class: 'bg-gray-500/10 text-gray-500' },
}
