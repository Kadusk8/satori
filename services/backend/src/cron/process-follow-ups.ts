// Processa follow-ups pendentes — porta de
// supabase/functions/process-follow-ups/index.ts. Antes disparado por
// pg_cron+pg_net a cada 60min; aqui via node-cron no mesmo processo.
// Antes delegava o envio pra send-whatsapp via fetch interno; aqui chama a
// função diretamente (mesmo processo).

import { getTenantLlmKeys, getAgentLlmKey, pool } from '../db/index.js'
import { callLLM, type LLMProvider } from '../shared/llm-client.js'
import { sendWhatsAppMessage } from '../core/send-whatsapp.js'
import { isContactBlockedByTags } from '../shared/contact-block.js'

const ENCRYPTION_KEY = process.env.ENCRYPTION_KEY ?? null

interface FollowUpRow {
  id: string
  tenant_id: string
  contact_id: string
  conversation_id: string
  ai_agent_id: string
  attempt_number: number
  context: string | null
  contact_number: string
  contact_whatsapp_name: string | null
  contact_custom_name: string | null
  contact_tags: string[]
  whatsapp_label_names: string[] | null
  blocked_labels: string[]
  agent_model: string
  agent_system_prompt: string
  agent_follow_up_delay_hours: number
  agent_follow_up_max_attempts: number
  agent_follow_up_message_template: string | null
  agent_llm_provider: LLMProvider
  tenant_name: string
  tenant_anthropic_key: string | null
  tenant_openai_key: string | null
  tenant_gemini_key: string | null
}

async function generateFollowUpMessage(row: FollowUpRow, llmKeys: { anthropic_api_key: string | null; openai_api_key: string | null; gemini_api_key: string | null; openrouter_api_key: string | null }): Promise<string> {
  const contactName = row.contact_custom_name ?? row.contact_whatsapp_name ?? 'cliente'

  if (row.agent_follow_up_message_template) {
    return row.agent_follow_up_message_template
      .replace('{nome_cliente}', contactName)
      .replace('{nome_empresa}', row.tenant_name)
      .replace('{tentativa}', String(row.attempt_number))
  }

  const systemPrompt = `${row.agent_system_prompt}

## Tarefa específica
Você está enviando uma mensagem de follow-up para um cliente que não respondeu.
A mensagem deve ser:
- Curta (máx 3 linhas)
- Simpática e não invasiva
- Mencionar brevemente o contexto anterior se disponível
- Não deve parecer uma mensagem automática/robô
- Não usar listas ou formatação complexa — apenas texto natural
- Terminar com uma pergunta aberta simples

Esta é a tentativa número ${row.attempt_number}. Ajuste o tom conforme necessário
(tentativa 1: descontraído; tentativa 2: mais breve; tentativa 3: apenas perguntar se ainda há interesse).`

  const userMessage = row.context
    ? `Envie um follow-up para ${contactName}. Contexto da última conversa: "${row.context}"`
    : `Envie um follow-up para ${contactName}, que entrou em contato recentemente mas não respondeu.`

  try {
    const response = await callLLM({
      model: row.agent_model ?? 'claude-sonnet-4-20250514',
      system: systemPrompt,
      messages: [{ role: 'user', content: userMessage }],
      maxTokens: 200,
      temperature: 0.8,
      provider: row.agent_llm_provider ?? 'anthropic',
      anthropicApiKey: llmKeys.anthropic_api_key ?? undefined,
      openaiApiKey: llmKeys.openai_api_key ?? undefined,
      geminiApiKey: llmKeys.gemini_api_key ?? undefined,
      openrouterApiKey: llmKeys.openrouter_api_key ?? undefined,
    })
    return response.text || `Oi ${contactName}! Tudo bem? Precisou de algo? 😊`
  } catch (err) {
    console.error('[process-follow-ups] Erro ao gerar mensagem:', err)
    return `Oi ${contactName}! Ainda posso te ajudar com algo? 😊`
  }
}

async function processFollowUp(row: FollowUpRow): Promise<void> {
  const convRes = await pool.query<{ status: string }>(`select status from conversations where id = $1`, [row.conversation_id])
  if (convRes.rows[0]?.status === 'closed') {
    await pool.query(`update follow_ups set status = 'cancelled' where id = $1`, [row.id])
    return
  }

  // Trava configurável por tenant: contato com qualquer uma das etiquetas
  // cadastradas em tenants.blocked_labels (CRM ou nativas do WhatsApp) —
  // nunca recebe follow-up automático.
  if (isContactBlockedByTags(row.blocked_labels, row.contact_tags, row.whatsapp_label_names)) {
    await pool.query(`update follow_ups set status = 'cancelled' where id = $1`, [row.id])
    return
  }

  const llmKeysRaw = await getTenantLlmKeys(row.tenant_id, ENCRYPTION_KEY)
  const agentLlmKey = await getAgentLlmKey(row.ai_agent_id, ENCRYPTION_KEY)
  const provider = row.agent_llm_provider ?? 'anthropic'
  const llmKeys = {
    anthropic_api_key: (provider === 'anthropic' ? agentLlmKey : null) ?? llmKeysRaw?.anthropic_api_key ?? row.tenant_anthropic_key,
    openai_api_key: (provider === 'openai' ? agentLlmKey : null) ?? llmKeysRaw?.openai_api_key ?? row.tenant_openai_key,
    gemini_api_key: (provider === 'gemini' ? agentLlmKey : null) ?? llmKeysRaw?.gemini_api_key ?? row.tenant_gemini_key,
    openrouter_api_key: provider === 'openrouter' ? agentLlmKey : null,
  }

  const message = await generateFollowUpMessage(row, llmKeys)

  try {
    await sendWhatsAppMessage({
      tenantId: row.tenant_id,
      to: row.contact_number,
      type: 'text',
      text: message,
      conversationId: row.conversation_id,
    })
  } catch (err) {
    console.error(`[process-follow-ups] Falha ao enviar WhatsApp para follow-up ${row.id}:`, err)
    // Não cancela — tenta novamente na próxima execução do cron
    return
  }

  const maxAttempts = row.agent_follow_up_max_attempts ?? 3
  const nextAttempt = row.attempt_number + 1

  if (nextAttempt > maxAttempts) {
    await pool.query(`update follow_ups set status = 'max_reached', sent_at = now(), message_content = $1 where id = $2`, [message, row.id])
  } else {
    const delayHours = row.agent_follow_up_delay_hours ?? 24
    const nextScheduledAt = new Date(Date.now() + delayHours * 60 * 60 * 1000)

    await pool.query(`update follow_ups set status = 'sent', sent_at = now(), message_content = $1 where id = $2`, [message, row.id])
    await pool.query(
      `insert into follow_ups (tenant_id, contact_id, conversation_id, ai_agent_id, scheduled_at, attempt_number, status, context)
       values ($1, $2, $3, $4, $5, $6, 'pending', $7)`,
      [row.tenant_id, row.contact_id, row.conversation_id, row.ai_agent_id, nextScheduledAt.toISOString(), nextAttempt, row.context]
    )
  }
}

export async function runProcessFollowUps(): Promise<{ processed: number; failed: number }> {
  const res = await pool.query<FollowUpRow>(
    `select f.id, f.tenant_id, f.contact_id, f.conversation_id, f.ai_agent_id, f.attempt_number, f.context,
            c.whatsapp_number as contact_number, c.whatsapp_name as contact_whatsapp_name, c.custom_name as contact_custom_name,
            c.tags as contact_tags,
            (select array_agg(distinct lower(wl.name)) from whatsapp_label_associations wla
             join whatsapp_labels wl on wl.tenant_id = wla.tenant_id and wl.label_id = wla.label_id and wl.deleted = false
             where wla.tenant_id = c.tenant_id and wla.labeled = true
               and wla.jid in (c.whatsapp_lid, c.whatsapp_number || '@s.whatsapp.net')) as whatsapp_label_names,
            t.blocked_labels as blocked_labels,
            ag.model as agent_model, ag.system_prompt as agent_system_prompt,
            ag.follow_up_delay_hours as agent_follow_up_delay_hours, ag.follow_up_max_attempts as agent_follow_up_max_attempts,
            ag.follow_up_message_template as agent_follow_up_message_template,
            ag.llm_provider as agent_llm_provider,
            t.name as tenant_name, t.anthropic_api_key as tenant_anthropic_key,
            t.openai_api_key as tenant_openai_key, t.gemini_api_key as tenant_gemini_key
     from follow_ups f
     join contacts c on c.id = f.contact_id
     join ai_agents ag on ag.id = f.ai_agent_id
     join tenants t on t.id = f.tenant_id
     where f.status = 'pending' and f.scheduled_at <= now()
     limit 50`
  )

  if (res.rows.length === 0) return { processed: 0, failed: 0 }

  console.log(`[process-follow-ups] Processando ${res.rows.length} follow-up(s)...`)

  let processed = 0
  let failed = 0
  for (const row of res.rows) {
    try {
      await processFollowUp(row)
      processed++
    } catch (err) {
      failed++
      console.error(`[process-follow-ups] Erro ao processar ${row.id}:`, err)
    }
  }

  return { processed, failed }
}
