# ZapAgent

Plataforma SaaS multi-tenant de atendimento automatizado via WhatsApp com agente de IA. A IA atende clientes, responde dúvidas, indica produtos com imagens, agenda horários e escala para atendentes humanos quando necessário.

Documentação completa da arquitetura, modelo de dados e convenções de código: [`CLAUDE.md`](./CLAUDE.md).

## Stack

- **Frontend**: Next.js 15 (App Router) + Tailwind CSS + shadcn/ui, em [`apps/web`](./apps/web)
- **Backend**: Supabase (Postgres + Auth + Storage + Realtime + Edge Functions), em [`supabase/`](./supabase)
- **WhatsApp**: Evolution Go — cada tenant conecta sua própria instância externa (bring-your-own-instance)
- **IA**: Claude API (Anthropic) com function calling

## Rodando localmente

```bash
# Frontend
cd apps/web
npm install
npm run dev

# Backend (requer Supabase CLI)
supabase start
supabase functions serve
```

Copie `.env.example` para `.env` e preencha as variáveis do seu projeto Supabase.

## Estrutura

- `apps/web/` — aplicação Next.js (painéis `/admin` e `/dashboard`)
- `supabase/migrations/` — schema SQL versionado
- `supabase/functions/` — edge functions (webhook do WhatsApp, processamento de IA, onboarding, etc.)
- `neon/` — schema alternativo para migração futura do Supabase pro Neon (ainda não adotado em produção)
- `docs/` — documentação complementar
