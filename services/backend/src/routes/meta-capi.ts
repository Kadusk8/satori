// Rota de Meta Conversions API (WORKSTREAM C)
// Recebe eventos de Purchase quando um card é fechado no kanban.

import { FastifyPluginAsync } from 'fastify'
import { pool } from '../db/index.js'
import { sendConversionEvent } from '../shared/meta-capi-client.js'

const BACKEND_TOKEN = process.env.BACKEND_TOKEN

interface PurchaseEventBody {
  conversationId: string
  stageSlug: string
}

export const metaCapiRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.post<{ Body: PurchaseEventBody }>('/meta-capi/purchase', async (req, reply) => {
    // Autenticação: só o próprio frontend (com BACKEND_TOKEN) pode disparar
    // eventos de conversão — mesmo padrão de /send-whatsapp. Sem isso, qualquer
    // um que alcance o serviço poderia forjar conversões e sondar conversationId.
    if (BACKEND_TOKEN) {
      if (req.headers.authorization !== `Bearer ${BACKEND_TOKEN}`) {
        return reply.status(401).send({ error: 'Não autorizado' })
      }
    }

    const { conversationId, stageSlug } = req.body

    if (!conversationId) {
      return reply.status(400).send({ error: 'conversationId requerido' })
    }

    try {
      // Buscar conversa pra pegar tenant e metadata. O ctwaClid é gravado pelo
      // webhook em metadata.ad_referral.ctwaClid (aninhado), não na raiz.
      const convRes = await pool.query<{
        tenant_id: string
        metadata: { source?: string; ad_referral?: { ctwaClid?: string | null } } | null
      }>(`select tenant_id, metadata from conversations where id = $1`, [conversationId])

      const conv = convRes.rows[0]
      if (!conv) {
        return reply.status(404).send({ error: 'Conversa não encontrada' })
      }

      // Gatilho Purchase: só quando card vai pra "finalizado" ou equivalente (stage_slug='finalizado')
      // Ajustar conforme a lógica de "fechado/ganho" do tenant
      const ctwaClid = conv.metadata?.ad_referral?.ctwaClid
      if (stageSlug === 'finalizado' && conv.metadata?.source === 'ctwa_ad' && ctwaClid) {
        await sendConversionEvent({
          tenantId: conv.tenant_id,
          ctwaClid,
          eventName: 'Purchase',
        })
      }

      return reply.status(200).send({ ok: true })
    } catch (err) {
      fastify.log.error(`[meta-capi] Erro ao processar Purchase: ${err instanceof Error ? err.message : String(err)}`)
      return reply.status(500).send({ error: 'Erro ao processar evento' })
    }
  })
}
