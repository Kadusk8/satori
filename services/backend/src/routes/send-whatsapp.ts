import type { FastifyInstance } from 'fastify'
import { sendWhatsAppMessage, type SendWhatsAppPayload } from '../core/send-whatsapp.js'

const BACKEND_TOKEN = process.env.BACKEND_TOKEN

export async function sendWhatsappRoutes(app: FastifyInstance) {
  app.post('/send-whatsapp', async (request, reply) => {
    if (BACKEND_TOKEN) {
      const auth = request.headers.authorization
      if (auth !== `Bearer ${BACKEND_TOKEN}`) {
        return reply.code(401).send({ error: 'Não autorizado' })
      }
    }

    const payload = request.body as SendWhatsAppPayload
    if (!payload?.tenantId || !payload?.to) {
      return reply.code(400).send({ error: 'tenantId e to são obrigatórios' })
    }

    try {
      const result = await sendWhatsAppMessage(payload)
      return reply.send({ success: true, whatsappMessageId: result.whatsappMessageId })
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Erro interno'
      request.log.error({ err }, '[send-whatsapp]')
      return reply.code(500).send({ error: message })
    }
  })
}
