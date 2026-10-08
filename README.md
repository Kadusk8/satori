# Satori

Plataforma SaaS multi-tenant de atendimento automatizado via WhatsApp com agente de IA (ex-ZapAgent). A IA atende clientes, responde dúvidas, indica produtos com imagens, agenda horários e escala para atendentes humanos quando necessário.

Documentação completa da arquitetura, modelo de dados e convenções de código: [`CLAUDE.md`](./CLAUDE.md).

## Stack

- **Frontend**: Next.js 15 (App Router) + Tailwind CSS + shadcn/ui, em [`apps/web`](./apps/web) — deploy: Coolify
- **Banco**: Postgres self-hosted (Coolify) + Drizzle ORM, com RLS via GUC — schema em [`db/schema.sql`](./db/schema.sql)
- **Auth**: Auth.js (NextAuth v5), credenciais + bcrypt
- **Backend**: serviço Node/Fastify sempre-ligado em [`services/backend`](./services/backend) — webhook do WhatsApp, IA, cron de lembretes/follow-up. Deploy: Portainer/Docker
- **Realtime**: Pusher (com fallback gracioso quando não configurado)
- **WhatsApp**: Evolution Go — cada tenant conecta sua própria instância externa (bring-your-own-instance)
- **IA**: Claude API (Anthropic), com suporte a OpenAI/Gemini por tenant (BYOK), function calling

## Rodando localmente

```bash
# Frontend
cd apps/web
npm install
npm run dev

# Backend (webhook + IA + cron)
cd services/backend
npm install
npm run dev
```

Copie `.env.example` (raiz) e `services/backend/.env.example` para `.env`/`.env.local`
e preencha com um Postgres local rodando `db/schema.sql`, ou a connection
string do Postgres self-hosted no Coolify. Ver [`docs/DEPLOYMENT.md`](./docs/DEPLOYMENT.md) pro checklist completo.

## Estrutura

- `apps/web/` — aplicação Next.js (painéis `/admin` e `/dashboard`)
- `services/backend/` — serviço Node/Fastify (webhook, IA, cron)
- `db/schema.sql` — schema do banco (Postgres puro, com shim de RLS)
- `docker/` — `docker-compose.yml` do `services/backend`
- `docs/` — arquitetura, guia de deploy e histórico (`docs/legacy/supabase/`)
