// schedule-reminder: busca agendamentos com lembrete pendente e envia via WhatsApp
// Chamado pelo pg_cron a cada 15 minutos

import { createAdminClient } from '../_shared/supabase-admin.ts'
import { getEvolutionClient } from '../_shared/evolution-client.ts'

interface AppointmentRow {
  id: string
  tenant_id: string
  date: string
  start_time: string
  title: string | null
  reminder_24h_sent: boolean
  reminder_1h_sent: boolean
  contacts: {
    whatsapp_number: string
    custom_name: string | null
    whatsapp_name: string | null
  }
  tenants: {
    evolution_instance_name: string | null
    timezone: string
  }
}

function formatTime(time: string): string {
  const [h, m] = time.split(':')
  return `${h}h${m !== '00' ? m : ''}`
}

function formatDateBR(dateStr: string): string {
  const [year, month, day] = dateStr.split('-')
  return `${day}/${month}/${year}`
}

Deno.serve(async (req: Request) => {
  // Aceita apenas POST (pg_cron usa POST)
  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), { status: 405 })
  }

  const supabase = createAdminClient()
  const now = new Date()

  // ── 1. Lembretes de 24h ──────────────────────────────────────────────────
  // Busca agendamentos onde faltam entre 23h e 25h (janela de 2h para tolerar variação do cron)
  const { data: appointments24h, error: err24 } = await supabase
    .from('appointments')
    .select(`
      id, tenant_id, date, start_time, title, reminder_24h_sent, reminder_1h_sent,
      contacts ( whatsapp_number, custom_name, whatsapp_name ),
      tenants ( evolution_instance_name, timezone )
    `)
    .eq('reminder_24h_sent', false)
    .neq('status', 'cancelled')
    .neq('status', 'completed')
    .returns<AppointmentRow[]>()

  if (err24) {
    console.error('[schedule-reminder] Erro ao buscar lembretes 24h:', err24.message)
  }

  let sent24 = 0
  for (const appt of appointments24h ?? []) {
    try {
      const apptDateTime = new Date(`${appt.date}T${appt.start_time}:00`)
      const diffMs = apptDateTime.getTime() - now.getTime()
      const diffHours = diffMs / (1000 * 60 * 60)

      if (diffHours < 23 || diffHours > 25) continue

      if (!appt.tenants?.evolution_instance_name) continue

      const evo = await getEvolutionClient(appt.tenant_id)
      const contactName = appt.contacts.custom_name ?? appt.contacts.whatsapp_name ?? 'Cliente'
      const service = appt.title ? ` para *${appt.title}*` : ''
      const message =
        `Olá, ${contactName}! 👋\n\n` +
        `Lembrando que você tem um agendamento${service} amanhã, ` +
        `*${formatDateBR(appt.date)}* às *${formatTime(appt.start_time)}*.\n\n` +
        `Qualquer dúvida, estamos à disposição! 😊`

      await evo.sendText(appt.contacts.whatsapp_number, message)

      await supabase
        .from('appointments')
        .update({ reminder_24h_sent: true })
        .eq('id', appt.id)

      sent24++
    } catch (err) {
      console.error(`[schedule-reminder] Erro no lembrete 24h do agendamento ${appt.id}:`, err)
    }
  }

  // ── 2. Lembretes de 1h ───────────────────────────────────────────────────
  // Janela de 50–70 minutos antes do agendamento
  const { data: appointments1h, error: err1 } = await supabase
    .from('appointments')
    .select(`
      id, tenant_id, date, start_time, title, reminder_24h_sent, reminder_1h_sent,
      contacts ( whatsapp_number, custom_name, whatsapp_name ),
      tenants ( evolution_instance_name, timezone )
    `)
    .eq('reminder_1h_sent', false)
    .neq('status', 'cancelled')
    .neq('status', 'completed')
    .returns<AppointmentRow[]>()

  if (err1) {
    console.error('[schedule-reminder] Erro ao buscar lembretes 1h:', err1.message)
  }

  let sent1h = 0
  for (const appt of appointments1h ?? []) {
    try {
      const apptDateTime = new Date(`${appt.date}T${appt.start_time}:00`)
      const diffMs = apptDateTime.getTime() - now.getTime()
      const diffMinutes = diffMs / (1000 * 60)

      if (diffMinutes < 50 || diffMinutes > 70) continue

      if (!appt.tenants?.evolution_instance_name) continue

      const evo = await getEvolutionClient(appt.tenant_id)
      const contactName = appt.contacts.custom_name ?? appt.contacts.whatsapp_name ?? 'Cliente'
      const service = appt.title ? ` (${appt.title})` : ''
      const message =
        `Olá, ${contactName}! ⏰\n\n` +
        `Seu agendamento${service} é em aproximadamente *1 hora*, ` +
        `às *${formatTime(appt.start_time)}*.\n\n` +
        `Te esperamos! 😊`

      await evo.sendText(appt.contacts.whatsapp_number, message)

      await supabase
        .from('appointments')
        .update({ reminder_1h_sent: true })
        .eq('id', appt.id)

      sent1h++
    } catch (err) {
      console.error(`[schedule-reminder] Erro no lembrete 1h do agendamento ${appt.id}:`, err)
    }
  }

  console.log(`[schedule-reminder] Enviados: ${sent24} lembretes 24h, ${sent1h} lembretes 1h`)

  return new Response(
    JSON.stringify({ ok: true, sent24h: sent24, sent1h }),
    { headers: { 'Content-Type': 'application/json' } }
  )
})
