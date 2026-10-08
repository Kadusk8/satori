// Registro de consumo de tokens do LLM por chamada (tabela ai_usage_logs).
// Nunca lança: falha ao registrar consumo não pode derrubar o atendimento.

import { pool } from '../db/index.js'
import type { LLMProvider, LLMUsage } from './llm-client.js'

export async function recordLLMUsage(params: {
  tenantId: string
  aiAgentId?: string | null
  conversationId?: string | null
  provider: LLMProvider
  source: 'message' | 'follow_up'
  usage: LLMUsage
}): Promise<void> {
  try {
    await pool.query(
      `insert into ai_usage_logs
         (tenant_id, ai_agent_id, conversation_id, provider, model, source, input_tokens, output_tokens, cached_input_tokens)
       values ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
      [
        params.tenantId,
        params.aiAgentId ?? null,
        params.conversationId ?? null,
        params.provider,
        params.usage.model,
        params.source,
        params.usage.inputTokens,
        params.usage.outputTokens,
        params.usage.cachedInputTokens,
      ]
    )
  } catch (err) {
    console.error('[llm-usage] Erro ao registrar consumo de tokens:', err)
  }
}
