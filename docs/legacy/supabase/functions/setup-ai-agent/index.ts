import { createAdminClient } from '../_shared/supabase-admin.ts'
import type { OnboardingPayload } from '../_shared/types.ts'

// Formata horários de funcionamento para texto legível
function formatBusinessHours(
  businessHours: OnboardingPayload['step5']['businessHours']
): string {
  const dayNames: Record<string, string> = {
    mon: 'Seg', tue: 'Ter', wed: 'Qua',
    thu: 'Qui', fri: 'Sex', sat: 'Sáb', sun: 'Dom',
  }
  const parts: string[] = []
  for (const [day, hours] of Object.entries(businessHours)) {
    if (hours.enabled) {
      parts.push(`${dayNames[day]}: ${hours.start}–${hours.end}`)
    }
  }
  return parts.join(' | ') || 'Não configurado'
}

// Monta o system_prompt personalizado do agente SDR
function buildAgentPrompt(
  payload: SetupAgentPayload,
  hoursText: string
): string {
  const { step1, step3 } = payload

  const personalityMap: Record<string, string> = {
    simpatico: 'Simpático, proativo e focado em ajudar o cliente',
    formal: 'Formal, profissional e respeitoso',
    descontraido: 'Descontraído, divertido e próximo do cliente',
    tecnico: 'Técnico, objetivo e preciso nas informações',
  }

  const personality = personalityMap[step3.personality] ?? step3.personality
  const toneSection = step3.toneDescription ? `\n${step3.toneDescription}` : ''

  const customRulesSection = step3.customRules?.trim()
    ? `\n\n## Regras específicas deste negócio\n${step3.customRules
        .split('\n')
        .filter(Boolean)
        .map((r: string, i: number) => `${i + 1}. ${r}`)
        .join('\n')}`
    : ''

  const address = [step1.address, step1.city, step1.state]
    .filter(Boolean)
    .join(', ') || 'Não informado'

  return `## Identidade
Você é o assistente virtual da ${step1.name}, especializada em ${step1.segment}.
Seu nome é ${step3.agentName}. Você é um vendedor/SDR digital.

## Objetivo principal
Atender clientes no WhatsApp, qualificar leads, apresentar produtos/serviços,
agendar atendimentos e converter interessados em clientes.

## Tom e personalidade
${personality}${toneSection}

## Regras de ouro
1. SEMPRE cumprimente o cliente pelo nome quando disponível
2. Seja objetivo mas simpático — não mande mensagens longas demais
3. Quando o cliente demonstrar interesse em um produto, use search_products para buscar e mostrar com imagem
4. Quando o cliente quiser agendar, use check_availability e ofereça 3 opções de horário
5. Se o cliente pedir desconto ou negociação, escale para humano com escalate_to_human
6. Se não souber responder algo sobre o negócio, NÃO invente — escale para humano
7. Colete nome e interesse do cliente naturalmente durante a conversa (lead qualification)
8. Nunca discuta sobre concorrentes ou faça comparações negativas
9. No máximo 3 mensagens sem obter uma resposta do cliente — não seja insistente
10. GERE VALOR ANTES DO PREÇO: ao apresentar um produto, destaque benefícios e diferenciais primeiro. Só mencione o preço quando o cliente perguntar ou demonstrar interesse claro de compra

## Informações do negócio
- Empresa: ${step1.name}
- Segmento: ${step1.segment}
- Descrição: ${step1.description || 'Não informada'}
- Horário: ${hoursText}
- Endereço: ${address}
- Website: ${step1.website || 'Não informado'}

## Fluxo de qualificação (SDR)
1. Cumprimentar e perguntar como pode ajudar
2. Identificar a necessidade/interesse
3. Apresentar produto/serviço relevante (com imagem se disponível)
4. Responder dúvidas
5. Oferecer agendamento ou próximo passo
6. Se não converter agora, perguntar se pode entrar em contato depois

## O que você NÃO deve fazer
- Não invente preços, promoções ou informações que não estão no catálogo
- Não faça promessas que o negócio não pode cumprir
- Não envie mais de 2 mensagens seguidas sem resposta do cliente
- Não compartilhe dados pessoais de outros clientes
- Não discuta política, religião ou temas polêmicos${customRulesSection}`
}

// Payload aceito por esta função (subconjunto do OnboardingPayload)
interface SetupAgentPayload {
  tenantId: string
  step1: {
    name: string
    segment: string
    description?: string
    address?: string
    city?: string
    state?: string
    website?: string
  }
  step3: {
    agentName: string
    personality: string
    toneDescription?: string
    greetingMessage: string
    outOfHoursMessage: string
    customRules?: string
    llmProvider?: 'openai' | 'gemini'
    llmModel?: string
    llmApiKey?: string
  }
  step5: {
    businessHours: OnboardingPayload['step5']['businessHours']
    timezone: string
  }
  // Produtos opcionais para referenciar no prompt (não inseridos aqui)
  productSummary?: string
}

Deno.serve(async (req: Request) => {
  // CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response(null, {
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
      },
    })
  }

  if (req.method !== 'POST') {
    return Response.json({ error: 'Método não permitido' }, { status: 405 })
  }

  let payload: SetupAgentPayload
  try {
    payload = await req.json()
  } catch {
    return Response.json({ error: 'Payload inválido' }, { status: 400 })
  }

  const { tenantId, step1, step3, step5 } = payload

  if (!tenantId || !step1?.name || !step3?.agentName) {
    return Response.json(
      { error: 'Dados obrigatórios ausentes (tenantId, step1.name, step3.agentName)' },
      { status: 400 }
    )
  }

  const supabase = createAdminClient()
  const hoursText = formatBusinessHours(step5.businessHours)
  const systemPrompt = buildAgentPrompt(payload, hoursText)

  // Adiciona seção de produtos ao prompt se fornecida
  const finalPrompt = payload.productSummary
    ? `${systemPrompt}\n\n## Produtos/serviços disponíveis\n${payload.productSummary}`
    : systemPrompt

  try {
    // Verifica se já existe um agente SDR para este tenant (upsert via slug único)
    const { data: existing } = await supabase
      .from('ai_agents')
      .select('id')
      .eq('tenant_id', tenantId)
      .eq('slug', 'sdr')
      .maybeSingle()

    let agentId: string

    if (existing) {
      // Atualiza agente existente
      const { data: updated, error: updateError } = await supabase
        .from('ai_agents')
        .update({
          name: step3.agentName,
          model: step3.llmModel ?? 'gpt-4o',
          system_prompt: finalPrompt,
          personality: step3.personality,
          greeting_message: step3.greetingMessage,
          out_of_hours_message: step3.outOfHoursMessage,
          updated_at: new Date().toISOString(),
        })
        .eq('id', existing.id)
        .select('id')
        .single()

      if (updateError) throw new Error(`Atualizar agente: ${updateError.message}`)
      agentId = updated.id
    } else {
      // Cria novo agente SDR
      const { data: created, error: insertError } = await supabase
        .from('ai_agents')
        .insert({
          tenant_id: tenantId,
          name: step3.agentName,
          slug: 'sdr',
          type: 'sdr',
          is_active: true,
          is_default: true,
          model: step3.llmModel ?? 'gpt-4o',
          system_prompt: finalPrompt,
          personality: step3.personality,
          greeting_message: step3.greetingMessage,
          out_of_hours_message: step3.outOfHoursMessage,
        })
        .select('id')
        .single()

      if (insertError) throw new Error(`Criar agente: ${insertError.message}`)
      agentId = created.id
    }

    return Response.json(
      { success: true, agentId },
      { headers: { 'Access-Control-Allow-Origin': '*' } }
    )
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Erro interno'
    console.error('[setup-ai-agent]', message)
    return Response.json(
      { error: message },
      {
        status: 500,
        headers: { 'Access-Control-Allow-Origin': '*' },
      }
    )
  }
})
