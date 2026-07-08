import type { FastifyInstance } from 'fastify'
import { findTenantByWebhookSecret, handleWebhookEvent } from '../core/webhook.js'

export async function webhookEvolutionRoutes(app: FastifyInstance) {
  app.post('/webhook-evolution', async (request, reply) => {
    const query = request.query as Record<string, string | undefined>
    const providedSecret = query.ts
    if (!providedSecret) {
      return reply.code(401).send({ error: 'not authorized' })
    }

    const tenant = await findTenantByWebhookSecret(providedSecret)
    if (!tenant) {
      return reply.code(401).send({ error: 'not authorized' })
    }

    const body = request.body as { event?: string; instance?: string; data?: unknown }
    const rawEventType = body?.event ?? ''
    request.log.info({ event: rawEventType, instance: body?.instance, data: body?.data }, '[webhook-evolution] payload recebido')
    if (!rawEventType) {
      return reply.code(400).send({ error: 'event é obrigatório' })
    }

    try {
      await handleWebhookEvent(tenant, rawEventType, body.data)
      return reply.send({ received: true })
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Erro interno'
      request.log.error({ err }, '[webhook-evolution]')
      return reply.send({ received: true, error: message })
    }
  })
}
