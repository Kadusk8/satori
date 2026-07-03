# Arquivado — Supabase (pré-migração pro Neon)

Este diretório é o código e as migrations do backend original em Supabase
(Postgres + Auth + Storage + Realtime + Edge Functions), mantido só como
referência histórica após a migração completa pro Neon (Postgres puro).

**Nada aqui está em uso.** O estado atual do backend é:

- Banco: `neon/schema.sql` (na raiz do repo)
- Auth: `apps/web/auth.ts` (Auth.js/NextAuth v5)
- Acesso a dados do app: `apps/web/lib/data/*` e `apps/web/lib/db/*` (Drizzle)
- Realtime: `apps/web/lib/realtime/*` (Pusher)
- Webhook do WhatsApp, IA, cron: `services/backend/` (Node/Fastify)

As 9 edge functions abaixo foram portadas 1:1 (ou substituídas por um fluxo
melhor, no caso de `reset-password`) pro código acima:

| Function original | Onde está agora |
|---|---|
| `onboard-tenant` + `setup-ai-agent` | `apps/web/lib/data/onboarding.ts` |
| `webhook-evolution` | `services/backend/src/core/webhook.ts` |
| `process-message` | `services/backend/src/core/process-message.ts` |
| `send-whatsapp` | `services/backend/src/core/send-whatsapp.ts` |
| `schedule-reminder` | `services/backend/src/cron/schedule-reminder.ts` |
| `process-follow-ups` | `services/backend/src/cron/process-follow-ups.ts` |
| `reset-password` | `apps/web/lib/auth/tokens.ts` + `apps/web/app/auth/actions.ts` (token HMAC + Resend, mais seguro que o original) |
| `reregister-webhooks` | não portado — era um script de manutenção one-off ligado à migration 026 do Supabase; o Neon já nasce com `webhook_secret` correto |

Ver [`docs/ARCHITECTURE.md`](../ARCHITECTURE.md) para a arquitetura atual completa.
