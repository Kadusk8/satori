# Plano — App do Satori (iOS e Android) via PWA

Data: 2026-11-25 · Status: **Fase 1 implementada** (não commitada nem deployada).
Decisões 1–3 seguiram a recomendação. Fases 2 e 3 pendentes.

Achados extras durante a Fase 1, já corrigidos:
- Vendedor **desativado** continuava recebendo push das conversas atribuídas a ele
  (`shared/push-recipients.ts` agora exige usuário ativo).
- A sessão não deslizava de verdade: nada no app chamava `/api/auth/session`, e
  Server Component não regrava cookie. `components/pwa/session-refresh.tsx` renova
  ao abrir/voltar pro app (no máx. 1×/h).
- `VAPID_SUBJECT` tem default `mailto:suporte@satori.ia.br`, pra um deploy sem a
  env nova não derrubar o push.

## Objetivo

O operador e o dono do tenant instalam o Satori **direto do site**, sem App Store nem
Play Store, e recebem push quando um chat precisa de atendimento humano. O app é o
próprio `apps/web` rodando como PWA. Não há código nativo nem build separado.

| Plataforma | Instalação | Push |
|---|---|---|
| Android (Chrome, Edge, Samsung Internet) | Botão "Instalar" (WebAPK) | Funciona mesmo sem instalar |
| iOS 16.4+ (Safari) | Manual: Compartilhar → Adicionar à Tela de Início | Só com o app instalado e depois de um toque do usuário |
| iOS < 16.4 | Atalho na tela inicial | Não funciona |

APK baixável (TWA/Bubblewrap) fica **fora** do escopo: a PWA instalada no Android já
é um app de verdade e dispensa o aviso de "fontes desconhecidas".

---

## O que já existe (commit `adfaad7` + migration de 2026-11-18)

| Peça | Arquivo | Situação |
|---|---|---|
| Manifest | `apps/web/app/manifest.ts` | Servido em produção (`/manifest.webmanifest`, 200) |
| Service worker | `apps/web/public/sw.js` | Servido (`/sw.js`, 200, sem cache) |
| Registro do SW | `apps/web/components/pwa/sw-register.tsx` | No layout raiz |
| Botão "Instalar App" + instruções iOS | `apps/web/components/pwa/install-prompt.tsx` | Só na sidebar do dashboard, depois do login |
| Banner de notificações | `apps/web/components/pwa/notification-permission-banner.tsx` | No layout do dashboard |
| Hook de push | `apps/web/lib/hooks/use-push-notifications.ts` | — |
| API de inscrição | `apps/web/app/api/push-subscribe`, `push-unsubscribe` | Com allowlist de host (anti-SSRF) |
| Tabela | `db/migrations/2026-11-18-push-subscriptions.sql` | Criada depois do código: **pushes anteriores nunca saíram** |
| Envio | `services/backend/src/shared/push-sender.ts` | Chamado em `core/webhook.ts:545` (mensagem recebida) e `core/tools.ts:526` (escalada) |
| Ícones | `apps/web/public/icons/*` | 192, 512, maskable, apple-touch, badge |

O trabalho é **corrigir e completar**, não começar do zero. A lista abaixo traz os
erros que encontrei lendo o código, cada um com a correção.

---

## Decisões que dependem de você

Cada uma vem com a minha recomendação. Sem resposta, sigo a recomendação.

1. **Duração da sessão.** Hoje `session.maxAge` é 12h fixo (`auth.config.ts`), e o
   `updateAge` padrão do Auth.js (24h) é maior que isso, então a sessão nunca renova.
   No app, o operador toca no push de manhã e cai na tela de login.
   **Recomendação:** sessão deslizante de 7 dias (`maxAge: 7d`, `updateAge: 1h`). Os
   claims continuam revalidados no callback `jwt` (`auth.ts`), então usuário desativado
   ou com papel trocado perde o acesso do mesmo jeito.
2. **Push a cada mensagem recebida.** `core/webhook.ts:530-552` manda push pra
   owner/admin em **toda** mensagem de cliente, inclusive nas que a IA está
   respondendo sozinha. Num tenant movimentado, são centenas de notificações por dia,
   e o usuário vai desativar tudo, inclusive as escaladas.
   **Recomendação:** push só quando a conversa precisa de humano (`waiting_human` /
   `human_handling`) ou tem vendedor atribuído. A conversa da IA continua aparecendo
   em tempo real via Pusher.
3. **Texto da mensagem na tela bloqueada.** Hoje o corpo do push mostra a mensagem do
   cliente (até 100 caracteres), visível com o celular bloqueado.
   **Recomendação:** manter, que é o que dá valor ao push. Se algum tenant reclamar
   (clínica, por exemplo), vira opção por tenant depois.

---

## Fase 1 — Corrigir o que já existe (bloqueia o resto)

### 1.1 Inscrições "fantasma": navegador inscrito, banco vazio
- **Problema:** quem ativou notificação antes da migration de 2026-11-18 tem a inscrição
  no navegador, mas nenhuma linha no banco. O hook vê `getSubscription()` não nulo,
  marca `isSubscribed = true` e esconde o banner, então essa pessoa **nunca** recebe
  push e não tem como perceber.
- **Correção:** em `use-push-notifications.ts`, toda vez que o app abre com inscrição
  existente, reenviar para `/api/push-subscribe`. O upsert por `endpoint` já é
  idempotente.

### 1.2 Troca de chave VAPID quebra a inscrição
- **Problema:** se o par VAPID mudar, `pushManager.subscribe()` lança `InvalidStateError`,
  porque já existe inscrição com outra chave. Cai no toast genérico de erro, sem saída.
- **Correção:** comparar `subscription.options.applicationServerKey` com a chave atual.
  Se forem diferentes, chamar `unsubscribe()` e inscrever de novo.

### 1.3 Banner preso em "carregando"
- **Problema:** `navigator.serviceWorker.ready` nunca resolve se o registro do SW falhar
  (rede, extensão, modo privado). `isLoading` fica `true` para sempre e o banner nunca
  aparece.
- **Correção:** timeout de 5s no `ready`. Se estourar, `isSupported = false` e log.

### 1.4 Instrução de instalação do iOS nunca aparece
- **Problema:** o banner só renderiza com `isSupported` verdadeiro. No Safari do iPhone
  **sem** o app instalado, `PushManager` não existe, então `isSupported` é falso e o
  ramo "adicione à Tela de Início" (`notification-permission-banner.tsx:38`) é
  inalcançável. Justamente o usuário que precisa da instrução não a vê.
- **Correção:** avaliar `isIOS && !isStandalone` **antes** do `isSupported` e mostrar o
  banner de instalação nesse caso.

### 1.5 Outro usuário no mesmo celular não consegue ativar push
- **Problema:** o logout não cancela a inscrição. Se o usuário B loga no mesmo aparelho
  (celular compartilhado da loja), o `onConflictDoUpdate` em `push-subscribe` tenta
  atualizar uma linha que é do usuário A. A policy RLS `own_subscriptions` bloqueia o
  UPDATE e a rota responde 500. Pior: até lá, **B recebe os pushes de A**, com o nome
  e a mensagem dos clientes de A.
- **Correção (duas partes):**
  1. No logout (`dashboard-sidebar.tsx:72`), antes de chamar `logout()`, rodar o
     `unsubscribe()` do hook (DELETE na API + `subscription.unsubscribe()`). Isso tem
     que acontecer no cliente, porque a server action não acessa o navegador.
  2. Em `push-subscribe`, apagar via `withAdmin` qualquer linha com o mesmo `endpoint`
     antes do insert. Ter o endpoint prova a posse daquele navegador, já que é uma URL
     longa e impossível de adivinhar.

### 1.6 Service worker
Arquivo: `apps/web/public/sw.js`. Ao mexer, subir `SW_VERSION` para `v2`.
- **Push sem notificação → o iOS revoga a inscrição.** `if (!event.data) return` sai
  sem exibir nada. O Safari exige `showNotification` em **todo** push e cancela a
  inscrição depois de alguns pushes "silenciosos". **Correção:** sempre mostrar uma
  notificação, com texto genérico quando não houver payload.
- **Pré-cache de `/conversations`.** Guarda o HTML de uma página autenticada (dados de
  clientes) no cache. Se a instalação acontecer deslogado, guarda o redirect pro login.
  O cache nunca é usado, porque a navegação só cai no `/offline`. **Correção:**
  pré-cachear só `/offline`.
- **`client.navigate()` no clique da notificação.** Lança erro em janela não controlada
  (`includeUncontrolled: true`) e não é confiável no Safari. **Correção:** `focus()` +
  `postMessage({ type: 'navigate', url })`, tratado por um listener no
  `sw-register.tsx` com `router.push`. Fallback: `openWindow(url)`.
- **Ícone com contador.** Chamar `navigator.setAppBadge()` no push e
  `clearAppBadge()` ao abrir a conversa. Funciona no iOS 16.4+ instalado e no Android.

### 1.7 Envio no backend
Arquivo: `services/backend/src/shared/push-sender.ts`.
- `err: any` viola a convenção do projeto. Trocar por `unknown` com narrowing para
  `WebPushError`.
- O subject VAPID está fixo em `mailto:contato@zapagent.com`, o domínio antigo. A Apple
  rejeita subject inválido com `403 BadJwtToken`. **Correção:** nova env
  `VAPID_SUBJECT` (ex: `mailto:suporte@satori.ia.br`), sem default para domínio antigo.
- Sem `TTL`/`urgency`, o padrão é 4 semanas e prioridade normal: no Android em modo
  econômico, o push de escalada atrasa. **Correção:** `urgency: 'high'` e `TTL: 86400`
  para escalada. `urgency: 'normal'` e `TTL: 3600` para mensagem comum.
- Várias mensagens seguidas do mesmo cliente viram várias notificações. **Correção:**
  `topic` = `conversationId` sem hífens (32 caracteres, dentro do limite), para que o
  serviço de push substitua a anterior.
- Logar `statusCode` e o corpo da resposta nos erros que não são 404/410. É assim que se
  descobre `403` de VAPID errado.

### 1.8 Login perde o destino
- **Problema:** tocar no push abre `/chat/{id}`. Se a sessão expirou, o layout faz
  `redirect('/login')` sem `callbackUrl`, e o login action manda sempre para
  `/dashboard`. O operador perde a conversa que o push mostrou.
- **Correção:** o layout do dashboard passa `?callbackUrl=` com o path atual. O login
  action redireciona para ele, validado como path relativo começando com `/` (e não
  `//`), para não virar open redirect.

---

## Fase 2 — Experiência de app no iPhone e no Android

### 2.1 Notch e barra inferior do iPhone
- **Problema:** o layout usa `statusBarStyle: 'black-translucent'` + `viewportFit: 'cover'`,
  mas não há nenhum `env(safe-area-inset-*)` no CSS. No app instalado, o topo da sidebar
  fica embaixo do relógio/notch e o campo de digitar do chat fica embaixo da barra de
  gestos.
- **Correção:** `padding-top: env(safe-area-inset-top)` no container raiz e
  `padding-bottom: env(safe-area-inset-bottom)` na barra de input do chat e no menu
  mobile.

### 2.2 Altura da tela
- **Problema:** `h-screen` (100vh) no `(dashboard)/layout.tsx`. No iOS, quando o teclado
  abre no chat, o input some ou a página pula.
- **Correção:** trocar por `h-dvh` e testar o chat com o teclado aberto.

### 2.3 Dados velhos ao voltar do segundo plano
- **Problema:** o iOS mata o WebSocket do Pusher quando o app vai pro segundo plano. Ao
  voltar, a lista de conversas está desatualizada até chegar o próximo evento, e não
  existe nenhum `visibilitychange` no código.
- **Correção:** listener de `visibilitychange` que chama `router.refresh()` quando o app
  volta a ficar visível há mais de ~30s.

### 2.4 Manifest
Arquivo: `apps/web/app/manifest.ts`.
- Adicionar `id: '/'` (sem ele, mudar o `start_url` vira "outro app"), `scope: '/'`,
  `lang: 'pt-BR'` e `categories: ['business', 'productivity']`.
- Adicionar `screenshots`: um vertical e um horizontal. Sem eles, o Chrome Android mostra
  o mini-diálogo de instalação, em vez do diálogo rico com prévia.
- Trocar o nome de `SATORI` para `Satori`, como o produto é escrito.

### 2.5 Tela de abertura no iOS
Sem `apple-touch-startup-image`, o app abre com tela branca no iPhone, mesmo com tema
escuro. **Correção:** gerar imagens de abertura para os tamanhos atuais de iPhone, fundo
`#09090b` com o símbolo ciano, e declarar no `metadata.appleWebApp.startupImage`.

---

## Fase 3 — Página pública `/instalar`

O link que você manda pelo WhatsApp junto com o convite do operador.

- Rota pública em `apps/web/app/instalar/page.tsx`. O middleware só protege
  `/diagnostico`, e o dashboard se protege no próprio layout, então nada a liberar.
- Detecta o ambiente e mostra **um** caminho:

| Ambiente detectado | O que a página mostra |
|---|---|
| Android, Chrome/Edge/Samsung | Botão "Instalar Satori" (`beforeinstallprompt`) |
| Android, navegador interno (WhatsApp, Instagram, Facebook) | "Toque em ⋮ → Abrir no Chrome". Navegador interno não instala PWA. |
| iPhone, Safari | Passo a passo com imagens: Compartilhar → Adicionar à Tela de Início → Adicionar |
| iPhone, Chrome/navegador interno | "Abra este link no Safari" + botão de copiar link |
| iOS < 16.4 | Aviso: o app funciona, mas sem notificações. Recomenda atualizar o iOS. |
| Já instalado (`display-mode: standalone`) | "Já instalado" + botão para ativar notificações |
| Computador | Explica que é pra abrir no celular e mostra o link |

- Depois de instalar, a primeira abertura do app (`start_url`) mostra um passo único:
  "Ativar notificações", com botão. No iOS, a permissão **precisa** vir de um toque.
- Reaproveitar a detecção de plataforma num helper `lib/pwa/platform.ts`, que hoje está
  duplicada em `install-prompt.tsx` e `notification-permission-banner.tsx`.

---

## Infra e deploy (onde mais dá errado)

1. **Chaves VAPID.** Gerar uma vez com `npx web-push generate-vapid-keys`.
   - `services/backend` (serviço Swarm `zapagent_backend`, no Portainer):
     `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT`.
   - `apps/web` (Coolify, `satori-frontend`): `NEXT_PUBLIC_VAPID_PUBLIC_KEY`.
     **Cuidado:** é variável de **build**. No Coolify, marque como disponível no build.
     Só em runtime, o bundle vai sem chave e o hook lança "VAPID public key not found".
   - As duas públicas têm que ser **idênticas**. Se não forem, todo push volta `403`.
   - Adicionar `NEXT_PUBLIC_VAPID_PUBLIC_KEY` ao `.env.example` da raiz, onde hoje não
     aparece.
2. **Migration.** Confirmar que `2026-11-18-push-subscriptions.sql` rodou no
   `satori-postgres`: `select to_regclass('public.push_subscriptions')`.
3. **Ordem de deploy.** Primeiro o backend (envio pronto, nada quebra sem inscritos),
   depois o frontend.
4. **Cache do service worker.** O `/sw.js` já sai com `no-cache`. Basta subir
   `SW_VERSION`, e o `skipWaiting` + `clients.claim` já existentes atualizam na
   próxima abertura.

---

## Testes

Playwright não testa push real. A parte automatizável:

- **Unitário (backend):** `push-sender.test.ts`, com `web-push` mockado:
  - remove a linha em 404/410;
  - não remove em 403;
  - não chama nada sem VAPID;
  - aplica `urgency`, `TTL` e `topic` certos.
- **Unitário (backend):** regra de destinatário do webhook (decisão 2):
  - conversa `ai_handling` sem dono → ninguém;
  - `waiting_human` → owner, admin e operadores;
  - com `assignedTo` → só o dono.
- **E2E (Playwright):**
  - `/manifest.webmanifest` válido, com `id`;
  - `/instalar` acessível deslogado;
  - SW registra;
  - `callbackUrl` preservado no login;
  - `callbackUrl=//evil.com` é ignorado.

**Teste manual**, antes de liberar pros clientes:

| Cenário | iPhone (Safari, iOS 17+) | Android (Chrome) |
|---|---|---|
| Instalar pela `/instalar` | ☐ | ☐ |
| Link aberto no navegador do WhatsApp/Instagram cai na instrução certa | ☐ | ☐ |
| Ativar notificações (com toque) | ☐ | ☐ |
| Push de escalada com app fechado e tela bloqueada | ☐ | ☐ |
| Tocar no push abre a conversa certa | ☐ | ☐ |
| Tocar no push com sessão expirada → login → volta pra conversa | ☐ | ☐ |
| 3 mensagens seguidas do mesmo cliente → 1 notificação | ☐ | ☐ |
| Logout + login de outro usuário → o primeiro para de receber | ☐ | ☐ |
| Topo e barra inferior sem sobrepor (notch/gestos) | ☐ | — |
| Teclado aberto no chat sem esconder o campo | ☐ | ☐ |
| Voltar do segundo plano depois de 1 min → lista atualizada | ☐ | ☐ |
| Contador no ícone aparece e zera | ☐ | ☐ |

---

## Limitações aceitas (não têm correção na web)

- No iOS, o usuário precisa instalar manualmente e não existe botão automático. A
  `/instalar` existe para reduzir esse atrito.
- No iOS, se o usuário desativar a notificação nos Ajustes, o app não consegue
  reativar. Só dá para mostrar a instrução.
- Sem execução em segundo plano: o app só atualiza aberto ou via push.
- O som da notificação é o padrão do sistema, sem som customizado.
- Instalação no admin (`admin.satori.ia.br`) é outro app: outra origem, outra
  inscrição. Não é foco.

---

## Ordem e estimativa

| Etapa | Conteúdo | Esforço |
|---|---|---|
| 0 | Decisões 1–3, chaves VAPID, conferir migration | 30 min (você) |
| 1 | Fase 1 completa + testes unitários | 1–1,5 dia |
| 2 | Fase 2 (safe-area, dvh, refresh, manifest, telas de abertura) | 0,5–1 dia |
| 3 | `/instalar` + primeira abertura | 0,5–1 dia |
| 4 | Deploy (backend → frontend) + testes manuais nos dois celulares | 0,5 dia |

Total: **~3 a 4 dias** de trabalho. A Fase 1 sozinha já faz o push funcionar de
verdade pra quem tem o app instalado hoje.
