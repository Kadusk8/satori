import Fastify from 'fastify'
import rateLimit from '@fastify/rate-limit'
import cron from 'node-cron'
import { webhookEvolutionRoutes } from './routes/webhook-evolution.js'
import { sendWhatsappRoutes } from './routes/send-whatsapp.js'
import { runScheduleReminder } from './cron/schedule-reminder.js'
import { runProcessFollowUps } from './cron/process-follow-ups.js'
import { runResetMonthlyMessageCounts } from './cron/reset-monthly-counts.js'

if (!process.env.BACKEND_TOKEN) {
  console.warn(
    '[startup] BACKEND_TOKEN não configurado — POST /send-whatsapp vai aceitar chamadas sem autenticação. Configure BACKEND_TOKEN antes de expor este serviço publicamente.'
  )
}

const app = Fastify({ logger: true })

// Proteção básica contra brute-force do webhook_secret (?ts=) e abuso geral —
// ambas as rotas são públicas (a Evolution Go não autentica webhooks de saída).
await app.register(rateLimit, {
  max: 100,
  timeWindow: '1 minute',
})

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

// Reset do contador mensal de mensagens: meia-noite do dia 1 de cada mês
// (equivalente ao job pg_cron 'reset-monthly-message-counts', comentado em
// neon/schema.sql por depender de pg_net/pg_cron indisponíveis no Neon).
cron.schedule('0 0 1 * *', () => {
  runResetMonthlyMessageCounts().catch((err) => app.log.error({ err }, '[cron] reset-monthly-counts falhou'))
})

const port = Number(process.env.PORT ?? 3001)
app.listen({ port, host: '0.0.0.0' }).catch((err) => {
  app.log.error(err)
  process.exit(1)
})
