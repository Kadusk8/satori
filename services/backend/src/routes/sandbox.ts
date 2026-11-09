import type { FastifyInstance } from 'fastify'
import { pool } from '../db/index.js'
import { processMessage } from '../core/process-message.js'
import { runInSandbox } from '../shared/sandbox.js'

const BACKEND_TOKEN = process.env.BACKEND_TOKEN

interface SandboxProcessBody {
  tenantId?: string
  conversationId?: string
}

// POST /sandbox/process — roda a IA de verdade numa conversa de TESTE (is_sandbox = true) criada
// pelo painel do tenant. Nada vai pro WhatsApp nem pra agenda (ver shared/sandbox.ts).
export async function sandboxRoutes(app: FastifyInstance) {
  app.post('/sandbox/process', async (request, reply) => {
    if (BACKEND_TOKEN) {
      const auth = request.headers.authorization
      if (auth !== `Bearer ${BACKEND_TOKEN}`) {
        return reply.code(401).send({ error: 'Não autorizado' })
      }
    }

    const { tenantId, conversationId } = (request.body ?? {}) as SandboxProcessBody
    if (!tenantId || !conversationId) {
      return reply.code(400).send({ error: 'tenantId e conversationId são obrigatórios' })
    }

    // Nunca confia no tenantId do input sozinho: a conversa tem que ser de teste e do próprio tenant.
    const check = await pool.query(
      `select 1 from conversations where id = $1 and tenant_id = $2 and is_sandbox = true`,
      [conversationId, tenantId]
    )
    if (check.rowCount === 0) {
      return reply.code(404).send({ error: 'Conversa de teste não encontrada' })
    }

    try {
      const result = await runInSandbox(() => processMessage(conversationId))
      return reply.send({ success: result.success, skipped: result.skipped ?? null })
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Erro interno'
      request.log.error({ err }, '[sandbox/process]')
      return reply.code(500).send({ error: message })
    }
  })
}
