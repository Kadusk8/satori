# Guia de Deploy — ZapAgent (Neon + Vercel + Portainer)

Checklist de provisionamento e deploy da plataforma no estado atual (pós
migração do Supabase pro Neon — ver [`ARCHITECTURE.md`](./ARCHITECTURE.md)).
Greenfield: não há passo de migração de dados porque não há dados de produção
no Supabase a preservar.

## Visão geral

```
apps/web (Next.js)         →  Vercel
services/backend (Fastify) →  Portainer/Docker, sempre-ligado
Banco                       →  Neon (Postgres)
Realtime                    →  Pusher
Email transacional          →  Resend
Imagens + áudio             →  Cloudinary
```

## 1. Neon (banco)

1. Criar um projeto no [Neon](https://neon.tech).
2. Rodar o schema completo:
   ```bash
   psql "$NEON_CONNECTION_STRING" -f neon/schema.sql
   ```
3. Configurar a chave de criptografia usada pelas colunas sensíveis
   (`evolution_api_key`, chaves de LLM/ElevenLabs por tenant):
   ```sql
   ALTER DATABASE <nome_do_banco> SET app.encryption_key = '<chave-forte-aleatória>';
   ```
4. Criar (ou usar) um usuário de conexão com os grants de role necessários:
   ```sql
   GRANT authenticated, service_role TO <seu_usuario_de_conexao>;
   ```
   Esse mesmo usuário/connection string serve tanto pro `apps/web`
   (`DATABASE_URL`) quanto pro `services/backend` (`DATABASE_URL`) — o app usa
   `SET LOCAL ROLE authenticated` por request (RLS) e o serviço backend usa
   `SET ROLE service_role` (BYPASSRLS) por conexão.
5. Guardar a connection string do endpoint **pooled** do Neon (`-pooler` no
   host) — necessário pro Vercel (serverless) não estourar conexões.

## 2. Vercel (`apps/web`)

Variáveis de ambiente (ver `.env.example` na raiz):

| Variável | Observação |
|---|---|
| `DATABASE_URL` | connection string pooled do Neon |
| `ENCRYPTION_KEY` | mesma chave configurada no passo 1.3 |
| `AUTH_SECRET` | gerar com `openssl rand -base64 32` |
| `NEXT_PUBLIC_APP_URL` | URL pública do app no Vercel |
| `RESEND_API_KEY`, `EMAIL_FROM` | conta no [Resend](https://resend.com) |
| `NEXT_PUBLIC_PUSHER_KEY`, `NEXT_PUBLIC_PUSHER_CLUSTER`, `PUSHER_APP_ID`, `PUSHER_SECRET` | conta no [Pusher Channels](https://pusher.com/channels) |
| `NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME`, `NEXT_PUBLIC_CLOUDINARY_UPLOAD_PRESET` | upload de imagem de produto direto do browser (unsigned preset) |
| `BACKEND_URL`, `BACKEND_PUBLIC_URL`, `BACKEND_TOKEN` | URL(s) do `services/backend` no Portainer + token compartilhado |
| `ANTHROPIC_API_KEY`, `OPENAI_API_KEY`, `GEMINI_API_KEY` | fallback global (BYOK por tenant tem prioridade) |

Deploy: conectar o repo no Vercel com **root directory = `apps/web`** — a Vercel detecta Next.js automaticamente, sem `vercel.json`.

## 3. Portainer/Docker (`services/backend`)

1. Variáveis de ambiente — ver `services/backend/.env.example`:
   `DATABASE_URL`, `ENCRYPTION_KEY` (mesmas do passo 1), `PORT`,
   `BACKEND_TOKEN` (deve bater com o do Vercel), `CLOUDINARY_CLOUD_NAME` +
   `CLOUDINARY_API_KEY` + `CLOUDINARY_API_SECRET` (upload assinado, diferente
   do preset unsigned do frontend), `ANTHROPIC_API_KEY`/`OPENAI_API_KEY`/`GEMINI_API_KEY`.
2. Build e sobe via `docker/docker-compose.yml`:
   ```bash
   cd docker
   docker compose up -d --build
   ```
3. Expor a porta `3001` publicamente (proxy reverso/HTTPS na frente — ex.
   Traefik/Nginx no próprio Portainer) — essa é a URL que vira
   `BACKEND_URL`/`BACKEND_PUBLIC_URL` no Vercel.
4. Healthcheck: `GET /health` deve responder `{"ok":true}`.

## 4. Evolution Go (por tenant)

Não é provisionado pela plataforma — cada tenant já tem (ou cria) sua própria
instância externa. No onboarding (`/admin/tenants/new`), o super admin informa
URL + token + nome da instância; o wizard valida a conexão e registra o
webhook (`{BACKEND_PUBLIC_URL}/webhook-evolution?ts=<segredo>`) automaticamente.

## 5. Checklist de verificação pós-deploy

- [ ] `neon/schema.sql` aplicado, `app.encryption_key` configurada
- [ ] Login funciona (`/login`) e leva ao painel certo (`/admin` vs `/dashboard`)
- [ ] `services/backend` respondendo em `GET /health`
- [ ] `BACKEND_TOKEN` configurado (Vercel e Portainer, com o mesmo valor) — sem
      ele, `POST /send-whatsapp` fica aberto pra qualquer um que descubra a URL
      (o serviço loga um warning no startup se estiver ausente)
- [ ] Onboarding de um tenant de teste completa sem erro (todos os 7 passos do wizard)
- [ ] Mensagem de teste no WhatsApp do tenant → aparece em `/conversations` → IA responde
- [ ] Mensagem de **áudio** de teste no WhatsApp → transcreve (Whisper) e a IA responde (esse caminho nunca foi testado ponta a ponta em nenhum ambiente real até agora)
- [ ] Um agendamento de teste ~24h e ~1h no futuro recebe os lembretes nos horários certos (valida o fuso horário do tenant — ver nota abaixo)
- [ ] Mover um card no kanban em duas abas abertas reflete ao vivo (Pusher configurado)
- [ ] Email de reset de senha chega (Resend configurado)
- [ ] CI (`.github/workflows/ci.yml`) verde: lint + typecheck + build do `apps/web`, typecheck + testes + build do `services/backend`

## 6. O que este checklist NÃO cobre

Provisionar as contas acima é necessário, mas não suficiente pra produção.
Gaps conhecidos, na ordem em que valem a pena atacar:

1. **Nunca testado contra serviços externos reais.** Todo o desenvolvimento e
   smoke test rodou contra um mock do Evolution Go e um Postgres local — LLM
   real (Anthropic/OpenAI/Gemini), Pusher, Resend e Cloudinary reais nunca
   foram exercitados ponta a ponta.
2. **Cobertura de teste automatizado ainda é fina.** `apps/web/e2e/` só tem
   `auth.spec.ts` (smoke de redirecionamento); `services/backend` tem testes
   unitários só pras funções puras mais sensíveis (`vitest run`) — nenhum dos
   dois cobre o fluxo de IA/webhook/agendamento de ponta a ponta.
3. **Sem rate limiting refinado.** `services/backend` tem um limite global
   básico (`@fastify/rate-limit`, 100 req/min por IP) — não há limite
   diferenciado por tenant nem proteção específica contra brute-force do
   `webhook_secret` (`?ts=`) além disso.
4. **Reverse proxy/HTTPS na frente do `services/backend` não está
   automatizado** — o passo 3.3 acima é manual (Traefik/Nginx no próprio
   Portainer, por sua conta).
5. **Sem monitoramento/alerta** se o processo do `services/backend` cair — os
   crons de lembrete/follow-up ficam parados silenciosamente até reiniciar.

### Nota — bug de timezone nos lembretes (corrigido, mas fique de olho)

O cálculo de "faltam 24h/1h" comparava a data/hora do agendamento (guardada
como horário de parede na timezone do tenant, ex: `America/Sao_Paulo`) direto
contra `new Date()`, sem converter — o que só dá certo se o processo do
`services/backend` rodar com `TZ` igual à do tenant. Como containers Docker
normalmente rodam em UTC, isso fazia os lembretes nunca caírem dentro da
janela de tolerância. Corrigido em `src/shared/timezone.ts`
(`zonedWallTimeToDate`), com teste em `src/shared/timezone.test.ts` — mas vale
confirmar com um agendamento real de teste (item do checklist acima), já que
nunca rodou contra um Postgres/Evolution Go de produção.

## Troubleshooting

**"Erro ao criar tenant" no onboarding** — geralmente falha de conexão com a
Evolution Go informada (URL/token errados) ou webhook_secret duplicado
(reexecutar o onboarding é idempotente por slug).

**IA não responde no WhatsApp** — checar logs do `services/backend`
(webhook recebido? `process-message` chamado após o buffer de 6s? erro de API
key da LLM?). Sem chave BYOK do tenant nem fallback global configurado, a
chamada à LLM falha com `"<PROVIDER>_API_KEY not configured"`.

**Realtime não atualiza** — confirmar que `PUSHER_APP_ID`/`PUSHER_SECRET`
(server) e `NEXT_PUBLIC_PUSHER_KEY`/`CLUSTER` (client) batem com a mesma app
no dashboard do Pusher; sem isso o app cai no fallback de polling/refresh
manual silenciosamente (não é um erro visível).
