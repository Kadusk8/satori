---
name: backend-flows
description: Fluxo de negócio do backend (services/backend) — onboarding de tenant, processamento de mensagem via Claude com function calling, envio via Evolution Go, lembretes e follow-up automático. Use ao trabalhar em webhook, IA, agendamento ou follow-up.
---

> Título histórico — não existem mais Supabase Edge Functions. A lógica
> descrita abaixo é a mesma; a implementação real hoje é uma Server Action
> (`onboard-tenant`/`setup-ai-agent` → `apps/web/lib/data/onboarding.ts`) ou
> parte do serviço `services/backend/src/{core,cron}/` (as demais). Ver a
> tabela de mapeamento em
> [`docs/legacy/supabase/README.md`](../../../docs/legacy/supabase/README.md).

## 0. onboard-tenant (wizard de criação de tenant pelo super admin)

```
FLUXO COMPLETO DO ONBOARDING (chamado pelo wizard no painel admin):

O super admin preenche um wizard de 6 steps. Cada step salva parcialmente.
Ao final (step 6 - review + ativar), a edge function executa tudo de uma vez:

1. Criar registro na tabela tenants com todos os dados do negócio
2. Criar usuário owner no Supabase Auth (envia magic link pro email do responsável)
3. Criar registro na tabela users (role: 'owner', vinculado ao tenant)
4. Criar kanban_stages padrão (6 colunas)
5. Criar instância na Evolution API (POST /instance/create)
6. Configurar webhook da Evolution apontando pro Supabase
7. Chamar setup-ai-agent para criar o agente SDR pré-configurado
8. Salvar log de cada step na tabela onboarding_logs
9. Atualizar tenant.status = 'active', tenant.onboarding_completed_at = now()
10. Enviar email de boas-vindas pro owner com link de acesso

STEPS DO WIZARD:
Step 1 - Informações do negócio:
  - Nome da empresa *
  - Segmento (select: clínica, loja, restaurante, serviços, outro) *
  - Descrição do negócio (textarea)
  - Nome do responsável *
  - Email do responsável *
  - Telefone *
  - Endereço, cidade, estado
  - Website

Step 2 - Configuração do WhatsApp:
  - Número do WhatsApp *
  - Tipo de conexão (Baileys ou Cloud API)
  - Se Cloud API: token do Business Manager, Business ID

Step 3 - Configuração do agente de IA:
  - Nome do agente (padrão: "Assistente {nome_empresa}")
  - Personalidade (select: simpático, formal, descontraído, técnico)
  - Tom de voz (textarea livre)
  - Mensagem de boas-vindas (pré-preenchida, editável)
  - Mensagem fora do horário (pré-preenchida, editável)
  - Regras específicas (textarea: "não ofereça desconto", "sempre pergunte o nome", etc)

Step 4 - Produtos/serviços (opcional):
  - Upload em lote ou cadastro individual
  - Nome, descrição, preço, categoria, imagem
  - Pode pular e cadastrar depois

Step 5 - Horário de funcionamento:
  - Dias da semana com horários de início e fim
  - Toggle por dia (ativo/inativo)
  - Timezone (pré-selecionado: America/Sao_Paulo)
  - Duração padrão de agendamento

Step 6 - Revisão e ativação:
  - Resumo de tudo que foi preenchido
  - Checklist visual do que está configurado
  - Botão "Ativar tenant" → dispara a edge function
  - Loading com status de cada etapa sendo executada
```

## 1. setup-ai-agent (cria agente SDR automaticamente)

```
FLUXO:
1. Receber tenant_id + dados do negócio (do onboarding ou chamado manualmente)
2. Montar system_prompt substituindo {placeholders}:
   - {nome_empresa} → tenant.name
   - {segmento} → tenant.business_segment
   - {descricao_negocio} → tenant.business_description
   - {horario_funcionamento} → formatado a partir de business_hours
   - {endereco} → tenant.address + city + state
   - {personalidade} → escolhida no step 3
   - {nome_agente} → nome definido no step 3
3. Inserir na tabela ai_agents com type='sdr', is_default=true
4. Se o tenant cadastrou produtos no step 4:
   - Adicionar ao prompt uma seção "Produtos/serviços disponíveis" com resumo
5. Retornar ai_agent.id criado
```

O prompt real injetado (template do SDR/Vendedor) está em
`apps/web/lib/data/onboarding.ts` — não duplicar aqui, ler direto do arquivo.

## 2. webhook-evolution (recebe mensagens)

```
FLUXO:
1. Evolution API envia POST com evento de mensagem
2. Validar header de autenticação (apikey da Evolution)
3. Extrair: instanceName, número do remetente, conteúdo, tipo de mídia
4. Buscar tenant pelo instanceName
5. Buscar ou criar contact pelo número
6. Buscar ou criar conversation ativa
7. Salvar mensagem na tabela messages (sender_type: 'customer')
8. Se conversation.status == 'human_handling' → NÃO processar com IA, apenas notificar operador via Realtime
9. Se conversation.status == 'ai_handling' → invocar process-message
10. Atualizar last_message_at e last_contact_at
```

Implementação real: `services/backend/src/core/webhook.ts`.

## 3. process-message (IA processa e responde)

```
FLUXO:
1. Receber conversation_id
2. Carregar: tenant config, ai_agent ATIVO E DEFAULT do tenant, histórico (últimas 20 msgs), catálogo de produtos, slots de agenda
3. Montar system prompt A PARTIR DO AI_AGENT (não do tenant):
   - ai_agent.system_prompt (já personalizado no onboarding)
   - ai_agent.escalation_rules
   - Horário de funcionamento do tenant (business_hours)
   - Data/hora atual no timezone do tenant
   - Listar somente as tools que o agente tem permissão (can_search_products, etc)
4. Montar messages array com histórico
5. Definir tools (function calling) — ver services/backend/src/shared/claude-tools.ts para a lista completa e atual
6. Chamar Claude API com tools
7. Processar resposta:
   - Se tool_use → executar tool → responder com tool_result → loop
   - Se text → resposta final
8. Salvar mensagem da IA (sender_type: 'ai', ai_tool_calls, ai_confidence)
9. Enviar resposta via send-whatsapp
10. Se IA chamou escalate_to_human:
    - Atualizar conversation.status = 'waiting_human'
    - Mover card no kanban para 'aguardando_humano'
    - Notificar operadores disponíveis
```

Implementação real: `services/backend/src/core/process-message.ts` (contém
também os guard-rails determinísticos contra alucinação/repetição da IA —
ler os comentários no arquivo antes de mexer no fluxo).

## 4. send-whatsapp (envia via Evolution API)

```
FLUXO:
1. Receber: instanceName, número destino, conteúdo, tipo
2. Se tipo == 'text': POST /message/sendText/{instance}
3. Se tipo == 'image' (produto): POST /message/sendMedia/{instance}
4. Se tipo == 'product_card': montar mensagem formatada com nome, preço, descrição curta e imagem
5. Salvar whatsapp_message_id retornado
```

Implementação real: `services/backend/src/core/send-whatsapp.ts` +
`services/backend/src/shared/evolution-client.ts`.

## 5. schedule-reminder (cron)

```
FLUXO (roda periodicamente):
1. Buscar agendamentos onde:
   - reminder_24h_sent = false E faltam <= 24h
   - OU reminder_1h_sent = false E faltam <= 1h
2. Para cada: enviar mensagem via send-whatsapp
3. Atualizar flag de reminder enviado
```

Implementação real: `services/backend/src/cron/schedule-reminder.ts`
(node-cron, agendado em `services/backend/src/index.ts` — não pg_cron).

## 6. process-follow-ups (cron)

```
FLUXO:
1. Buscar follow_ups WHERE status = 'pending' AND scheduled_at <= now()
2. Para cada follow_up:
   a. Carregar: ai_agent, contact, histórico da conversa original
   b. Gerar mensagem curta de follow-up via LLM (ou usar template configurado)
   c. Enviar via send-whatsapp
   d. Atualizar follow_up: status='sent', sent_at=now(), message_content=msg
   e. Se attempt_number < max_attempts: criar novo follow_up agendado pra frente
   f. Se attempt_number >= max_attempts: marcar status = 'max_reached'
3. Cancela follow-ups pendentes se: conversa fechada, humano assumiu, ou contato tem etiqueta bloqueada
4. Fora do horário comercial do tenant: adia 1h em vez de enviar
```

Implementação real: `services/backend/src/cron/process-follow-ups.ts`
(node-cron hourly, agendado em `services/backend/src/index.ts`).

No webhook, ao receber resposta de um contato: follow-ups pendentes desse
contato são cancelados/marcados como 'replied' (ver `webhook.ts`).
