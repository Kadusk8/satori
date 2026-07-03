# Arquitetura — ZapAgent

Visão geral de como as peças se conectam. Para o modelo de dados completo e convenções de código, ver [`CLAUDE.md`](../CLAUDE.md).

## Componentes

- **`apps/web`** (Next.js 15, App Router) — painéis `/admin` (super admin) e `/dashboard` (tenant/operador). Deploy: Vercel.
- **Supabase** — Postgres + Auth + Storage + Realtime + Edge Functions (Deno). Backend atual em produção.
- **Evolution Go** — gateway de WhatsApp. Cada tenant conecta sua **própria instância externa** (bring-your-own-instance): o super admin cadastra URL, token e nome da instância no onboarding; a plataforma não cria nem hospeda instâncias.
- **Claude API** — geração de respostas da IA com function calling (busca de produtos, agendamento, escalação para humano).
- **`neon/schema.sql`** — schema alternativo pra uma futura migração do Supabase pro Neon (Postgres puro). Ainda não adotado em produção; ver seção "Neon" abaixo.

## Fluxo: mensagem do WhatsApp → resposta da IA

```
Cliente manda mensagem no WhatsApp
        │
        ▼
Evolution Go da instância do tenant
        │  POST com ?ts=<webhook_secret do tenant>
        ▼
apps/web/app/api/webhook/evolution/route.ts
        │  encaminha (com query string) pra edge function
        ▼
supabase/functions/webhook-evolution
        │  1. valida `ts` contra tenants.webhook_secret (resolve o tenant)
        │  2. busca/cria contact + conversation
        │  3. salva mensagem (sender_type: 'customer')
        │  4. se conversation.status == 'ai_handling' → invoca process-message
        ▼
supabase/functions/process-message
        │  1. carrega ai_agent ativo/default do tenant + histórico + catálogo
        │  2. chama Claude API com tools (search_products, check_availability,
        │     book_appointment, escalate_to_human, etc.)
        │  3. salva resposta da IA na tabela messages
        ▼
supabase/functions/send-whatsapp
        │  envia a resposta de volta via Evolution Go do tenant
        ▼
Cliente recebe a resposta no WhatsApp
```

Se a IA chamar `escalate_to_human`, a conversa muda pra `waiting_human`, o card se move no kanban e os operadores disponíveis são notificados via Supabase Realtime.

## Fluxo: onboarding de um novo tenant

O super admin preenche um wizard de 6 steps em `/admin/tenants/new`. Ao confirmar (step 6), `supabase/functions/onboard-tenant` executa tudo numa única chamada, step a step:

1. Cria o registro em `tenants`
2. Cria o usuário `owner` no Supabase Auth + tabela `users`
3. Cria os 6 estágios padrão do kanban
4. **Valida** a conexão com a instância Evolution Go informada (não cria instância — ela já existe, o tenant a conectou externamente)
5. Registra o webhook (`webhook-evolution?ts=<segredo>`) na instância
6. Cria o agente de IA SDR pré-configurado (`setup-ai-agent`), com o prompt personalizado a partir dos dados do negócio

Cada etapa é logada em `onboarding_logs` e pode ser reexecutada individualmente se falhar no meio do caminho (idempotente via upsert).

## Segurança do webhook

Nem a Evolution API clássica nem a Evolution Go autenticam suas próprias chamadas de webhook de saída. Por isso, cada tenant tem um `webhook_secret` gerado em `tenants.webhook_secret`, embutido como `?ts=` na URL do webhook. `webhook-evolution` rejeita com 401 qualquer chamada cujo `ts` não bata com o segredo do tenant — esse valor também é usado pra resolver *qual* tenant está mandando o evento (não confiamos em nenhum campo `instance` do payload).

## Autenticação e papéis

Login é Supabase Auth padrão. Os claims `is_super_admin`, `tenant_id` e `user_role` são injetados no JWT via `custom_access_token_hook` (não aparecem em `user.app_metadata`) — usar sempre `lib/supabase/get-claims.ts` pra ler esses valores, nunca o objeto `user` direto.

- **Super admin** → `/admin/*` (gestão de tenants, planos, analytics)
- **Owner/admin do tenant** → `/dashboard/*` completo, incluindo `/team` (convite e gestão de operadores)
- **Operador** → `/dashboard/*` com acesso limitado (sem `/team`, sem configurações)

## Neon (não adotado ainda)

`neon/schema.sql` é um bootstrap único e testado que replica o schema do Supabase em Postgres puro (shim de `auth.jwt()/uid()/role()`, roles `service_role`/`authenticated`/`anon`, todas as tabelas e triggers). Falta, pra essa migração ser real: substituir Supabase Auth, Storage e Realtime por equivalentes próprios, migrar os dados existentes, e decidir onde rodam as edge functions (Vercel Route Handlers vs. serviço Node separado). Não é pré-requisito pra produção atual — a plataforma roda inteiramente sobre Supabase hoje.
