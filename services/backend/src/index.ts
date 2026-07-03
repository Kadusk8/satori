import Fastify from 'fastify'
import cron from 'node-cron'
import { webhookEvolutionRoutes } from './routes/webhook-evolution.js'
import { sendWhatsappRoutes } from './routes/send-whatsapp.js'
import { runScheduleReminder } from './cron/schedule-reminder.js'
import { runProcessFollowUps } from './cron/process-follow-ups.js'

const app = Fastify({ logger: true })

app.get('/health', async () => ({ ok: true }))

await app.register(webhookEvolutionRoutes)
await app.register(sendWhatsappRoutes)

// Lembretes de agendamento: a cada 15 minutos (equivalente ao pg_cron antigo)
cron.schedule('*/15 * * * *', () => {
  runScheduleReminder().catch((err) => app.log.error({ err }, '[cron] schedule-reminder falhou'))
})

// Follow-ups pendentes: a cada 60 minutos
cron.schedule('0 * * * *', () => {
  runProcessFollowUps().catch((err) => app.log.error({ err }, '[cron] process-follow-ups falhou'))
})

const port = Number(process.env.PORT ?? 3001)
app.listen({ port, host: '0.0.0.0' }).catch((err) => {
  app.log.error(err)
  process.exit(1)
})
