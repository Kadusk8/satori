# CLAUDE.md — Satori SaaS Platform

## Visão geral do projeto

Satori (ex-ZapAgent) é uma plataforma SaaS multi-tenant de atendimento automatizado via WhatsApp com agente de IA. A IA atende os clientes, responde dúvidas, indica produtos com imagens, agenda horários e escala para atendentes humanos quando necessário.

O sistema atende múltiplos segmentos (clínicas, lojas, prestadores de serviço, etc). Cada tenant configura seu próprio agente de IA com tom, regras e catálogo personalizados.

### Hierarquia de acesso (3 níveis)

1. **Super Admin (dono da plataforma)** — Acessa o painel `/admin`. Cria, edita, suspende e exclui tenants. Vê métricas globais de todos os tenants. Gerencia planos e cobranças. Ao criar um novo tenant, passa por um fluxo de onboarding que coleta as informações do negócio e já cria automaticamente um agente SDR/Vendedor pré-configurado.

2. **Tenant (cliente da plataforma)** — Acessa o painel `/dashboard`. Vê somente os dados do seu negócio. Gerencia seu kanban, leads, produtos, agenda, equipe e configurações da IA. O owner do tenant pode convidar operadores.

3. **Operador** — Acessa o painel `/dashboard` com permissões limitadas. Atende chats escalados, move cards no kanban, visualiza agenda. Não acessa configurações do tenant.

---

> **Nota de arquitetura (2026-07-03):** o backend original deste documento era
> 100% Supabase (Auth, Storage, Realtime, Edge Functions, PostgREST). A
> plataforma foi migrada por completo pro Neon (Postgres puro) — não havia
> dado de produção a preservar, então o corte foi direto. **O modelo de
> dados, os prompts da IA, as tools de function calling e a lógica de negócio
> descritos abaixo continuam 100% válidos** — só a camada de infraestrutura
> mudou. Onde este documento menciona Supabase Auth/Storage/Realtime/Edge
> Functions, a implementação real hoje é: Auth.js (NextAuth v5), Cloudinary,
> Pusher, e um serviço Node/Fastify em `services/backend/`, respectivamente.
> Ver [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) pra arquitetura atual e
> [`docs/legacy/supabase/README.md`](docs/legacy/supabase/README.md) pro
> mapeamento função-por-função do que foi portado pra onde.

> **Nota de infra (2026-08-26):** o banco saiu do Neon pra um Postgres
> self-hosted no Coolify (`satori-postgres`, em `coolify.useia.api.br`), e o
> `apps/web` saiu do Vercel pro Coolify também (`satori-frontend`, domínio
> `satori.ia.br`) — produto renomeado de ZapAgent pra **Satori** nessa mesma
> leva. **Não houve troca de driver de banco** (`apps/web` e
> `services/backend` já usavam `pg` puro via `drizzle-orm/node-postgres`, não
> um driver serverless) — só de connection string. O `services/backend`
> **continua no Portainer/VPS**, sem mudança (acesso via SSH,
> `~/.ssh/zapagent_vps`, host `77.237.244.254`, serviço Swarm
> `zapagent_backend`). Credenciais de acesso (API do Coolify, connection
> string do Postgres) não ficam neste arquivo versionado — estão no `.env`
> local e na memória do agente Claude Code.

## Stack tecnológica

| Camada | Tecnologia | Justificativa |
|--------|-----------|---------------|
| **IDE/Dev** | Google Antigravity + Claude Code | Desenvolvimento agent-first com skills e workflows |
| **Frontend** | Next.js 15 (App Router) + Tailwind CSS + shadcn/ui | SSR, RSC, tipagem forte |
| **Backend (webhook/IA/cron)** | Node + Fastify (`services/backend/`) | Processo sempre-ligado — não é função serverless; deploy no Portainer |
| **Banco de dados** | Postgres self-hosted (Coolify) + Drizzle ORM | Multi-tenancy via RLS emulada com GUC (`request.jwt.claims`) — ver `db/schema.sql` |
| **Autenticação** | Auth.js / NextAuth v5 (Credentials + bcrypt) | Login, roles, sessão JWT com claims custom |
| **Realtime** | Pusher Channels | Chat ao vivo, kanban em tempo real; fallback gracioso quando não configurado |
| **WhatsApp** | Evolution Go (bring-your-own-instance por tenant) | Cada tenant conecta sua própria instância externa |
| **IA/LLM** | Claude API (Anthropic), + OpenAI/Gemini por tenant (BYOK) | Geração de respostas + execução de ações via function calling |
| **Armazenamento de imagens/áudio** | Cloudinary | Imagens de produto + áudio recebido do WhatsApp |
| **Email transacional** | Resend | Reset de senha e convite de operador, via token HMAC assinado |
| **Fila/Jobs** | `node-cron` dentro de `services/backend` | Lembretes de agendamento, follow-ups automáticos |
| **Deploy** | Coolify (`apps/web`) + Portainer/Docker (`services/backend` + Evolution Go) | |

---

## Modelo de dados (PostgreSQL)

Schema completo e atual em [`db/schema.sql`](db/schema.sql).
Mudança de schema em banco que já existe: arquivo novo e idempotente em
`db/migrations/` (ex: `2026-10-08-historico-cliente.sql`), além de refletir
o mesmo bloco no `db/schema.sql`.

### Row Level Security (RLS)

No Postgres puro (sem os helpers nativos do Supabase), `auth.jwt()` e
`auth.role()` abaixo são um shim implementado em `db/schema.sql` — leem a
GUC `request.jwt.claims`, setada por request via `withClaims()`
(`apps/web/lib/db/index.ts`). As policies e o modelo de 3 papéis são os
mesmos; só a forma de "logar" o usuário na sessão de banco mudou. Ver
[`docs/ARCHITECTURE.md`](../docs/ARCHITECTURE.md#rls-row-level-security).

---

## Lógica de negócio (webhook, IA, agendamento, follow-up)

Fluxo completo (onboarding de tenant, processamento de mensagem via Claude
com function calling, envio via Evolution Go, lembretes e follow-up
automático) documentado em
[`.claude/skills/backend-flows/SKILL.md`](.claude/skills/backend-flows/SKILL.md).

Tools de function calling da IA (Claude API): definição completa e atual em
[`services/backend/src/shared/claude-tools.ts`](services/backend/src/shared/claude-tools.ts).

---

## Evolution API (WhatsApp)

Bring-your-own-instance por tenant — a plataforma não cria nem hospeda
instância, só se conecta numa que o tenant já tem. Implementação real em
`apps/web/lib/evolution/client.ts` (onboarding: valida conexão + registra
webhook) e `services/backend/src/shared/evolution-client.ts`
(`getEvolutionClient`, usado pelo webhook/IA/cron). Ver
[`docs/ARCHITECTURE.md`](../docs/ARCHITECTURE.md) pro fluxo atual.

---

## Armazenamento de imagens

Decisão final: **Cloudinary**, exclusivamente. Cobre tanto upload de imagem de produto direto do browser (preset
unsigned, como no exemplo abaixo) quanto o áudio recebido do WhatsApp
(upload assinado, feito pelo `services/backend` com `CLOUDINARY_API_KEY`/`SECRET`
— ver `services/backend/src/shared/cloudinary.ts`; áudio entra como
`resource_type: 'video'`, já que o Cloudinary não tem um tipo "audio" de
primeira classe).

```typescript
// Upload via frontend (unsigned upload preset)
const formData = new FormData();
formData.append('file', imageFile);
formData.append('upload_preset', tenant.cloudinary_upload_preset);
formData.append('folder', `zapagent/${tenant.slug}/products`);

const res = await fetch(
  `https://api.cloudinary.com/v1_1/${tenant.cloudinary_cloud_name}/image/upload`,
  { method: 'POST', body: formData }
);
const { secure_url, public_id } = await res.json();

// Gerar thumbnail otimizada para WhatsApp (máx 5MB, ideal < 100KB)
const thumbnailUrl = secure_url.replace('/upload/', '/upload/w_400,h_400,c_fill,q_auto,f_auto/');
```

---

## Frontend — Componentes-chave

Ver [`apps/web/components/CLAUDE.md`](apps/web/components/CLAUDE.md).

---

## Variáveis de ambiente

Lista completa e atualizada em `.env.example` (raiz, pro `apps/web`) e
`services/backend/.env.example`.

---

## Regras e convenções de código

### Geral
- TypeScript strict mode em tudo
- Usar `satisfies` ao invés de `as` para type assertions
- Nunca usar `any` — usar `unknown` e narrowing
- Imports absolutos com `@/` no frontend
- Nomes de arquivos em kebab-case
- Nomes de componentes em PascalCase
- Nomes de funções e variáveis em camelCase
- Nomes de tabelas e colunas SQL em snake_case
- Comentários de código em português
- Commit messages em português, padrão conventional commits

### services/backend (Node/Fastify)
- Cada rota em `src/routes/`, lógica de negócio em `src/core/` (chamável direto por outras partes do serviço, sem hop HTTP interno)
- Código compartilhado (LLM, Evolution, Whisper, ElevenLabs, Cloudinary) em `src/shared/`
- Cron jobs via `node-cron` em `src/cron/`, agendados em `src/index.ts`
- Sempre retornar JSON com status code apropriado
- Log de erros com `console.error()`/`request.log.error()`
- Conecta como `service_role` (BYPASSRLS) — nunca aceitar `tenantId` de input sem validar contra o registro correto (ex: webhook_secret, conversationId pertencente ao tenant)
- NUNCA expor `DATABASE_URL`/`ENCRYPTION_KEY`/tokens no frontend

### Frontend (Next.js)
- App Router com Server Components por padrão
- Client Components apenas quando necessário (interatividade, hooks)
- Usar `'use client'` no topo dos Client Components
- Fetching de dados via Server Components + Drizzle (`withClaims`/`withAdmin`, nunca uma conexão crua)
- Mutations via Server Actions ou API routes
- Validação de formulários com Zod + react-hook-form
- Loading states com Suspense e loading.tsx
- Error handling com error.tsx
- Toasts com sonner
- Modais com dialog do shadcn/ui

### Segurança
- RLS ativo em TODAS as tabelas, sem exceção
- Validar tenant_id em toda query
- Rate limiting nas edge functions (usar Deno KV ou header check)
- Sanitizar input do WhatsApp (pode conter XSS)
- Nunca confiar em dados vindos do webhook sem validação
- Webhook da Evolution autenticado via apikey header
- CORS restrito nas edge functions

---

## Workflows e agentes especialistas

Ver [`.claude/skills/dev-workflows/SKILL.md`](.claude/skills/dev-workflows/SKILL.md).

---

## Ordem de implementação (roadmap)

### Fase 1 — Fundação + Super Admin (semanas 1-2)
1. Criar projeto Next.js com Tailwind + shadcn/ui
2. Configurar Supabase (projeto, auth, banco)
3. Executar migrations (todas as tabelas incluindo super_admins, ai_agents, onboarding_logs)
4. Implementar auth com detecção de role (super_admin vs tenant user)
5. Middleware de roteamento: super_admin → /admin, tenant → /dashboard
6. Layout do painel admin com sidebar própria
7. Tela admin/dashboard com métricas globais (placeholder)
8. Tela admin/tenants com lista e filtros
9. Seed do super admin (seu usuário) na tabela super_admins

### Fase 2 — Onboarding de tenant (semana 3)
1. Wizard multi-step em /admin/tenants/new (6 steps)
2. Componentes de cada step com validação (Zod + react-hook-form)
3. Edge function: onboard-tenant (executa todo o fluxo)
4. Edge function: setup-ai-agent (cria SDR com prompt personalizado)
5. Criação automática de kanban stages padrão
6. Criação de instância na Evolution API
7. Envio de magic link pro owner do tenant
8. Tela admin/tenants/[id] para ver detalhe e editar tenant

### Fase 3 — WhatsApp + IA (semanas 4-5)
1. Subir Evolution API via Docker
2. Edge function: webhook-evolution (receber msgs)
3. Edge function: process-message (IA com Claude, usando ai_agents)
4. Edge function: send-whatsapp (enviar respostas)
5. Tela de configuração do WhatsApp no painel tenant (QR code, status)
6. Tela de AI Agents no painel tenant (ver/editar agentes)

### Fase 4 — Kanban + Chat (semanas 6-7)
1. CRUD de kanban stages
2. Kanban board com drag & drop
3. Chat ao vivo com Realtime
4. Escalação IA → humano
5. Notificações para operadores
6. Filtros e busca no kanban

### Fase 5 — Produtos + Agenda (semanas 8-9)
1. CRUD de produtos com upload de imagens
2. Busca textual de produtos (tsvector)
3. Integração IA ↔ catálogo (function calling)
4. Configuração de horários de atendimento
5. Agenda com slots e calendário
6. Integração IA ↔ agendamento (function calling)
7. Lembretes automáticos via pg_cron

### Fase 6 — Polish + Deploy (semanas 10-11)
1. Dashboard do tenant com métricas (total atendimentos, tempo médio, etc)
2. Dashboard admin com métricas globais reais (receita, tenants ativos, msgs/dia)
3. Gestão de planos e limites no admin
4. Responsividade mobile
5. Testes E2E dos fluxos críticos (onboarding, atendimento, escalação)
6. Deploy: Vercel (frontend) + VPS (Evolution API)
7. Monitoramento e logging

---

## Sistema de follow-up automático

Schema (`follow_ups`, colunas em `ai_agents`) em [`db/schema.sql`](db/schema.sql).
Tool de function calling (`schedule_follow_up`) e demais tools em
[`services/backend/src/shared/claude-tools.ts`](services/backend/src/shared/claude-tools.ts).
Cron real (node-cron, não pg_cron) em
[`services/backend/src/cron/process-follow-ups.ts`](services/backend/src/cron/process-follow-ups.ts),
agendado em `services/backend/src/index.ts`.

---
## Dicas para o agente (Claude Code / Antigravity)

- **Sempre use `/plan` antes de features grandes.** Não pule direto pro código.
- **Rode `/test` depois de cada feature.** Não acumule código sem testes.
- **Use `@database-architect` para qualquer mudança no schema.** Migrações mal feitas são difíceis de reverter.
- **Use `@security-auditor` antes de qualquer deploy.** RLS esquecido = vazamento de dados.
- **Ao criar edge functions:** sempre começar pelo happy path, depois adicionar error handling e edge cases.
- **Ao integrar com Evolution API:** testar primeiro no Postman/Insomnia antes de implementar no código. A Evolution pode ter instabilidades com Baileys.
- **Ao montar o prompt da IA:** ser muito explícito sobre o que a IA NÃO deve fazer é tão importante quanto o que ela deve fazer.
- **Não otimize prematuramente.** Foque em funcionar primeiro, otimize depois.
- **Cada migration é um arquivo separado e sequencial.** Nunca edite migrations já executadas — crie uma nova.
