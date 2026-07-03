# CLAUDE.md — ZapAgent SaaS Platform

## Visão geral do projeto

ZapAgent é uma plataforma SaaS multi-tenant de atendimento automatizado via WhatsApp com agente de IA. A IA atende os clientes, responde dúvidas, indica produtos com imagens, agenda horários e escala para atendentes humanos quando necessário.

O sistema atende múltiplos segmentos (clínicas, lojas, prestadores de serviço, etc). Cada tenant configura seu próprio agente de IA com tom, regras e catálogo personalizados.

### Hierarquia de acesso (3 níveis)

1. **Super Admin (dono da plataforma)** — Acessa o painel `/admin`. Cria, edita, suspende e exclui tenants. Vê métricas globais de todos os tenants. Gerencia planos e cobranças. Ao criar um novo tenant, passa por um fluxo de onboarding que coleta as informações do negócio e já cria automaticamente um agente SDR/Vendedor pré-configurado.

2. **Tenant (cliente da plataforma)** — Acessa o painel `/dashboard`. Vê somente os dados do seu negócio. Gerencia seu kanban, leads, produtos, agenda, equipe e configurações da IA. O owner do tenant pode convidar operadores.

3. **Operador** — Acessa o painel `/dashboard` com permissões limitadas. Atende chats escalados, move cards no kanban, visualiza agenda. Não acessa configurações do tenant.

---

## Stack tecnológica

| Camada | Tecnologia | Justificativa |
|--------|-----------|---------------|
| **IDE/Dev** | Google Antigravity + Claude Code | Desenvolvimento agent-first com skills e workflows |
| **Frontend** | Next.js 14+ (App Router) + Tailwind CSS + shadcn/ui | SSR, RSC, tipagem forte |
| **Backend/API** | Supabase Edge Functions (Deno/TypeScript) | Serverless, baixa latência, integrado ao banco |
| **Banco de dados** | Supabase PostgreSQL + RLS | Multi-tenancy nativo via Row Level Security |
| **Autenticação** | Supabase Auth (JWT) | Login, roles, magic link, OAuth |
| **Realtime** | Supabase Realtime (Postgres Changes) | Chat ao vivo, kanban em tempo real |
| **WhatsApp** | Evolution API v2 (self-hosted) | Open-source, suporta Baileys e Cloud API |
| **IA/LLM** | Claude API (Anthropic) com function calling | Geração de respostas + execução de ações |
| **Armazenamento de imagens** | Cloudinary ou MinIO (S3-compatible) | Imagens de produtos otimizadas |
| **Fila/Jobs** | Supabase pg_cron + Database Webhooks | Lembretes, jobs agendados |
| **Deploy** | Vercel (frontend) + VPS/Docker (Evolution API) | |

---

## Estrutura de pastas do projeto

```
zapagent/
├── CLAUDE.md                          # Este arquivo
├── .agent/                            # Antigravity Kit (skills, agents, workflows)
│   ├── agents/
│   ├── skills/
│   ├── workflows/
│   ├── rules/
│   └── ARCHITECTURE.md
├── .claude/                           # Claude Code config (mirror de .agent para CC)
│   └── skills/                        # Mesmos skills do .agent/skills/
├── apps/
│   └── web/                           # Frontend Next.js
│       ├── app/
│       │   ├── (auth)/                # Login, registro, forgot password
│       │   ├── (admin)/               # Layout do Super Admin (você)
│       │   │   ├── admin/
│       │   │   │   ├── dashboard/     # Métricas globais (total tenants, msgs, receita)
│       │   │   │   ├── tenants/       # Lista de todos os tenants
│       │   │   │   │   ├── page.tsx   # Tabela com filtros, busca, status
│       │   │   │   │   ├── [id]/      # Detalhe do tenant (editar, suspender)
│       │   │   │   │   └── new/       # Fluxo de onboarding (wizard multi-step)
│       │   │   │   │       ├── page.tsx
│       │   │   │   │       └── steps/ # Componentes de cada step
│       │   │   │   │           ├── step-business-info.tsx    # Nome, segmento, contato
│       │   │   │   │           ├── step-whatsapp-setup.tsx   # Número, tipo conexão
│       │   │   │   │           ├── step-ai-agent-config.tsx  # Tom, personalidade, regras
│       │   │   │   │           ├── step-products-services.tsx # Cadastro inicial (opcional)
│       │   │   │   │           ├── step-business-hours.tsx   # Horários de funcionamento
│       │   │   │   │           └── step-review-activate.tsx  # Resumo + ativar
│       │   │   │   ├── plans/         # Gestão de planos e limites
│       │   │   │   ├── analytics/     # Métricas cross-tenant
│       │   │   │   └── settings/      # Config global da plataforma
│       │   │   └── layout.tsx         # Sidebar admin (diferente do tenant)
│       │   ├── (dashboard)/           # Layout do Tenant (cliente)
│       │   │   ├── dashboard/         # Visão geral com métricas do tenant
│       │   │   ├── conversations/     # Kanban de atendimentos
│       │   │   ├── chat/[id]/         # Chat ao vivo com cliente
│       │   │   ├── contacts/          # Lista de contatos/leads
│       │   │   ├── products/          # CRUD de produtos com upload de imagem
│       │   │   ├── appointments/      # Agenda e agendamentos
│       │   │   ├── ai-agents/         # Ver e editar agentes de IA (SDR, Suporte, etc)
│       │   │   ├── settings/          # Config do tenant, prompt da IA, horários
│       │   │   └── team/              # Gestão de operadores
│       │   ├── api/                   # API routes (se necessário)
│       │   └── layout.tsx
│       ├── components/
│       │   ├── ui/                    # shadcn/ui components
│       │   ├── kanban/                # Board, Column, Card
│       │   ├── chat/                  # MessageBubble, ChatInput, ChatSidebar
│       │   ├── products/              # ProductCard, ProductForm, ImageUploader
│       │   └── appointments/          # Calendar, TimeSlotPicker, AppointmentCard
│       ├── lib/
│       │   ├── supabase/
│       │   │   ├── client.ts          # Browser client
│       │   │   ├── server.ts          # Server client (RSC)
│       │   │   └── middleware.ts      # Auth middleware
│       │   ├── cloudinary.ts          # Upload helper (ou minio.ts)
│       │   └── utils.ts
│       ├── hooks/
│       │   ├── use-realtime.ts        # Subscribe a changes do Supabase
│       │   ├── use-conversations.ts
│       │   └── use-appointments.ts
│       ├── types/
│       │   └── database.ts            # Tipos gerados pelo Supabase CLI
│       ├── tailwind.config.ts
│       ├── next.config.ts
│       └── package.json
├── supabase/
│   ├── config.toml
│   ├── migrations/                    # SQL migrations versionadas
│   │   ├── 001_create_super_admins.sql
│   │   ├── 002_create_tenants.sql
│   │   ├── 003_create_users.sql
│   │   ├── 004_create_contacts.sql
│   │   ├── 005_create_conversations.sql
│   │   ├── 006_create_messages.sql
│   │   ├── 007_create_products.sql
│   │   ├── 008_create_appointments.sql
│   │   ├── 009_create_kanban_stages.sql
│   │   ├── 010_create_ai_agents.sql
│   │   ├── 011_create_onboarding_logs.sql
│   │   ├── 012_enable_rls.sql
│   │   └── 013_create_functions.sql
│   └── functions/
│       ├── webhook-evolution/         # Recebe msgs do WhatsApp
│       │   └── index.ts
│       ├── process-message/           # Processa msg com IA
│       │   └── index.ts
│       ├── send-whatsapp/             # Envia msg via Evolution API
│       │   └── index.ts
│       ├── schedule-reminder/         # Dispara lembretes agendados
│       │   └── index.ts
│       ├── onboard-tenant/            # Cria tenant completo (chamado pelo wizard admin)
│       │   └── index.ts
│       ├── setup-ai-agent/            # Cria agente SDR pré-configurado
│       │   └── index.ts
│       └── _shared/
│           ├── claude-client.ts       # Wrapper da Claude API
│           ├── evolution-client.ts    # Wrapper da Evolution API
│           ├── supabase-admin.ts      # Service role client
│           └── types.ts
├── docker/
│   ├── docker-compose.yml             # Evolution API + MinIO (se usar)
│   └── evolution/
│       └── .env.example
├── docs/
│   ├── ARCHITECTURE.md
│   ├── API.md
│   └── DEPLOYMENT.md
└── package.json
```

---

## Modelo de dados (PostgreSQL)

### Tabela: super_admins (você, dono da plataforma)
```sql
CREATE TABLE super_admins (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  full_name TEXT NOT NULL,
  email TEXT NOT NULL UNIQUE,
  avatar_url TEXT,
  active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- RLS: somente super admins veem essa tabela
ALTER TABLE super_admins ENABLE ROW LEVEL SECURITY;
CREATE POLICY "super_admin_self" ON super_admins
  USING (id = auth.uid());
-- Service role tem acesso total (para edge functions)
CREATE POLICY "service_role_full" ON super_admins
  FOR ALL USING (auth.role() = 'service_role');
```

### Tabela: tenants
```sql
CREATE TABLE tenants (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  slug TEXT UNIQUE NOT NULL,
  -- Dados do negócio (coletados no onboarding)
  business_segment TEXT,                  -- 'clinica', 'loja', 'servicos', 'restaurante', 'outro'
  business_description TEXT,              -- Descrição livre do negócio
  owner_name TEXT,                        -- Nome do responsável
  owner_email TEXT,                       -- Email do responsável
  owner_phone TEXT,                       -- Telefone do responsável
  address TEXT,
  city TEXT,
  state TEXT,
  website TEXT,
  -- Plano e status
  plan TEXT NOT NULL DEFAULT 'free' CHECK (plan IN ('free', 'starter', 'pro', 'enterprise')),
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('onboarding', 'active', 'suspended', 'cancelled')),
  onboarding_completed_at TIMESTAMPTZ,
  -- WhatsApp
  whatsapp_instance_name TEXT,
  whatsapp_number TEXT,
  whatsapp_connection_type TEXT DEFAULT 'baileys' CHECK (whatsapp_connection_type IN ('baileys', 'cloud_api')),
  whatsapp_connected BOOLEAN DEFAULT false,
  -- Config geral
  business_hours JSONB DEFAULT '{"mon": {"start": "08:00", "end": "18:00"}, "tue": {"start": "08:00", "end": "18:00"}, "wed": {"start": "08:00", "end": "18:00"}, "thu": {"start": "08:00", "end": "18:00"}, "fri": {"start": "08:00", "end": "18:00"}}',
  appointment_duration_minutes INTEGER DEFAULT 30,
  appointment_slot_interval_minutes INTEGER DEFAULT 30,
  timezone TEXT DEFAULT 'America/Sao_Paulo',
  cloudinary_cloud_name TEXT,
  cloudinary_upload_preset TEXT,
  logo_url TEXT,
  -- Limites do plano
  max_messages_month INTEGER DEFAULT 1000,
  max_products INTEGER DEFAULT 50,
  max_operators INTEGER DEFAULT 3,
  messages_used_month INTEGER DEFAULT 0,
  -- Metadata
  created_by UUID REFERENCES super_admins(id),  -- Qual super admin criou
  active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);
```

### Tabela: ai_agents (agentes de IA por tenant)
```sql
CREATE TABLE ai_agents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  name TEXT NOT NULL,                     -- "SDR/Vendedor", "Suporte", "Agendamento"
  slug TEXT NOT NULL,                     -- "sdr", "suporte", "agendamento"
  type TEXT NOT NULL DEFAULT 'sdr'
    CHECK (type IN ('sdr', 'support', 'scheduler', 'custom')),
  is_active BOOLEAN DEFAULT true,
  is_default BOOLEAN DEFAULT false,       -- Agente que atende por padrão
  -- Configuração do LLM
  model TEXT NOT NULL DEFAULT 'claude-sonnet-4-20250514',
  temperature NUMERIC(3,2) DEFAULT 0.7,
  max_tokens INTEGER DEFAULT 1024,
  -- Prompt e personalidade
  system_prompt TEXT NOT NULL,
  personality TEXT,                       -- "Simpático e proativo", "Formal e técnico"
  language TEXT DEFAULT 'pt-BR',
  -- Regras de comportamento
  greeting_message TEXT,                  -- Mensagem de boas-vindas
  farewell_message TEXT,                  -- Mensagem de despedida
  out_of_hours_message TEXT,              -- Mensagem fora do horário
  escalation_rules JSONB DEFAULT '{"max_turns_without_resolution": 10, "low_confidence_threshold": 0.3, "escalation_keywords": ["falar com humano", "atendente", "gerente"]}',
  -- Capacidades (quais tools o agente pode usar)
  can_search_products BOOLEAN DEFAULT true,
  can_book_appointments BOOLEAN DEFAULT true,
  can_send_images BOOLEAN DEFAULT true,
  can_escalate BOOLEAN DEFAULT true,
  can_collect_lead_info BOOLEAN DEFAULT true,
  -- Instruções específicas por tipo
  sdr_instructions JSONB DEFAULT '{
    "qualification_questions": ["Qual seu nome?", "Qual produto/serviço te interessa?", "Qual seu orçamento?"],
    "follow_up_after_hours": 24,
    "auto_tag_leads": true,
    "lead_scoring_enabled": true
  }',
  -- Métricas
  total_conversations INTEGER DEFAULT 0,
  total_escalations INTEGER DEFAULT 0,
  avg_response_time_seconds INTEGER,
  satisfaction_score NUMERIC(3,2),
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(tenant_id, slug)
);
```

### Template do agente SDR/Vendedor (criado automaticamente no onboarding)
```sql
-- Este é o prompt padrão injetado ao criar um novo tenant.
-- O onboard-tenant edge function personaliza {placeholders} com dados do negócio.

INSERT INTO ai_agents (tenant_id, name, slug, type, is_active, is_default, system_prompt, personality, greeting_message, farewell_message, out_of_hours_message)
VALUES (
  '{tenant_id}',
  'SDR / Vendedor',
  'sdr',
  'sdr',
  true,
  true,
  '## Identidade
Você é o assistente virtual da {nome_empresa}, especializada em {segmento}.
Seu nome é {nome_agente}. Você é um vendedor/SDR digital.

## Objetivo principal
Atender clientes no WhatsApp, qualificar leads, apresentar produtos/serviços,
agendar atendimentos e converter interessados em clientes.

## Tom e personalidade
{personalidade}

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

## Informações do negócio
- Empresa: {nome_empresa}
- Segmento: {segmento}
- Descrição: {descricao_negocio}
- Horário: {horario_funcionamento}
- Endereço: {endereco}

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
- Não discuta política, religião ou temas polêmicos',
  'Simpático, proativo e focado em ajudar o cliente a encontrar o que precisa',
  'Olá! 👋 Bem-vindo(a) à {nome_empresa}! Sou o assistente virtual. Como posso te ajudar hoje?',
  'Foi um prazer atender você! Se precisar de algo mais, é só chamar. Até logo! 😊',
  'Olá! Nosso horário de atendimento é {horario_funcionamento}. Deixe sua mensagem que responderemos assim que possível!'
);
```

### Tabela: onboarding_logs (auditoria do processo)
```sql
CREATE TABLE onboarding_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  created_by UUID NOT NULL REFERENCES super_admins(id),
  step TEXT NOT NULL,                     -- 'business_info', 'whatsapp', 'ai_config', 'products', 'hours', 'activated'
  step_data JSONB DEFAULT '{}',           -- Dados coletados no step
  completed_at TIMESTAMPTZ DEFAULT now()
);
```

### Tabela: users (operadores do painel)
```sql
CREATE TABLE users (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  full_name TEXT NOT NULL,
  email TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'operator' CHECK (role IN ('owner', 'admin', 'operator')),
  avatar_url TEXT,
  is_available BOOLEAN DEFAULT true,
  active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- NOTA: O super_admin NÃO é um user de tenant. Ele tem sua própria tabela.
-- O owner é criado automaticamente no onboarding quando o super admin
-- cadastra o email do responsável pelo tenant.
```

### Tabela: contacts (leads/clientes do WhatsApp)
```sql
CREATE TABLE contacts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  whatsapp_number TEXT NOT NULL,
  whatsapp_name TEXT,
  custom_name TEXT,                      -- Nome editado pelo operador
  email TEXT,
  phone TEXT,
  notes TEXT,
  tags TEXT[] DEFAULT '{}',
  metadata JSONB DEFAULT '{}',
  first_contact_at TIMESTAMPTZ DEFAULT now(),
  last_contact_at TIMESTAMPTZ DEFAULT now(),
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(tenant_id, whatsapp_number)
);
```

### Tabela: kanban_stages
```sql
CREATE TABLE kanban_stages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  slug TEXT NOT NULL,
  color TEXT DEFAULT '#6366f1',
  position INTEGER NOT NULL DEFAULT 0,   -- Ordem da coluna
  is_default BOOLEAN DEFAULT false,      -- Stage inicial para novos contatos
  is_closed BOOLEAN DEFAULT false,       -- Marca como finalizado
  auto_assign BOOLEAN DEFAULT false,     -- Se IA atribui automaticamente
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(tenant_id, slug)
);

-- Stages padrão criados via trigger ao criar tenant:
-- 1. novo_lead (default)
-- 2. ia_atendendo
-- 3. aguardando_humano
-- 4. em_atendimento
-- 5. agendado
-- 6. finalizado (closed)
```

### Tabela: conversations
```sql
CREATE TABLE conversations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  contact_id UUID NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,
  ai_agent_id UUID REFERENCES ai_agents(id),  -- Qual agente de IA está atendendo
  kanban_stage_id UUID REFERENCES kanban_stages(id),
  assigned_to UUID REFERENCES users(id),  -- Operador humano atribuído
  status TEXT NOT NULL DEFAULT 'ai_handling'
    CHECK (status IN ('ai_handling', 'waiting_human', 'human_handling', 'closed')),
  ai_context JSONB DEFAULT '{}',          -- Contexto acumulado da IA
  ai_summary TEXT,                        -- Resumo gerado pela IA ao escalar
  priority TEXT DEFAULT 'normal' CHECK (priority IN ('low', 'normal', 'high', 'urgent')),
  channel TEXT DEFAULT 'whatsapp',
  started_at TIMESTAMPTZ DEFAULT now(),
  closed_at TIMESTAMPTZ,
  last_message_at TIMESTAMPTZ DEFAULT now(),
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT now()
);
```

### Tabela: messages
```sql
CREATE TABLE messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  conversation_id UUID NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  contact_id UUID NOT NULL REFERENCES contacts(id),
  sender_type TEXT NOT NULL CHECK (sender_type IN ('customer', 'ai', 'human', 'system')),
  sender_id UUID,                         -- user.id se human, null se ai/customer
  content TEXT,
  content_type TEXT DEFAULT 'text'
    CHECK (content_type IN ('text', 'image', 'audio', 'video', 'document', 'location', 'product_card')),
  media_url TEXT,
  media_mime_type TEXT,
  whatsapp_message_id TEXT,               -- ID da msg no WhatsApp (pra tracking)
  ai_tool_calls JSONB,                    -- Tools que a IA chamou nessa resposta
  ai_confidence NUMERIC(3,2),             -- Confiança da IA na resposta
  is_read BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT now()
);
```

### Tabela: products
```sql
CREATE TABLE products (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  short_description TEXT,                 -- Versão curta pra WhatsApp
  price NUMERIC(12,2),
  price_display TEXT,                     -- "A partir de R$ 99,90" ou "Sob consulta"
  currency TEXT DEFAULT 'BRL',
  category TEXT,
  subcategory TEXT,
  tags TEXT[] DEFAULT '{}',
  images JSONB DEFAULT '[]',              -- [{url, thumbnail_url, alt, position}]
  is_available BOOLEAN DEFAULT true,
  is_featured BOOLEAN DEFAULT false,
  metadata JSONB DEFAULT '{}',            -- Campos extras configuráveis por tenant
  search_vector TSVECTOR,                -- Full text search
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Índice para busca textual
CREATE INDEX idx_products_search ON products USING GIN(search_vector);

-- Trigger para atualizar search_vector
CREATE OR REPLACE FUNCTION update_product_search_vector()
RETURNS TRIGGER AS $$
BEGIN
  NEW.search_vector := to_tsvector('portuguese',
    coalesce(NEW.name, '') || ' ' ||
    coalesce(NEW.description, '') || ' ' ||
    coalesce(NEW.category, '') || ' ' ||
    coalesce(array_to_string(NEW.tags, ' '), '')
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
```

### Tabela: appointments
```sql
CREATE TABLE appointments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  contact_id UUID NOT NULL REFERENCES contacts(id),
  conversation_id UUID REFERENCES conversations(id),
  assigned_to UUID REFERENCES users(id),
  title TEXT,
  notes TEXT,
  date DATE NOT NULL,
  start_time TIME NOT NULL,
  end_time TIME NOT NULL,
  status TEXT NOT NULL DEFAULT 'confirmed'
    CHECK (status IN ('pending', 'confirmed', 'cancelled', 'completed', 'no_show')),
  reminder_24h_sent BOOLEAN DEFAULT false,
  reminder_1h_sent BOOLEAN DEFAULT false,
  whatsapp_reminder_sent BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  -- Prevenir conflitos de horário
  EXCLUDE USING gist (
    tenant_id WITH =,
    tsrange(
      (date + start_time) AT TIME ZONE 'America/Sao_Paulo',
      (date + end_time) AT TIME ZONE 'America/Sao_Paulo'
    ) WITH &&
  ) WHERE (status NOT IN ('cancelled'))
);
```

### Row Level Security (RLS)
```sql
-- Padrão aplicado em TODAS as tabelas de tenant:
ALTER TABLE [table] ENABLE ROW LEVEL SECURITY;

-- Policy padrão: tenant isolation (para users do tenant)
CREATE POLICY "tenant_isolation" ON [table]
  USING (tenant_id = (auth.jwt() ->> 'tenant_id')::UUID);

-- Policy para service role (edge functions):
CREATE POLICY "service_role_full_access" ON [table]
  FOR ALL
  USING (auth.role() = 'service_role');

-- Policy para super admin (vê TODOS os tenants):
-- O super admin tem um custom claim 'is_super_admin' = true no JWT
CREATE POLICY "super_admin_full_access" ON [table]
  FOR ALL
  USING ((auth.jwt() ->> 'is_super_admin')::BOOLEAN = true);

-- Middleware do Next.js verifica o role e redireciona:
-- super_admin → /admin/dashboard
-- owner/admin/operator → /dashboard
-- sem auth → /login
```

---

## Lógica das Edge Functions

### 0. onboard-tenant (wizard de criação de tenant pelo super admin)

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

### 1. setup-ai-agent (cria agente SDR automaticamente)

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

### 2. webhook-evolution (recebe mensagens)

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
9. Se conversation.status == 'ai_handling' → invocar edge function process-message
10. Atualizar last_message_at e last_contact_at
```

### 2. process-message (IA processa e responde)

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
5. Definir tools (function calling):
   - search_products(query, category?, max_results?)
   - check_availability(date?, period?)
   - book_appointment(date, start_time, contact_name)
   - cancel_appointment(appointment_id)
   - escalate_to_human(reason, summary)
   - send_product_image(product_id)
   - get_business_info()
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

### 3. send-whatsapp (envia via Evolution API)

```
FLUXO:
1. Receber: instanceName, número destino, conteúdo, tipo
2. Se tipo == 'text':
   POST /message/sendText/{instance}
   Body: { number, text }
3. Se tipo == 'image' (produto):
   POST /message/sendMedia/{instance}
   Body: { number, mediatype: 'image', media: url, caption }
4. Se tipo == 'product_card':
   Montar mensagem formatada com nome, preço, descrição curta e imagem
5. Salvar whatsapp_message_id retornado
```

### 4. schedule-reminder (pg_cron)

```
FLUXO (roda a cada 15 minutos via pg_cron):
1. Buscar agendamentos onde:
   - reminder_24h_sent = false E faltam <= 24h
   - OU reminder_1h_sent = false E faltam <= 1h
2. Para cada: enviar mensagem via send-whatsapp
3. Atualizar flag de reminder enviado
```

---

## Claude API — Function Calling (tools)

```typescript
// supabase/functions/_shared/claude-tools.ts

export const AI_TOOLS = [
  {
    name: "search_products",
    description: "Busca produtos no catálogo do estabelecimento. Use quando o cliente perguntar sobre produtos, preços, disponibilidade ou pedir recomendações.",
    input_schema: {
      type: "object",
      properties: {
        query: { type: "string", description: "Termo de busca (nome, categoria ou descrição)" },
        category: { type: "string", description: "Filtrar por categoria específica" },
        max_results: { type: "number", description: "Máximo de resultados (padrão: 5)" },
        price_max: { type: "number", description: "Preço máximo" }
      },
      required: ["query"]
    }
  },
  {
    name: "check_availability",
    description: "Consulta horários disponíveis para agendamento. Use quando o cliente quiser marcar, agendar ou saber horários livres.",
    input_schema: {
      type: "object",
      properties: {
        date: { type: "string", description: "Data no formato YYYY-MM-DD. Se não informada, usa os próximos 7 dias." },
        period: { type: "string", enum: ["morning", "afternoon", "evening"], description: "Período do dia preferido" }
      }
    }
  },
  {
    name: "book_appointment",
    description: "Cria um agendamento confirmado. Use SOMENTE após o cliente confirmar data e horário.",
    input_schema: {
      type: "object",
      properties: {
        date: { type: "string", description: "Data YYYY-MM-DD" },
        start_time: { type: "string", description: "Horário HH:MM" },
        contact_name: { type: "string", description: "Nome do cliente" },
        notes: { type: "string", description: "Observações do agendamento" }
      },
      required: ["date", "start_time"]
    }
  },
  {
    name: "cancel_appointment",
    description: "Cancela um agendamento existente. Confirme com o cliente antes de cancelar.",
    input_schema: {
      type: "object",
      properties: {
        appointment_id: { type: "string", description: "ID do agendamento" },
        reason: { type: "string", description: "Motivo do cancelamento" }
      },
      required: ["appointment_id"]
    }
  },
  {
    name: "escalate_to_human",
    description: "Transfere o atendimento para um operador humano. Use quando: não souber responder, o cliente pedir, assunto sensível, ou reclamação complexa.",
    input_schema: {
      type: "object",
      properties: {
        reason: { type: "string", description: "Motivo da escalação" },
        summary: { type: "string", description: "Resumo do que foi tratado até agora" },
        priority: { type: "string", enum: ["normal", "high", "urgent"], description: "Prioridade" }
      },
      required: ["reason", "summary"]
    }
  },
  {
    name: "send_product_image",
    description: "Envia a imagem de um produto específico para o cliente. Use após recomendar um produto que tem imagem.",
    input_schema: {
      type: "object",
      properties: {
        product_id: { type: "string", description: "ID do produto" }
      },
      required: ["product_id"]
    }
  },
  {
    name: "get_business_info",
    description: "Retorna informações do estabelecimento como horário de funcionamento, endereço, contato. Use quando o cliente perguntar sobre o negócio.",
    input_schema: {
      type: "object",
      properties: {}
    }
  }
];
```

---

## Evolution API — Integração

### Setup por tenant

```typescript
// Criar instância para novo tenant
POST {EVOLUTION_API_URL}/instance/create
{
  "instanceName": "tenant_{tenant_slug}",
  "token": "{tenant_specific_token}",
  "qrcode": true,                        // true para Baileys
  "integration": "WHATSAPP-BAILEYS"       // ou "WHATSAPP-BUSINESS"
}

// Configurar webhook
POST {EVOLUTION_API_URL}/webhook/set/{instanceName}
{
  "url": "{SUPABASE_FUNCTIONS_URL}/webhook-evolution",
  "webhook_by_events": true,
  "events": [
    "MESSAGES_UPSERT",
    "CONNECTION_UPDATE",
    "CONTACTS_UPSERT"
  ]
}
```

### Eventos que o webhook recebe
- `MESSAGES_UPSERT` — Nova mensagem (principal)
- `CONNECTION_UPDATE` — Status da conexão (QR code, connected, disconnected)
- `CONTACTS_UPSERT` — Atualização de contato (nome, foto)

### Envio de mensagens

```typescript
// Texto simples
POST /message/sendText/{instanceName}
{ "number": "5562999999999", "text": "Olá! Como posso ajudar?" }

// Imagem com legenda
POST /message/sendMedia/{instanceName}
{
  "number": "5562999999999",
  "mediatype": "image",
  "media": "https://res.cloudinary.com/xxx/image/upload/product.jpg",
  "caption": "📦 *Produto X*\n💰 R$ 99,90\nDisponível para entrega!"
}
```
## Evolution API por tenant

### Campos na tabela tenants (substituir os antigos de WhatsApp)
```sql
-- Remover variável global EVOLUTION_API_URL do .env
-- Cada tenant tem sua própria conexão com Evolution API

ALTER TABLE tenants ADD COLUMN evolution_api_url TEXT;
ALTER TABLE tenants ADD COLUMN evolution_api_key TEXT;
-- evolution_instance_name já existe, manter
```

### Step 2 do onboarding wizard (substituir o anterior)
```
Step 2 - Configuração do WhatsApp:
  - URL da Evolution API *          (input text, ex: https://evo.seuservidor.com)
  - API Key da Evolution *          (input password)
  - Nome da instância *             (input text, ou botão "Criar nova instância")
  - Número do WhatsApp *
  - Tipo de conexão (Baileys / Cloud API)
  
  Ao preencher URL + API Key, o frontend faz um teste de conexão:
  GET {evolution_api_url}/instance/connectionState/{instanceName}
  Header: apikey: {evolution_api_key}
  
  Se responder → badge verde "Conectado"
  Se falhar → badge vermelho "Não encontrado" + opção de criar instância
  
  Botão "Criar nova instância" chama:
  POST {evolution_api_url}/instance/create
  Header: apikey: {evolution_api_key}
  Body: { instanceName, qrcode: true, integration: tipo_conexao }
  
  Após criar, exibe QR code pra conectar (se Baileys)
```

### Edge functions: trocar URL fixa por URL do tenant

```typescript
// supabase/functions/_shared/evolution-client.ts

// ANTES (errado — URL global):
// const EVOLUTION_URL = Deno.env.get('EVOLUTION_API_URL');

// DEPOIS (correto — URL por tenant):
export async function getEvolutionClient(tenantId: string) {
  const { data: tenant } = await supabaseAdmin
    .from('tenants')
    .select('evolution_api_url, evolution_api_key, evolution_instance_name')
    .eq('id', tenantId)
    .single();

  if (!tenant?.evolution_api_url) throw new Error('Evolution API não configurada');

  return {
    url: tenant.evolution_api_url,
    apiKey: tenant.evolution_api_key,
    instanceName: tenant.evolution_instance_name,

    async sendText(number: string, text: string) {
      return fetch(`${tenant.evolution_api_url}/message/sendText/${tenant.evolution_instance_name}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'apikey': tenant.evolution_api_key
        },
        body: JSON.stringify({ number, text })
      });
    },

    async sendMedia(number: string, mediaUrl: string, caption: string) {
      return fetch(`${tenant.evolution_api_url}/message/sendMedia/${tenant.evolution_instance_name}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'apikey': tenant.evolution_api_key
        },
        body: JSON.stringify({ number, mediatype: 'image', media: mediaUrl, caption })
      });
    },

    async checkConnection() {
      return fetch(`${tenant.evolution_api_url}/instance/connectionState/${tenant.evolution_instance_name}`, {
        headers: { 'apikey': tenant.evolution_api_key }
      });
    }
  };
}
```

### webhook-evolution: identificar tenant pela instância

```typescript
// No webhook, a Evolution envia o instanceName no payload.
// Buscar tenant por evolution_instance_name ao invés de variável global.

const { instance } = req.body;
const { data: tenant } = await supabaseAdmin
  .from('tenants')
  .select('id, evolution_api_url, evolution_api_key')
  .eq('evolution_instance_name', instance)
  .single();

if (!tenant) return new Response('Tenant not found', { status: 404 });
```

### onboard-tenant: configurar webhook automaticamente

```typescript
// Após criar a instância (ou validar a existente),
// configurar o webhook apontando pro Supabase:

await fetch(`${tenant.evolution_api_url}/webhook/set/${instanceName}`, {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'apikey': tenant.evolution_api_key
  },
  body: JSON.stringify({
    url: `${Deno.env.get('SUPABASE_FUNCTIONS_URL')}/webhook-evolution`,
    webhook_by_events: true,
    events: ['MESSAGES_UPSERT', 'CONNECTION_UPDATE', 'CONTACTS_UPSERT']
  })
});
```

### Variáveis de ambiente (atualizar)

```env
# REMOVER:
# EVOLUTION_API_URL=          (não é mais global)
# EVOLUTION_API_GLOBAL_TOKEN= (não é mais global)

# MANTER:
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=
SUPABASE_DB_URL=
ANTHROPIC_API_KEY=
NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME=
NEXT_PUBLIC_CLOUDINARY_UPLOAD_PRESET=
```

### Segurança: criptografar API key do tenant

```sql
-- A evolution_api_key é sensível. Usar pgcrypto pra criptografar:
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- Na inserção:
UPDATE tenants SET evolution_api_key = pgp_sym_encrypt(
  'raw_api_key',
  current_setting('app.encryption_key')
) WHERE id = tenant_id;

-- Na leitura (só via service role nas edge functions):
SELECT pgp_sym_decrypt(
  evolution_api_key::bytea,
  current_setting('app.encryption_key')
) as evolution_api_key FROM tenants WHERE id = tenant_id;
```

Adicionar no .env do Supabase:
```env
ENCRYPTION_KEY=sua_chave_de_criptografia_aqui
```
---

## Armazenamento de imagens

### Opção 1: Cloudinary (recomendado para produção)

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

### Opção 2: MinIO (self-hosted)

```typescript
// Usar Supabase Storage ou MinIO com SDK S3-compatible
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';

const s3 = new S3Client({
  endpoint: process.env.MINIO_ENDPOINT,
  region: 'us-east-1',
  credentials: {
    accessKeyId: process.env.MINIO_ACCESS_KEY,
    secretAccessKey: process.env.MINIO_SECRET_KEY
  },
  forcePathStyle: true
});
```

---

## Frontend — Componentes-chave

### Kanban Board

```
Estrutura:
- KanbanBoard: container principal, carrega stages e conversations
- KanbanColumn: uma coluna (stage), recebe drop
- KanbanCard: um card (conversation), draggable
- Usar @dnd-kit/core para drag & drop
- Subscribe ao Supabase Realtime para atualizações em tempo real:
  supabase.channel('conversations')
    .on('postgres_changes', { event: '*', schema: 'public', table: 'conversations' }, handler)
    .subscribe()
```

### Chat ao vivo

```
Estrutura:
- ChatView: layout com sidebar + área de mensagens
- ChatSidebar: lista de conversas ativas (filtráveis por status)
- ChatMessages: scroll de mensagens com auto-scroll
- ChatInput: textarea + botões (enviar, template, anexo)
- MessageBubble: bolha com estilo diferente por sender_type
- Realtime subscription por conversation_id
- Quando operador envia msg:
  1. Salvar na tabela messages (sender_type: 'human')
  2. Enviar via edge function send-whatsapp
  3. Realtime atualiza a UI automaticamente
```

### Catálogo de produtos

```
Estrutura:
- ProductList: grid de produtos com filtro e busca
- ProductCard: card com imagem, nome, preço, status
- ProductForm: formulário de criação/edição
- ImageUploader: drag & drop com preview, upload para Cloudinary/MinIO
  - Aceitar: jpg, png, webp (máx 5MB)
  - Gerar thumbnail automaticamente
  - Permitir reordenar imagens (posição)
```

### Agenda

```
Estrutura:
- AppointmentCalendar: visão semanal/mensal
- TimeSlotPicker: seletor de horários disponíveis
- AppointmentCard: card com info do agendamento
- AppointmentForm: criação manual
- Usar date-fns com timezone do tenant
- Cores por status: confirmed=verde, pending=amarelo, cancelled=vermelho
```

---

## Variáveis de ambiente

```env
# Supabase
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=
SUPABASE_DB_URL=

# Claude API
ANTHROPIC_API_KEY=

# Evolution API
EVOLUTION_API_URL=http://localhost:8080
EVOLUTION_API_GLOBAL_TOKEN=

# Cloudinary (se usar)
NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME=
NEXT_PUBLIC_CLOUDINARY_UPLOAD_PRESET=

# MinIO (se usar)
MINIO_ENDPOINT=http://localhost:9000
MINIO_ACCESS_KEY=
MINIO_SECRET_KEY=
MINIO_BUCKET=zapagent
```

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

### Supabase Edge Functions
- Cada function em sua pasta com `index.ts`
- Código compartilhado em `_shared/`
- Usar `Deno.serve()` (não `serve()` importado)
- Sempre validar input com Zod
- Sempre retornar JSON com status code apropriado
- Log de erros com `console.error()` (aparece no Supabase Dashboard)
- Usar service role client para operações administrativas
- NUNCA expor o service role key no frontend

### Frontend (Next.js)
- App Router com Server Components por padrão
- Client Components apenas quando necessário (interatividade, hooks)
- Usar `'use client'` no topo dos Client Components
- Fetching de dados via Server Components + Supabase server client
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

## Antigravity Kit — Skills e Workflows relevantes

### Setup inicial
```bash
npx antigravity-kit init
```
Isso instala a pasta `.agent/` com 20 agentes, 36 skills e 11 workflows.

Para usar com Claude Code, copiar os skills para `.claude/skills/` também.

### Workflows recomendados para este projeto

| Workflow | Quando usar |
|----------|-------------|
| `/plan` | Antes de iniciar qualquer feature nova — gera plano estruturado |
| `/create` | Scaffolding de novas features (detecta Next.js automaticamente) |
| `/debug` | Debugging sistemático com root cause analysis |
| `/test` | Gerar e rodar testes (Jest, Vitest, Playwright) |
| `/deploy` | Preparar e executar deploy (Vercel, Docker) |
| `/orchestrate` | Tasks complexas multi-domínio (frontend + backend + banco) |
| `/brainstorm` | Discovery e ideação de features |

### Agentes especialistas mais usados

| Agente | Uso neste projeto |
|--------|-------------------|
| `@frontend-specialist` | Componentes React, Next.js, Tailwind, shadcn |
| `@backend-specialist` | Edge functions, API design, integrations |
| `@database-architect` | Schema SQL, migrations, RLS policies, índices |
| `@security-auditor` | Revisar auth, RLS, sanitização, CORS |
| `@test-engineer` | Testes unitários e E2E |
| `@devops-engineer` | Docker, deploy, CI/CD |
| `@orchestrator` | Coordenar múltiplos agentes em tasks grandes |

### Skills mais relevantes

| Skill | Contexto |
|-------|----------|
| `nextjs-react-expert` | Patterns do App Router, RSC, Server Actions |
| `tailwind-patterns` | Estilização consistente |
| `api-patterns` | Design de APIs RESTful, error handling |
| `database-design` | Normalização, índices, constraints |
| `testing-patterns` | Estrutura de testes, mocking, assertions |
| `systematic-debugging` | Processo de debugging estruturado |
| `security-checklist` | Checklist de segurança pré-deploy |
| `deployment-procedures` | Processo de deploy seguro |

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

### Campos adicionais na tabela ai_agents
```sql
ALTER TABLE ai_agents ADD COLUMN follow_up_enabled BOOLEAN DEFAULT true;
ALTER TABLE ai_agents ADD COLUMN follow_up_delay_hours INTEGER DEFAULT 24;
ALTER TABLE ai_agents ADD COLUMN follow_up_max_attempts INTEGER DEFAULT 3;
ALTER TABLE ai_agents ADD COLUMN follow_up_message_template TEXT DEFAULT 'Olá {nome}! Tudo bem? Vi que conversamos sobre {interesse}. Posso te ajudar com algo mais?';
```

### Tabela: follow_ups
```sql
CREATE TABLE follow_ups (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  contact_id UUID NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,
  conversation_id UUID REFERENCES conversations(id),
  ai_agent_id UUID REFERENCES ai_agents(id),
  scheduled_at TIMESTAMPTZ NOT NULL,
  sent_at TIMESTAMPTZ,
  attempt_number INTEGER DEFAULT 1,
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'sent', 'replied', 'cancelled', 'max_reached')),
  message_content TEXT,
  context TEXT,                           -- O que o cliente demonstrou interesse
  created_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE follow_ups ENABLE ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolation" ON follow_ups
  USING (tenant_id = (auth.jwt() ->> 'tenant_id')::UUID);
CREATE POLICY "service_role_full_access" ON follow_ups
  FOR ALL USING (auth.role() = 'service_role');
CREATE POLICY "super_admin_full_access" ON follow_ups
  FOR ALL USING ((auth.jwt() ->> 'is_super_admin')::BOOLEAN = true);

CREATE INDEX idx_follow_ups_pending ON follow_ups (scheduled_at)
  WHERE status = 'pending';
CREATE INDEX idx_follow_ups_contact ON follow_ups (contact_id, status);
```

### Tool de function calling: schedule_follow_up
```typescript
// Adicionar ao array AI_TOOLS em _shared/claude-tools.ts
{
  name: "schedule_follow_up",
  description: "Agenda um follow-up automático para recontatar o cliente depois. Use quando a conversa terminar sem conversão mas o cliente demonstrou interesse, ou quando o cliente pediu pra retornar depois.",
  input_schema: {
    type: "object",
    properties: {
      delay_hours: {
        type: "number",
        description: "Horas até o follow-up. Padrão: 24. Use 1-4h pra urgente, 24h pra normal, 48-72h pra frio."
      },
      context: {
        type: "string",
        description: "Resumo do interesse do cliente. Ex: 'Interessado no plano Pro mas quer consultar o sócio'"
      }
    },
    required: ["context"]
  }
}
```

### Edge function: process-follow-ups

```
FLUXO (pg_cron a cada 30 minutos):
1. Buscar follow_ups WHERE status = 'pending' AND scheduled_at <= now()
2. Para cada follow_up:
   a. Carregar: ai_agent, contact, histórico da conversa original
   b. Chamar Claude API com prompt:
      - System: "Você é {agente}. Gere uma mensagem curta de follow-up para {nome_contato}.
        Contexto da conversa anterior: {context}. Seja natural, não robótico.
        Use no máximo 2 frases. Tentativa {attempt_number} de {max_attempts}."
   c. Enviar msg gerada via send-whatsapp
   d. Atualizar follow_up: status='sent', sent_at=now(), message_content=msg
   e. Salvar na tabela messages (sender_type: 'ai')
   f. Se attempt_number < max_attempts:
      - Criar novo follow_up com attempt_number + 1,
        scheduled_at = now() + delay_hours
   g. Se attempt_number >= max_attempts:
      - Marcar status = 'max_reached'
3. Log de erros por follow_up (não parar o loop se um falhar)
```

### Lógica no webhook-evolution (adicionar)

```
Ao receber mensagem de um contato:
1. Checar se existem follow_ups pendentes pra esse contact_id
2. Se sim:
   - UPDATE follow_ups SET status = 'cancelled'
     WHERE contact_id = {id} AND status = 'pending'
   - O follow_up que gerou a resposta: SET status = 'replied'
3. Continuar fluxo normal (criar/retomar conversa)
```

### pg_cron job
```sql
SELECT cron.schedule(
  'process-follow-ups',
  '*/30 * * * *',
  $$SELECT net.http_post(
    url := current_setting('app.supabase_functions_url') || '/process-follow-ups',
    headers := jsonb_build_object(
      'Authorization', 'Bearer ' || current_setting('app.service_role_key'),
      'Content-Type', 'application/json'
    ),
    body := '{}'::jsonb
  );$$
);
```

### Campos adicionais na tabela ai_agents.sdr_instructions
```json
{
  "follow_up_triggers": [
    "cliente disse que vai pensar",
    "cliente pediu pra ligar depois",
    "conversa encerrou sem agendamento",
    "cliente perguntou preço mas não fechou"
  ]
}

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