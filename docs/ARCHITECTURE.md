# Arquitetura — ZapAgent

Visão geral de como as peças se conectam. Para o modelo de dados completo e convenções de código, ver [`CLAUDE.md`](../CLAUDE.md).

O backend rodou originalmente sobre Supabase; foi migrado por completo pro Neon
(Postgres puro) — ver [`docs/legacy/supabase/README.md`](./legacy/supabase/README.md)
pro mapeamento de onde cada peça antiga foi parar.

## Componentes

- **`apps/web`** (Next.js 15, App Router) — painéis `/admin` (super admin) e `/dashboard` (tenant/operador). Deploy: Vercel.
- **Neon** (Postgres puro) — banco único, com RLS via GUC (`request.jwt.claims`) emulando o comportamento do Supabase. Schema em [`neon/schema.sql`](../neon/schema.sql).
- **Auth.js (NextAuth v5)** — autenticação por credenciais (email/senha, bcrypt), sessão JWT com claims `{sub, tenant_id, user_role, is_super_admin}` embutidos via `get_session_claims()` (função SQL).
- **`services/backend`** (Node/Fastify) — serviço sempre-ligado que recebe o webhook do WhatsApp, roda a IA (function calling) e os crons de lembrete/follow-up. Deploy: Portainer/Docker (fora do Vercel, que tem timeout de função serverless).
- **Pusher** — realtime (kanban, chat, agenda, sidebar), com fallback gracioso (polling ou refresh manual) quando não configurado.
- **Resend** — email transacional (reset de senha, convite de operador), via token HMAC assinado (`apps/web/lib/auth/tokens.ts`) — sem tabela de tokens, sem dependência de Auth provider externo.
- **Evolution Go** — gateway de WhatsApp. Cada tenant conecta sua **própria instância externa** (bring-your-own-instance): o super admin cadastra URL, token e nome da instância no onboarding; a plataforma não cria nem hospeda instâncias.
- **Claude API** (+ OpenAI/Gemini, BYOK por tenant) — geração de respostas da IA com function calling (busca de produtos, agendamento, escalação para humano, follow-up).
- **Cloudinary** — imagens de produto e áudio recebido do WhatsApp.

## Fluxo: mensagem do WhatsApp → resposta da IA

```
Cliente manda mensagem no WhatsApp
        │
        ▼
Evolution Go da instância do tenant
        │  POST direto pro serviço backend, com ?ts=<webhook_secret do tenant>
        │  (registrado no onboarding — não passa mais pelo Next.js)
        ▼
services/backend — POST /webhook-evolution
        │  1. valida `ts` contra tenants.webhook_secret (resolve o tenant)
        │  2. busca/cria contact + conversation
        │  3. salva mensagem (sender_type: 'customer'); áudio sobe pro Cloudinary
        │  4. se conversation.status == 'ai_handling' → agenda processMessage()
        │     (buffer de 6s pra agrupar mensagens rápidas do mesmo cliente)
        ▼
services/backend/src/core/process-message.ts
        │  1. carrega ai_agent ativo/default do tenant + histórico + catálogo
        │  2. chama a LLM (Claude/OpenAI/Gemini conforme o agente) com tools
        │     (search_products, check_availability, book_appointment,
        │     escalate_to_human, schedule_follow_up, etc.)
        │  3. salva a resposta da IA na tabela messages
        │  4. envia a resposta via Evolution Go do tenant (texto, áudio ou imagem)
        ▼
Cliente recebe a resposta no WhatsApp
```

Se a IA chamar `escalate_to_human`, a conversa muda pra `waiting_human`, o card
se move no kanban e um evento Pusher (`conversation:changed`, no canal
`private-tenant-{tenantId}`) atualiza o CRM em tempo real pros operadores.

## Fluxo: onboarding de um novo tenant

O super admin preenche um wizard de 6 steps em `/admin/tenants/new`. Ao confirmar
(step 6), a Server Action `onboardTenant` (`apps/web/lib/data/onboarding.ts`)
executa tudo numa única transação:

1. Cria o registro em `tenants` (com `webhook_secret` já gerado)
2. Cria o usuário `owner` em `auth_users` (bcrypt) + tabela `users`
3. Os 6 estágios padrão do kanban são criados automaticamente por trigger do banco (`trg_create_default_kanban_stages`)
4. **Valida** a conexão com a instância Evolution Go informada (não cria instância — ela já existe, o tenant a conectou externamente)
5. Registra o webhook (`{BACKEND_PUBLIC_URL}/webhook-evolution?ts=<segredo>`) na instância — aponta direto pro `services/backend`, não pro Next.js
6. Cria o agente de IA SDR pré-configurado, com o prompt personalizado a partir dos dados do negócio

Cada etapa é logada em `onboarding_logs`.

## Segurança do webhook

A Evolution Go não autentica suas próprias chamadas de webhook de saída. Por
isso, cada tenant tem um `webhook_secret` gerado em `tenants.webhook_secret`,
embutido como `?ts=` na URL do webhook. `POST /webhook-evolution` rejeita com
401 qualquer chamada cujo `ts` não bata com o segredo de algum tenant — esse
valor também é usado pra resolver *qual* tenant está mandando o evento (não
confiamos em nenhum campo `instance` do payload).

## Autenticação e papéis

Login via Auth.js (Credentials provider + bcrypt). Os claims `is_super_admin`,
`tenant_id` e `user_role` vêm de `get_session_claims(userId)` (função SQL) e
são embutidos na sessão JWT do NextAuth — ler sempre via
`apps/web/lib/auth/session.ts` (`getSessionClaims()`/`getDbClaims()`), nunca o
objeto de sessão bruto.

- **Super admin** → `/admin/*` (gestão de tenants, planos, analytics)
- **Owner/admin do tenant** → `/dashboard/*` completo, incluindo `/team` (convite e gestão de operadores)
- **Operador** → `/dashboard/*` com acesso limitado (sem `/team`, sem configurações)

## RLS (Row Level Security)

O Neon é Postgres puro — sem o `auth.jwt()`/`auth.uid()` nativos do Supabase.
`neon/schema.sql` recria esse comportamento com um shim (schema `auth`) que lê
a GUC `request.jwt.claims` (`SELECT set_config('request.jwt.claims', <json>, true)`),
mais os roles `service_role`/`authenticated`/`anon`.

Duas portas de entrada no código, nunca uma conexão crua:

- **`withClaims(claims, fn)`** (`apps/web/lib/db/index.ts`) — abre uma
  transação, faz `SET LOCAL ROLE authenticated` + grava os claims da sessão na
  GUC, e roda `fn` com RLS valendo normalmente. Usado em toda Server
  Action/Server Component que lê dado de tenant.
- **`withAdmin(fn)`** — `SET LOCAL ROLE service_role` (BYPASSRLS). Só pra
  código de servidor confiável (painel admin, onboarding).

O `services/backend` conecta direto como `service_role` (BYPASSRLS) — não
precisa da granularidade por tenant do `withClaims`, já que é um processo de
confiança total (equivalente ao que o service role do Supabase fazia).

## Realtime (Pusher)

Dois tipos de canal privado, autenticados via `POST /api/pusher/auth`
(`apps/web/app/api/pusher/auth/route.ts`):

- `private-tenant-{tenantId}` — eventos `conversation:changed` e
  `appointment:changed`, disparados no write-path (mover card, assumir/encerrar
  conversa, salvar agendamento). Assinado pela sidebar, pelo kanban e pela agenda.
- `private-conversation-{conversationId}` — evento `message:new` com a
  mensagem completa, disparado ao enviar uma mensagem manual do CRM. Assinado
  pela tela de chat; a autorização do canal confere (via RLS) que a conversa
  pertence ao tenant da sessão.

Sem `PUSHER_*` configurado, tudo isso vira no-op silencioso no servidor e o
client cai em fallback (polling leve no chat, refresh manual nas outras telas)
— o app funciona igual, só sem as atualizações ao vivo.
