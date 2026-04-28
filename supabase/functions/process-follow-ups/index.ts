// Edge function: processa follow-ups pendentes
// Chamada a cada 60 minutos pelo pg_cron.
// Para cada follow-up pendente com scheduled_at <= now():
//   1. Gera mensagem personalizada com Claude usando o contexto da conversa
//   2. Envia via WhatsApp
//   3. Se attempt < max, agenda o próximo. Senão, marca max_reached.

import { createAdminClient } from '../_shared/supabase-admin.ts'
import { callLLM } from '../_shared/llm-client.ts'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? ''
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
const ENCRYPTION_KEY = Deno.env.get('ENCRYPTION_KEY') ?? null

interface FollowUpRow {
  id: string
  tenant_id: string
  contact_id: string
  conversation_id: string
  ai_agent_id: string
  attempt_number: number
  context: string | null
  contacts: {
    whatsapp_number: string
    whatsapp_name: string | null
    custom_name: string | null
  }
  ai_agents: {
    id: string
    model: string
    system_prompt: string
    follow_up_delay_hours: number
    follow_up_max_attempts: number
    follow_up_message_template: string | null
  }
  tenants: {
    name: string
    timezone: string
    anthropic_api_key: string | null
    openai_api_key: string | null
    gemini_api_key: string | null
  }
}

interface LlmKeys {
  anthropic_api_key: string | null
  openai_api_key: string | null
  gemini_api_key: string | null
}

async function generateFollowUpMessage(
  agent: FollowUpRow['ai_agents'],
  contact: FollowUpRow['contacts'],
  tenant: FollowUpRow['tenants'],
  llmKeys: LlmKeys,
  context: string | null,
  attemptNumber: number
): Promise<string> {
  const tenantName = tenant.name
  // Se tem template configurado, usa ele diretamente
  if (agent.follow_up_message_template) {
    return agent.follow_up_message_template
      .replace('{nome_cliente}', contact.custom_name ?? contact.whatsapp_name ?? 'cliente')
      .replace('{nome_empresa}', tenantName)
      .replace('{tentativa}', String(attemptNumber))
  }

  // Senão, pede para a Claude gerar uma mensagem personalizada
  const contactName = contact.custom_name ?? contact.whatsapp_name ?? 'cliente'

  const systemPrompt = `${agent.system_prompt}

## Tarefa específica
Você está enviando uma mensagem de follow-up para um cliente que não respondeu.
A mensagem deve ser:
- Curta (máx 3 linhas)
- Simpática e não invasiva
- Mencionar brevemente o contexto anterior se disponível
- Não deve parecer uma mensagem automática/robô
- Não usar listas ou formatação complexa — apenas texto natural
- Terminar com uma pergunta aberta simples

Esta é a tentativa número ${attemptNumber}. Ajuste o tom conforme necessário
(tentativa 1: descontraído; tentativa 2: mais breve; tentativa 3: apenas perguntar se ainda há interesse).`

  const userMessage = context
    ? `Envie um follow-up para ${contactName}. Contexto da última conversa: "${context}"`
    : `Envie um follow-up para ${contactName}, que entrou em contato recentemente mas não respondeu.`

  try {
    const response = await callLLM({
      model: agent.model ?? 'claude-sonnet-4-20250514',
      system: systemPrompt,
      messages: [{ role: 'user', content: userMessage }],
      maxTokens: 200,
      temperature: 0.8,
      anthropicApiKey: llmKeys.anthropic_api_key ?? undefined,
      openaiApiKey: llmKeys.openai_api_key ?? undefined,
      geminiApiKey: llmKeys.gemini_api_key ?? undefined,
    })
    return response.text || `Oi ${contactName}! Tudo bem? Precisou de algo? 😊`
  } catch (err) {
    console.error('[process-follow-ups] Erro ao gerar mensagem:', err)
    return `Oi ${contactName}! Ainda posso te ajudar com algo? 😊`
  }
}

async function processFollowUp(
  supabase: ReturnType<typeof createAdminClient>,
  followUp: FollowUpRow
): Promise<void> {
  const agent = Array.isArray(followUp.ai_agents) ? followUp.ai_agents[0] : followUp.ai_agents
  const contact = Array.isArray(followUp.contacts) ? followUp.contacts[0] : followUp.contacts
  const tenant = Array.isArray(followUp.tenants) ? followUp.tenants[0] : followUp.tenants

  if (!agent || !contact || !tenant) {
    console.error(`[process-follow-ups] Dados incompletos para follow-up ${followUp.id}`)
    await supabase
      .from('follow_ups')
      .update({ status: 'cancelled' })
      .eq('id', followUp.id)
    return
  }

  // Verifica se a conversa foi respondida após o agendamento do follow-up
  const { data: conv } = await supabase
    .from('conversations')
    .select('status, last_message_at')
    .eq('id', followUp.conversation_id)
    .single()

  // Se a conversa foi fechada ou teve mensagem recente, cancela
  if (conv?.status === 'closed') {
    await supabase
      .from('follow_ups')
      .update({ status: 'cancelled' })
      .eq('id', followUp.id)
    return
  }

  // Descriptografa LLM keys via RPC. Fallback para colunas brutas enquanto
  // app.encryption_key não estiver configurado no banco.
  const { data: llmKeysRaw } = await supabase
    .rpc('get_tenant_llm_keys', { p_tenant_id: followUp.tenant_id, p_enc_key: ENCRYPTION_KEY })
  const llmKeys: LlmKeys = {
    anthropic_api_key: (llmKeysRaw?.anthropic_api_key as string | null) ?? tenant.anthropic_api_key,
    openai_api_key: (llmKeysRaw?.openai_api_key as string | null) ?? tenant.openai_api_key,
    gemini_api_key: (llmKeysRaw?.gemini_api_key as string | null) ?? tenant.gemini_api_key,
  }

  // Gera mensagem personalizada
  const message = await generateFollowUpMessage(
    agent,
    contact,
    tenant,
    llmKeys,
    followUp.context,
    followUp.attempt_number
  )

  // Envia via WhatsApp
  const sendRes = await fetch(`${SUPABASE_URL}/functions/v1/send-whatsapp`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${SERVICE_ROLE_KEY}`,
    },
    body: JSON.stringify({
      tenantId: followUp.tenant_id,
      to: contact.whatsapp_number,
      type: 'text',
      text: message,
      conversationId: followUp.conversation_id,
    }),
  })

  if (!sendRes.ok) {
    const errBody = await sendRes.text()
    console.error(`[process-follow-ups] Falha ao enviar WhatsApp para follow-up ${followUp.id}: ${errBody}`)
    // Não cancela — tenta novamente na próxima execução do cron
    return
  }

  // Salva mensagem na tabela messages
  await supabase.from('messages').insert({
    tenant_id: followUp.tenant_id,
    conversation_id: followUp.conversation_id,
    contact_id: followUp.contact_id,
    sender_type: 'ai',
    content: message,
    content_type: 'text',
  })

  const maxAttempts = agent.follow_up_max_attempts ?? 3
  const nextAttempt = followUp.attempt_number + 1

  if (nextAttempt > maxAttempts) {
    // Marca como max_reached — não agenda mais
    await supabase
      .from('follow_ups')
      .update({
        status: 'max_reached',
        sent_at: new Date().toISOString(),
        message_content: message,
      })
      .eq('id', followUp.id)
  } else {
    // Marca o atual como enviado e agenda o próximo
    const delayHours = agent.follow_up_delay_hours ?? 24
    const nextScheduledAt = new Date(Date.now() + delayHours * 60 * 60 * 1000).toISOString()

    await supabase
      .from('follow_ups')
      .update({
        status: 'sent',
        sent_at: new Date().toISOString(),
        message_content: message,
      })
      .eq('id', followUp.id)

    await supabase.from('follow_ups').insert({
      tenant_id: followUp.tenant_id,
      contact_id: followUp.contact_id,
      conversation_id: followUp.conversation_id,
      ai_agent_id: followUp.ai_agent_id,
      scheduled_at: nextScheduledAt,
      attempt_number: nextAttempt,
      status: 'pending',
      context: followUp.context,
    })
  }
}

// ── Handler principal ────────────────────────────────────────────────────────

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, {
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
      },
    })
  }

  // Aceita POST ou GET (pg_cron pode chamar sem body)
  if (req.method !== 'POST' && req.method !== 'GET') {
    return Response.json({ error: 'Método não permitido' }, { status: 405 })
  }

  const supabase = createAdminClient()

  try {
    // Busca todos os follow-ups pendentes com scheduled_at <= agora
    const { data: pending, error } = await supabase
      .from('follow_ups')
      .select(`
        id, tenant_id, contact_id, conversation_id, ai_agent_id,
        attempt_number, context,
        contacts ( whatsapp_number, whatsapp_name, custom_name ),
        ai_agents ( id, model, system_prompt, follow_up_delay_hours, follow_up_max_attempts, follow_up_message_template ),
        tenants ( name, timezone, anthropic_api_key, openai_api_key, gemini_api_key )
      `)
      .eq('status', 'pending')
      .lte('scheduled_at', new Date().toISOString())
      .limit(50) // processa no máximo 50 por vez para não estourar o tempo de execução

    if (error) {
      console.error('[process-follow-ups] Erro ao buscar pendentes:', error.message)
      return Response.json({ error: error.message }, { status: 500 })
    }

    if (!pending || pending.length === 0) {
      return Response.json({ processed: 0 })
    }

    console.log(`[process-follow-ups] Processando ${pending.length} follow-up(s)...`)

    // Processa em série para não sobrecarregar a Evolution API
    let processed = 0
    let failed = 0
    for (const followUp of pending) {
      try {
        await processFollowUp(supabase, followUp as unknown as FollowUpRow)
        processed++
      } catch (err) {
        failed++
        console.error(`[process-follow-ups] Erro ao processar ${followUp.id}:`, err)
      }
    }

    return Response.json({ processed, failed }, { headers: { 'Access-Control-Allow-Origin': '*' } })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Erro interno'
    console.error('[process-follow-ups]', message)
    return Response.json(
      { error: message },
      { status: 500, headers: { 'Access-Control-Allow-Origin': '*' } }
    )
  }
})
