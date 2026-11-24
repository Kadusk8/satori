import type { FastifyInstance } from 'fastify'
import { pool } from '../db/index.js'
import { isValidBackendAuth } from '../shared/backend-token.js'
import { sendWhatsAppMessage, type SendWhatsAppPayload } from '../core/send-whatsapp.js'

export async function sendWhatsappRoutes(app: FastifyInstance) {
  app.post('/send-whatsapp', async (request, reply) => {
    if (!isValidBackendAuth(request.headers.authorization)) {
      return reply.code(401).send({ error: 'Não autorizado' })
    }

    const payload = request.body as SendWhatsAppPayload
    if (!payload?.tenantId || !payload?.to) {
      return reply.code(400).send({ error: 'tenantId e to são obrigatórios' })
    }

    // Defesa em profundidade: o token é único, então o backend confere que o destinatário é contato
    // do tenant informado (e, se vier, que a conversa também é) antes de enviar qualquer coisa.
    const owned = await pool.query(
      payload.conversationId
        ? `select 1 from conversations cv join contacts c on c.id = cv.contact_id
           where cv.id = $3 and cv.tenant_id = $1 and c.tenant_id = $1 and c.whatsapp_number = $2`
        : `select 1 from contacts where tenant_id = $1 and whatsapp_number = $2`,
      payload.conversationId ? [payload.tenantId, payload.to, payload.conversationId] : [payload.tenantId, payload.to]
    )
    if (owned.rowCount === 0) {
      return reply.code(404).send({ error: 'Contato ou conversa não pertence ao tenant' })
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
