// Lembretes de agendamento (24h e 1h antes) — porta de
// supabase/functions/schedule-reminder/index.ts. Antes disparado por
// pg_cron+pg_net a cada 15min; aqui via node-cron no mesmo processo.

import { pool } from '../db/index.js'
import { getEvolutionClient } from '../shared/evolution-client.js'
import { zonedWallTimeToDate } from '../shared/timezone.js'
import { isContactBlockedByTags } from '../shared/contact-block.js'

const ENCRYPTION_KEY = process.env.ENCRYPTION_KEY ?? null

interface AppointmentRow {
  id: string
  tenant_id: string
  date: string
  start_time: string
  title: string | null
  contact_number: string
  contact_custom_name: string | null
  contact_whatsapp_name: string | null
  contact_tags: string[]
  whatsapp_label_names: string[] | null
  blocked_labels: string[]
  evolution_instance_name: string | null
  timezone: string | null
}

export function formatTime(time: string): string {
  const [h, m] = time.split(':')
  return `${h}h${m !== '00' ? m : ''}`
}

export function formatDateBR(dateStr: string): string {
  const [year, month, day] = dateStr.split('-')
  return `${day}/${month}/${year}`
}

// O driver `pg` sempre serializa TIME com segundos (ex: "18:06:00"), então
// concatenar ":00" direto (como fazia o código original) gera uma string
// malformada tipo "...T18:06:00:00". Normaliza pra HH:MM antes de montar o
// datetime — evita Invalid Date silencioso e o cálculo de janela quebrar.
export function toHM(time: string): string {
  return time.slice(0, 5)
}

async function fetchCandidates(column: 'reminder_24h_sent' | 'reminder_1h_sent'): Promise<AppointmentRow[]> {
  const res = await pool.query<AppointmentRow>(
    `select a.id, a.tenant_id, a.date, a.start_time, a.title,
            c.whatsapp_number as contact_number, c.custom_name as contact_custom_name, c.whatsapp_name as contact_whatsapp_name,
            c.tags as contact_tags,
            (select array_agg(distinct lower(wl.name)) from whatsapp_label_associations wla
             join whatsapp_labels wl on wl.tenant_id = wla.tenant_id and wl.label_id = wla.label_id and wl.deleted = false
             where wla.tenant_id = c.tenant_id and wla.labeled = true
               and wla.jid in (c.whatsapp_lid, c.whatsapp_number || '@s.whatsapp.net')) as whatsapp_label_names,
            t.blocked_labels as blocked_labels,
            t.evolution_instance_name, t.timezone
     from appointments a
     join contacts c on c.id = a.contact_id
     join tenants t on t.id = a.tenant_id
     where a.${column} = false and a.status not in ('cancelled', 'completed')`
  )
  return res.rows
}

export async function runScheduleReminder(): Promise<{ sent24h: number; sent1h: number }> {
  const now = new Date()
  let sent24 = 0
  let sent1h = 0

  for (const appt of await fetchCandidates('reminder_24h_sent')) {
    try {
      const apptDateTime = zonedWallTimeToDate(appt.date, toHM(appt.start_time), appt.timezone ?? 'America/Sao_Paulo')
      const diffHours = (apptDateTime.getTime() - now.getTime()) / (1000 * 60 * 60)
      if (diffHours < 23 || diffHours > 25) continue
      if (!appt.evolution_instance_name) continue
      // Trava configurável por tenant: contato com qualquer uma das etiquetas
      // cadastradas em tenants.blocked_labels — nunca recebe lembrete
      // automático. Marca como enviado pra não ficar reprocessando pra
      // sempre a cada execução do cron.
      if (isContactBlockedByTags(appt.blocked_labels, appt.contact_tags, appt.whatsapp_label_names)) {
        await pool.query(`update appointments set reminder_24h_sent = true where id = $1`, [appt.id])
        continue
      }

      const evo = await getEvolutionClient(appt.tenant_id, ENCRYPTION_KEY)
      const contactName = appt.contact_custom_name ?? appt.contact_whatsapp_name ?? 'Cliente'
      const service = appt.title ? ` para *${appt.title}*` : ''
      const message =
        `Oi, ${contactName}! 👋\n\n` +
        `Passando só pra lembrar do seu horário${service} amanhã, ` +
        `*${formatDateBR(appt.date)}* às *${formatTime(appt.start_time)}*.\n\n` +
        `Qualquer coisa é só me chamar aqui 😊`

      await evo.sendText(appt.contact_number, message)
      await pool.query(`update appointments set reminder_24h_sent = true where id = $1`, [appt.id])
      sent24++
    } catch (err) {
      console.error(`[schedule-reminder] Erro no lembrete 24h do agendamento ${appt.id}:`, err)
    }
  }

  for (const appt of await fetchCandidates('reminder_1h_sent')) {
    try {
      const apptDateTime = zonedWallTimeToDate(appt.date, toHM(appt.start_time), appt.timezone ?? 'America/Sao_Paulo')
      const diffMinutes = (apptDateTime.getTime() - now.getTime()) / (1000 * 60)
      if (diffMinutes < 50 || diffMinutes > 70) continue
      if (!appt.evolution_instance_name) continue
      if (isContactBlockedByTags(appt.blocked_labels, appt.contact_tags, appt.whatsapp_label_names)) {
        await pool.query(`update appointments set reminder_1h_sent = true where id = $1`, [appt.id])
        continue
      }

      const evo = await getEvolutionClient(appt.tenant_id, ENCRYPTION_KEY)
      const contactName = appt.contact_custom_name ?? appt.contact_whatsapp_name ?? 'Cliente'
      const service = appt.title ? ` (${appt.title})` : ''
      const message =
        `Oi, ${contactName}! ⏰\n\n` +
        `Seu horário${service} é daqui a pouco, ` +
        `às *${formatTime(appt.start_time)}* (aproximadamente 1 hora).\n\n` +
        `Te espero! 😊`

      await evo.sendText(appt.contact_number, message)
      await pool.query(`update appointments set reminder_1h_sent = true where id = $1`, [appt.id])
      sent1h++
    } catch (err) {
      console.error(`[schedule-reminder] Erro no lembrete 1h do agendamento ${appt.id}:`, err)
    }
  }

  console.log(`[schedule-reminder] Enviados: ${sent24} lembretes 24h, ${sent1h} lembretes 1h`)
  return { sent24h: sent24, sent1h }
}
