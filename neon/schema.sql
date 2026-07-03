-- ================================================================
-- ZapAgent — schema consolidado para Neon (Postgres puro)
-- Gerado a partir de supabase/migrations/001..026, adaptado para
-- rodar fora do Supabase. Rode este arquivo inteiro, uma vez, num
-- banco Neon vazio: psql "$NEON_DATABASE_URL" -f neon/schema.sql
--
-- O QUE MUDOU EM RELAÇÃO ÀS MIGRATIONS ORIGINAIS (leia antes de rodar):
--
-- 1. auth.users não existe no Neon (era do Supabase Auth). As FKs de
--    super_admins.id e users.id para auth.users(id) foram removidas —
--    continuam UUID PRIMARY KEY, mas quem preenche o valor agora é o
--    seu novo sistema de auth (Auth.js/Clerk/custom), não mais o
--    Supabase Auth.
--
-- 2. auth.jwt() / auth.uid() / auth.role() não existem no Neon. Criei
--    um shim (seção "AUTH SHIM" abaixo) que reimplementa essas 3
--    funções lendo a GUC de sessão `request.jwt.claims` — exatamente
--    como o Supabase faz por baixo dos panos. Isso significa que TODAS
--    as RLS policies abaixo foram copiadas sem alteração de lógica.
--    Só funcionam se algo popular essa GUC por request:
--      a) Se você continuar com um layer PostgREST na frente do Neon
--         (self-hosted, de graça) — ele popula isso sozinho a partir
--         do JWT recebido, igual ao Supabase. Nada mais muda.
--      b) Se o Next.js falar direto com o Neon (via pg/Prisma/Drizzle)
--         sem PostgREST — seu código precisa rodar, por transação:
--         SELECT set_config('request.jwt.claims', '{"sub":"...","tenant_id":"...","user_role":"owner","is_super_admin":false}', true);
--         ANTES de qualquer query que dependa de RLS. Use a função
--         get_session_claims(p_user_id) (seção "SESSION CLAIMS"
--         abaixo) pra montar esse JSON depois de autenticar o usuário.
--    Se seu backend for sempre uma conexão de confiança (rota Next.js
--    server-side aplicando tenant_id manualmente em cada query), RLS
--    vira defesa em profundidade, não a barreira principal — tudo bem
--    deixar ativado mesmo assim, é grátis.
--
-- 3. Papéis `service_role` / `authenticated` / `anon` do Supabase não
--    existem no Neon por padrão — este script CRIA esses 3 roles com
--    os mesmos nomes (seção "ROLES") pra manter todo GRANT/policy
--    funcionando sem reescrever nada. `service_role` recebe BYPASSRLS
--    — use essa role pra qualquer backend de confiança (equivalente
--    ao service role key de hoje).
--
-- 4. pg_net não existe no Neon (é proprietário do Supabase). As 3
--    migrations que dependiam dele (015, 016, 022 — disparar
--    process-follow-ups, schedule-reminder e process-message via
--    HTTP direto do Postgres) foram OMITIDAS. Essas chamadas precisam
--    sair do banco e virar responsabilidade da aplicação:
--      - process-message: dispare direto no seu endpoint que recebe o
--        webhook da Evolution, sem passar pelo Postgres.
--      - schedule-reminder / process-follow-ups: viram Vercel Cron
--        Jobs (ou GitHub Actions agendado) chamando o endpoint HTTP
--        equivalente a cada 15min/60min, em vez de cron.schedule +
--        net.http_post.
--
-- 5. pg_cron: o único job 100% portável (reset_monthly_message_counts,
--    que não faz HTTP, só chama uma função SQL) foi mantido. Confirme
--    que pg_cron está habilitado no seu projeto Neon antes de rodar
--    essa parte (procure "Postgres extensions" nas configs do projeto).
--
-- 6. app.encryption_key: os helpers de criptografia (pgcrypto) exigem
--    isso configurado na sessão. No Neon, defina via:
--      ALTER DATABASE seu_banco SET app.encryption_key = 'sua-chave-aqui';
--    (rode isso separadamente, com a chave real, depois deste script)
-- ================================================================


-- ================================================================
-- EXTENSIONS
-- ================================================================
CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE EXTENSION IF NOT EXISTS btree_gist;
-- pg_cron: descomente se seu projeto Neon tiver a extensão habilitada.
-- CREATE EXTENSION IF NOT EXISTS pg_cron;


-- ================================================================
-- ROLES (equivalentes aos do Supabase — mantém GRANTs/policies compatíveis)
-- ================================================================
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN
    CREATE ROLE service_role NOLOGIN BYPASSRLS;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    CREATE ROLE authenticated NOLOGIN;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    CREATE ROLE anon NOLOGIN;
  END IF;
END $$;

-- Sua connection string de backend (Next.js server / route handlers)
-- deve autenticar como um role que tenha sido concedido `service_role`
-- (ex.: GRANT service_role TO neon_app_user;) para ter BYPASSRLS.


-- ================================================================
-- AUTH SHIM — reimplementação de auth.jwt()/auth.uid()/auth.role()
-- Idêntico ao que o Supabase expõe, lendo a GUC request.jwt.claims.
-- ================================================================
CREATE SCHEMA IF NOT EXISTS auth;

CREATE OR REPLACE FUNCTION auth.jwt() RETURNS JSONB
LANGUAGE sql STABLE AS $$
  SELECT COALESCE(NULLIF(current_setting('request.jwt.claims', true), ''), '{}')::jsonb;
$$;

CREATE OR REPLACE FUNCTION auth.uid() RETURNS UUID
LANGUAGE sql STABLE AS $$
  SELECT NULLIF(auth.jwt() ->> 'sub', '')::uuid;
$$;

CREATE OR REPLACE FUNCTION auth.role() RETURNS TEXT
LANGUAGE sql STABLE AS $$
  SELECT NULLIF(auth.jwt() ->> 'role', '')::text;
$$;


-- ================================================================
-- FUNÇÃO COMPARTILHADA: updated_at automático
-- ================================================================
CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;


-- ================================================================
-- TABELA: auth_users — store global de identidade (substitui auth.users
-- do Supabase). É onde ficam email + hash de senha. O UUID `id` é a
-- identidade compartilhada: super_admins.id e users.id apontam pra cá.
-- get_session_claims(id) resolve se o id é super admin ou usuário de tenant.
-- ================================================================
CREATE TABLE IF NOT EXISTS auth_users (
  id             UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  email          TEXT        NOT NULL UNIQUE,
  password_hash  TEXT,        -- bcrypt; NULL enquanto o convite/reset não define
  email_verified TIMESTAMPTZ,
  full_name      TEXT,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE auth_users IS 'Identidade global (email + hash de senha). Substitui auth.users do Supabase.';
CREATE UNIQUE INDEX IF NOT EXISTS idx_auth_users_email ON auth_users (lower(email));

CREATE TRIGGER trg_auth_users_updated_at
  BEFORE UPDATE ON auth_users
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

ALTER TABLE auth_users ENABLE ROW LEVEL SECURITY;
-- Só o backend (service_role) toca auth_users; login/reset rodam com bypass.
CREATE POLICY "service_role_full_access" ON auth_users
  FOR ALL USING (auth.role() = 'service_role');


-- ================================================================
-- TABELA: super_admins
-- ================================================================
CREATE TABLE IF NOT EXISTS super_admins (
  id         UUID        PRIMARY KEY REFERENCES auth_users(id) ON DELETE CASCADE,
  full_name  TEXT        NOT NULL,
  email      TEXT        NOT NULL UNIQUE,
  avatar_url TEXT,
  active     BOOLEAN     NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE super_admins IS 'Donos da plataforma ZapAgent. Acesso total ao painel /admin.';

ALTER TABLE super_admins ENABLE ROW LEVEL SECURITY;

CREATE POLICY "super_admin_self_select" ON super_admins
  FOR SELECT USING (id = auth.uid());

CREATE POLICY "service_role_full_access" ON super_admins
  FOR ALL USING (auth.role() = 'service_role');

CREATE UNIQUE INDEX IF NOT EXISTS idx_super_admins_email ON super_admins (email);


-- ================================================================
-- TABELA: tenants
-- (já inclui os campos adicionados depois: evolution_*, llm keys,
--  audio/elevenlabs, webhook_secret)
-- ================================================================
CREATE TABLE IF NOT EXISTS tenants (
  id          UUID    PRIMARY KEY DEFAULT gen_random_uuid(),
  name        TEXT    NOT NULL,
  slug        TEXT    NOT NULL UNIQUE,

  business_segment     TEXT CHECK (business_segment IN ('clinica','loja','servicos','restaurante','outro')),
  business_description TEXT,
  owner_name           TEXT,
  owner_email          TEXT,
  owner_phone          TEXT,
  address              TEXT,
  city                 TEXT,
  state                TEXT,
  website              TEXT,

  plan   TEXT NOT NULL DEFAULT 'free' CHECK (plan IN ('free','starter','pro','enterprise')),
  status TEXT NOT NULL DEFAULT 'onboarding' CHECK (status IN ('onboarding','active','suspended','cancelled')),
  onboarding_completed_at TIMESTAMPTZ,

  -- WhatsApp / Evolution (URL e key são por tenant desde a migration 017)
  evolution_instance_name  TEXT,
  evolution_api_url        TEXT,
  evolution_api_key        TEXT, -- criptografada: encode(pgp_sym_encrypt(...), 'base64')
  webhook_secret            TEXT NOT NULL DEFAULT encode(gen_random_bytes(24), 'hex'),
  whatsapp_number          TEXT,
  whatsapp_connection_type TEXT DEFAULT 'baileys' CHECK (whatsapp_connection_type IN ('baileys','cloud_api')),
  whatsapp_connected       BOOLEAN NOT NULL DEFAULT false,

  business_hours JSONB NOT NULL DEFAULT '{
    "mon": {"start": "08:00", "end": "18:00"},
    "tue": {"start": "08:00", "end": "18:00"},
    "wed": {"start": "08:00", "end": "18:00"},
    "thu": {"start": "08:00", "end": "18:00"},
    "fri": {"start": "08:00", "end": "18:00"}
  }',
  appointment_duration_minutes      INTEGER NOT NULL DEFAULT 30,
  appointment_slot_interval_minutes INTEGER NOT NULL DEFAULT 30,
  timezone                          TEXT    NOT NULL DEFAULT 'America/Sao_Paulo',
  cloudinary_cloud_name             TEXT,
  cloudinary_upload_preset         TEXT,
  logo_url                         TEXT,

  max_messages_month  INTEGER NOT NULL DEFAULT 1000,
  max_products        INTEGER NOT NULL DEFAULT 50,
  max_operators       INTEGER NOT NULL DEFAULT 3,
  messages_used_month INTEGER NOT NULL DEFAULT 0,

  -- BYOK multi-LLM (criptografadas, migrations 018/023/024)
  openai_api_key     TEXT,
  gemini_api_key     TEXT,
  anthropic_api_key  TEXT,
  elevenlabs_api_key TEXT,

  created_by UUID REFERENCES super_admins(id),
  active     BOOLEAN     NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE tenants IS 'Clientes da plataforma (negócios). Isolados via RLS por tenant_id.';
COMMENT ON COLUMN tenants.slug IS 'Identificador único URL-safe usado como instanceName na Evolution.';
COMMENT ON COLUMN tenants.evolution_api_key IS 'Criptografada com pgp_sym_encrypt. Ler via get_decrypted_evolution_key().';
COMMENT ON COLUMN tenants.webhook_secret IS 'Segredo embutido na URL do webhook (?ts=) — Evolution não autentica suas próprias chamadas.';

CREATE UNIQUE INDEX IF NOT EXISTS idx_tenants_slug       ON tenants (slug);
CREATE        INDEX IF NOT EXISTS idx_tenants_status     ON tenants (status);
CREATE        INDEX IF NOT EXISTS idx_tenants_created_by ON tenants (created_by);
CREATE        INDEX IF NOT EXISTS idx_tenants_evolution_instance ON tenants (evolution_instance_name) WHERE evolution_instance_name IS NOT NULL;
CREATE        INDEX IF NOT EXISTS idx_tenants_webhook_secret ON tenants (webhook_secret);

CREATE TRIGGER trg_tenants_updated_at
  BEFORE UPDATE ON tenants
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

ALTER TABLE tenants ENABLE ROW LEVEL SECURITY;

CREATE POLICY "tenant_isolation_select" ON tenants
  FOR SELECT USING (id = (auth.jwt() ->> 'tenant_id')::UUID);

CREATE POLICY "tenant_isolation_update" ON tenants
  FOR UPDATE USING (id = (auth.jwt() ->> 'tenant_id')::UUID);

CREATE POLICY "super_admin_full_access" ON tenants
  FOR ALL USING ((auth.jwt() ->> 'is_super_admin')::BOOLEAN IS TRUE);

CREATE POLICY "service_role_full_access" ON tenants
  FOR ALL USING (auth.role() = 'service_role');


-- ================================================================
-- TABELA: users (operadores do painel tenant)
-- ================================================================
CREATE TABLE IF NOT EXISTS users (
  id         UUID    PRIMARY KEY REFERENCES auth_users(id) ON DELETE CASCADE,
  tenant_id  UUID    NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  full_name  TEXT    NOT NULL,
  email      TEXT    NOT NULL,
  role       TEXT    NOT NULL DEFAULT 'operator' CHECK (role IN ('owner','admin','operator')),
  avatar_url   TEXT,
  is_available BOOLEAN     NOT NULL DEFAULT true,
  active       BOOLEAN     NOT NULL DEFAULT true,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE users IS 'Operadores do painel tenant (owner/admin/operator).';

CREATE INDEX IF NOT EXISTS idx_users_tenant_id ON users (tenant_id);
CREATE INDEX IF NOT EXISTS idx_users_email     ON users (email);
CREATE UNIQUE INDEX IF NOT EXISTS idx_users_tenant_email ON users (tenant_id, email);

ALTER TABLE users ENABLE ROW LEVEL SECURITY;

CREATE POLICY "tenant_isolation" ON users
  FOR SELECT USING (tenant_id = (auth.jwt() ->> 'tenant_id')::UUID);

-- user_role (não 'role') — evita colisão com o claim 'role' que troca o Postgres role via PostgREST
CREATE POLICY "owner_admin_manage" ON users
  FOR ALL USING (
    tenant_id = (auth.jwt() ->> 'tenant_id')::UUID
    AND (auth.jwt() ->> 'user_role')::TEXT IN ('owner','admin')
  );

CREATE POLICY "operator_self_update" ON users
  FOR UPDATE USING (id = auth.uid());

CREATE POLICY "super_admin_full_access" ON users
  FOR ALL USING ((auth.jwt() ->> 'is_super_admin')::BOOLEAN IS TRUE);

CREATE POLICY "service_role_full_access" ON users
  FOR ALL USING (auth.role() = 'service_role');


-- ================================================================
-- TABELA: contacts
-- ================================================================
CREATE TABLE IF NOT EXISTS contacts (
  id               UUID    PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id        UUID    NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  whatsapp_number  TEXT    NOT NULL,
  whatsapp_name    TEXT,
  custom_name      TEXT,
  email            TEXT,
  phone            TEXT,
  notes            TEXT,
  tags             TEXT[]      NOT NULL DEFAULT '{}',
  metadata         JSONB       NOT NULL DEFAULT '{}',
  first_contact_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_contact_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, whatsapp_number)
);

COMMENT ON TABLE contacts IS 'Leads e clientes vindos do WhatsApp.';

CREATE INDEX IF NOT EXISTS idx_contacts_tenant_id       ON contacts (tenant_id);
CREATE INDEX IF NOT EXISTS idx_contacts_whatsapp_number ON contacts (tenant_id, whatsapp_number);
CREATE INDEX IF NOT EXISTS idx_contacts_last_contact_at ON contacts (tenant_id, last_contact_at DESC);
CREATE INDEX IF NOT EXISTS idx_contacts_tags            ON contacts USING GIN (tags);

ALTER TABLE contacts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "tenant_isolation" ON contacts
  FOR ALL USING (tenant_id = (auth.jwt() ->> 'tenant_id')::UUID);

CREATE POLICY "super_admin_full_access" ON contacts
  FOR ALL USING ((auth.jwt() ->> 'is_super_admin')::BOOLEAN IS TRUE);

CREATE POLICY "service_role_full_access" ON contacts
  FOR ALL USING (auth.role() = 'service_role');


-- ================================================================
-- TABELA: kanban_stages
-- ================================================================
CREATE TABLE IF NOT EXISTS kanban_stages (
  id        UUID    PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID    NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  name      TEXT    NOT NULL,
  slug      TEXT    NOT NULL,
  color     TEXT    NOT NULL DEFAULT '#6366f1',
  position  INTEGER NOT NULL DEFAULT 0,
  is_default  BOOLEAN NOT NULL DEFAULT false,
  is_closed   BOOLEAN NOT NULL DEFAULT false,
  auto_assign BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, slug)
);

COMMENT ON TABLE kanban_stages IS 'Colunas do kanban de atendimento por tenant.';

CREATE INDEX IF NOT EXISTS idx_kanban_stages_tenant_id ON kanban_stages (tenant_id);
CREATE INDEX IF NOT EXISTS idx_kanban_stages_position  ON kanban_stages (tenant_id, position);

ALTER TABLE kanban_stages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "tenant_isolation" ON kanban_stages
  FOR ALL USING (tenant_id = (auth.jwt() ->> 'tenant_id')::UUID);

CREATE POLICY "super_admin_full_access" ON kanban_stages
  FOR ALL USING ((auth.jwt() ->> 'is_super_admin')::BOOLEAN IS TRUE);

CREATE POLICY "service_role_full_access" ON kanban_stages
  FOR ALL USING (auth.role() = 'service_role');


-- ================================================================
-- TABELA: ai_agents
-- (já inclui campos de follow-up [014] e áudio/ElevenLabs [019])
-- ================================================================
CREATE TABLE IF NOT EXISTS ai_agents (
  id        UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,

  name TEXT NOT NULL,
  slug TEXT NOT NULL,
  type TEXT NOT NULL DEFAULT 'sdr' CHECK (type IN ('sdr','support','scheduler','custom')),
  is_active  BOOLEAN NOT NULL DEFAULT true,
  is_default BOOLEAN NOT NULL DEFAULT false,

  model       TEXT NOT NULL DEFAULT 'claude-sonnet-4-20250514',
  temperature NUMERIC(3,2) NOT NULL DEFAULT 0.7 CHECK (temperature >= 0 AND temperature <= 1),
  max_tokens  INTEGER NOT NULL DEFAULT 1024,

  system_prompt TEXT NOT NULL,
  personality   TEXT,
  language      TEXT NOT NULL DEFAULT 'pt-BR',

  greeting_message     TEXT,
  farewell_message     TEXT,
  out_of_hours_message TEXT,

  escalation_rules JSONB NOT NULL DEFAULT '{
    "max_turns_without_resolution": 10,
    "low_confidence_threshold": 0.3,
    "escalation_keywords": ["falar com humano","atendente","gerente"]
  }',

  can_search_products   BOOLEAN NOT NULL DEFAULT true,
  can_book_appointments BOOLEAN NOT NULL DEFAULT true,
  can_send_images       BOOLEAN NOT NULL DEFAULT true,
  can_escalate          BOOLEAN NOT NULL DEFAULT true,
  can_collect_lead_info BOOLEAN NOT NULL DEFAULT true,

  sdr_instructions JSONB NOT NULL DEFAULT '{
    "qualification_questions": ["Qual seu nome?", "Qual produto/serviço te interessa?", "Qual seu orçamento?"],
    "follow_up_after_hours": 24,
    "auto_tag_leads": true,
    "lead_scoring_enabled": true
  }',

  -- Follow-up automático (migration 014)
  follow_up_enabled          BOOLEAN NOT NULL DEFAULT true,
  follow_up_delay_hours      INTEGER NOT NULL DEFAULT 24,
  follow_up_max_attempts     INTEGER NOT NULL DEFAULT 3,
  follow_up_message_template TEXT,

  -- Áudio (migration 019)
  voice_id                TEXT DEFAULT NULL,
  audio_response_enabled  BOOLEAN DEFAULT false,

  total_conversations       INTEGER NOT NULL DEFAULT 0,
  total_escalations         INTEGER NOT NULL DEFAULT 0,
  avg_response_time_seconds INTEGER,
  satisfaction_score        NUMERIC(3,2),

  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, slug)
);

COMMENT ON TABLE ai_agents IS 'Agentes de IA configuráveis por tenant.';

CREATE UNIQUE INDEX IF NOT EXISTS idx_ai_agents_one_default ON ai_agents (tenant_id) WHERE is_default = true;
CREATE INDEX IF NOT EXISTS idx_ai_agents_tenant_id ON ai_agents (tenant_id);

CREATE TRIGGER trg_ai_agents_updated_at
  BEFORE UPDATE ON ai_agents
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

ALTER TABLE ai_agents ENABLE ROW LEVEL SECURITY;

CREATE POLICY "tenant_isolation" ON ai_agents
  FOR ALL USING (tenant_id = (auth.jwt() ->> 'tenant_id')::UUID);

CREATE POLICY "owner_admin_manage" ON ai_agents
  FOR ALL USING (
    tenant_id = (auth.jwt() ->> 'tenant_id')::UUID
    AND (auth.jwt() ->> 'user_role')::TEXT IN ('owner','admin')
  );

CREATE POLICY "super_admin_full_access" ON ai_agents
  FOR ALL USING ((auth.jwt() ->> 'is_super_admin')::BOOLEAN IS TRUE);

CREATE POLICY "service_role_full_access" ON ai_agents
  FOR ALL USING (auth.role() = 'service_role');


-- ================================================================
-- TABELA: onboarding_logs
-- ================================================================
CREATE TABLE IF NOT EXISTS onboarding_logs (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id  UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  created_by UUID NOT NULL REFERENCES super_admins(id),
  step TEXT NOT NULL CHECK (step IN ('business_info','whatsapp_setup','ai_config','products','business_hours','activated')),
  step_data    JSONB       NOT NULL DEFAULT '{}',
  completed_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE onboarding_logs IS 'Auditoria de cada step do onboarding de um tenant.';

CREATE INDEX IF NOT EXISTS idx_onboarding_logs_tenant_id ON onboarding_logs (tenant_id);
CREATE INDEX IF NOT EXISTS idx_onboarding_logs_step      ON onboarding_logs (tenant_id, step);

ALTER TABLE onboarding_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "super_admin_full_access" ON onboarding_logs
  FOR ALL USING ((auth.jwt() ->> 'is_super_admin')::BOOLEAN IS TRUE);

CREATE POLICY "service_role_full_access" ON onboarding_logs
  FOR ALL USING (auth.role() = 'service_role');


-- ================================================================
-- TABELA: conversations
-- ================================================================
CREATE TABLE IF NOT EXISTS conversations (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       UUID NOT NULL REFERENCES tenants(id)  ON DELETE CASCADE,
  contact_id      UUID NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,
  ai_agent_id     UUID REFERENCES ai_agents(id),
  kanban_stage_id UUID REFERENCES kanban_stages(id),
  assigned_to     UUID REFERENCES users(id),

  status TEXT NOT NULL DEFAULT 'ai_handling' CHECK (status IN ('ai_handling','waiting_human','human_handling','closed')),

  ai_context JSONB NOT NULL DEFAULT '{}',
  ai_summary TEXT,

  priority TEXT NOT NULL DEFAULT 'normal' CHECK (priority IN ('low','normal','high','urgent')),
  channel  TEXT NOT NULL DEFAULT 'whatsapp',

  started_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  closed_at       TIMESTAMPTZ,
  last_message_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  metadata        JSONB       NOT NULL DEFAULT '{}',
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE conversations IS 'Thread de atendimento: um por (contact, tenant) ativo simultaneamente.';

CREATE INDEX IF NOT EXISTS idx_conversations_tenant_id       ON conversations (tenant_id);
CREATE INDEX IF NOT EXISTS idx_conversations_contact_id      ON conversations (contact_id);
CREATE INDEX IF NOT EXISTS idx_conversations_status          ON conversations (tenant_id, status);
CREATE INDEX IF NOT EXISTS idx_conversations_stage           ON conversations (kanban_stage_id);
CREATE INDEX IF NOT EXISTS idx_conversations_assigned_to     ON conversations (assigned_to);
CREATE INDEX IF NOT EXISTS idx_conversations_last_message_at ON conversations (tenant_id, last_message_at DESC);

ALTER TABLE conversations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "tenant_isolation" ON conversations
  FOR ALL USING (tenant_id = (auth.jwt() ->> 'tenant_id')::UUID);

CREATE POLICY "super_admin_full_access" ON conversations
  FOR ALL USING ((auth.jwt() ->> 'is_super_admin')::BOOLEAN IS TRUE);

CREATE POLICY "service_role_full_access" ON conversations
  FOR ALL USING (auth.role() = 'service_role');


-- ================================================================
-- TABELA: messages
-- ================================================================
CREATE TABLE IF NOT EXISTS messages (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       UUID NOT NULL REFERENCES tenants(id)       ON DELETE CASCADE,
  conversation_id UUID NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  contact_id      UUID NOT NULL REFERENCES contacts(id),

  sender_type TEXT NOT NULL CHECK (sender_type IN ('customer','ai','human','system')),
  sender_id   UUID,

  content      TEXT,
  content_type TEXT NOT NULL DEFAULT 'text' CHECK (content_type IN ('text','image','audio','video','document','location','product_card')),

  media_url           TEXT,
  media_mime_type     TEXT,
  whatsapp_message_id TEXT,

  ai_tool_calls JSONB,
  ai_confidence NUMERIC(3,2) CHECK (ai_confidence IS NULL OR (ai_confidence >= 0 AND ai_confidence <= 1)),

  is_read    BOOLEAN     NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE messages IS 'Todas as mensagens trocadas em cada conversa.';

CREATE INDEX IF NOT EXISTS idx_messages_conversation_id     ON messages (conversation_id, created_at);
CREATE INDEX IF NOT EXISTS idx_messages_tenant_id           ON messages (tenant_id);
CREATE INDEX IF NOT EXISTS idx_messages_contact_id          ON messages (contact_id);
CREATE INDEX IF NOT EXISTS idx_messages_whatsapp_message_id ON messages (whatsapp_message_id) WHERE whatsapp_message_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_messages_is_read             ON messages (conversation_id, is_read) WHERE is_read = false;

ALTER TABLE messages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "tenant_isolation" ON messages
  FOR ALL USING (tenant_id = (auth.jwt() ->> 'tenant_id')::UUID);

CREATE POLICY "super_admin_full_access" ON messages
  FOR ALL USING ((auth.jwt() ->> 'is_super_admin')::BOOLEAN IS TRUE);

CREATE POLICY "service_role_full_access" ON messages
  FOR ALL USING (auth.role() = 'service_role');


-- ================================================================
-- TABELA: products
-- ================================================================
CREATE TABLE IF NOT EXISTS products (
  id        UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,

  name              TEXT NOT NULL,
  description       TEXT,
  short_description TEXT,
  price             NUMERIC(12,2),
  price_display     TEXT,
  currency          TEXT NOT NULL DEFAULT 'BRL',
  category          TEXT,
  subcategory       TEXT,
  tags              TEXT[] NOT NULL DEFAULT '{}',

  images JSONB NOT NULL DEFAULT '[]',

  is_available BOOLEAN NOT NULL DEFAULT true,
  is_featured  BOOLEAN NOT NULL DEFAULT false,

  metadata JSONB NOT NULL DEFAULT '{}',
  search_vector TSVECTOR,

  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE products IS 'Catálogo de produtos/serviços por tenant. Usado pela IA via function calling.';

CREATE INDEX IF NOT EXISTS idx_products_tenant_id    ON products (tenant_id);
CREATE INDEX IF NOT EXISTS idx_products_category     ON products (tenant_id, category);
CREATE INDEX IF NOT EXISTS idx_products_is_available ON products (tenant_id, is_available);
CREATE INDEX IF NOT EXISTS idx_products_is_featured  ON products (tenant_id, is_featured);
CREATE INDEX IF NOT EXISTS idx_products_tags         ON products USING GIN (tags);
CREATE INDEX IF NOT EXISTS idx_products_search       ON products USING GIN (search_vector);

CREATE OR REPLACE FUNCTION update_product_search_vector()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.search_vector := to_tsvector(
    'portuguese',
    coalesce(NEW.name, '')              || ' ' ||
    coalesce(NEW.description, '')       || ' ' ||
    coalesce(NEW.short_description, '') || ' ' ||
    coalesce(NEW.category, '')          || ' ' ||
    coalesce(NEW.subcategory, '')       || ' ' ||
    coalesce(array_to_string(NEW.tags, ' '), '')
  );
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_products_search_vector
  BEFORE INSERT OR UPDATE ON products
  FOR EACH ROW EXECUTE FUNCTION update_product_search_vector();

CREATE TRIGGER trg_products_updated_at
  BEFORE UPDATE ON products
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

ALTER TABLE products ENABLE ROW LEVEL SECURITY;

CREATE POLICY "tenant_isolation_select" ON products
  FOR SELECT USING (tenant_id = (auth.jwt() ->> 'tenant_id')::UUID);

CREATE POLICY "owner_admin_insert" ON products
  FOR INSERT WITH CHECK (
    tenant_id = (auth.jwt() ->> 'tenant_id')::UUID
    AND (auth.jwt() ->> 'user_role')::TEXT IN ('owner','admin')
  );

CREATE POLICY "owner_admin_update" ON products
  FOR UPDATE USING (
    tenant_id = (auth.jwt() ->> 'tenant_id')::UUID
    AND (auth.jwt() ->> 'user_role')::TEXT IN ('owner','admin')
  );

CREATE POLICY "owner_admin_delete" ON products
  FOR DELETE USING (
    tenant_id = (auth.jwt() ->> 'tenant_id')::UUID
    AND (auth.jwt() ->> 'user_role')::TEXT IN ('owner','admin')
  );

CREATE POLICY "super_admin_select" ON products
  FOR SELECT USING ((auth.jwt() ->> 'is_super_admin')::BOOLEAN IS TRUE);

CREATE POLICY "super_admin_insert" ON products
  FOR INSERT WITH CHECK ((auth.jwt() ->> 'is_super_admin')::BOOLEAN IS TRUE);

CREATE POLICY "super_admin_update" ON products
  FOR UPDATE USING ((auth.jwt() ->> 'is_super_admin')::BOOLEAN IS TRUE);

CREATE POLICY "super_admin_delete" ON products
  FOR DELETE USING ((auth.jwt() ->> 'is_super_admin')::BOOLEAN IS TRUE);

CREATE POLICY "service_role_full_access" ON products
  FOR ALL USING (auth.role() = 'service_role');


-- ================================================================
-- TABELA: appointments
-- ================================================================
CREATE TABLE IF NOT EXISTS appointments (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  contact_id      UUID NOT NULL REFERENCES contacts(id),
  conversation_id UUID REFERENCES conversations(id),
  assigned_to     UUID REFERENCES users(id),

  title TEXT,
  notes TEXT,

  date       DATE NOT NULL,
  start_time TIME NOT NULL,
  end_time   TIME NOT NULL,

  status TEXT NOT NULL DEFAULT 'confirmed' CHECK (status IN ('pending','confirmed','cancelled','completed','no_show')),

  reminder_24h_sent      BOOLEAN NOT NULL DEFAULT false,
  reminder_1h_sent       BOOLEAN NOT NULL DEFAULT false,
  whatsapp_reminder_sent BOOLEAN NOT NULL DEFAULT false,

  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  EXCLUDE USING gist (
    tenant_id WITH =,
    tstzrange(
      (date + start_time) AT TIME ZONE 'America/Sao_Paulo',
      (date + end_time)   AT TIME ZONE 'America/Sao_Paulo'
    ) WITH &&
  ) WHERE (status NOT IN ('cancelled'))
);

COMMENT ON TABLE appointments IS 'Agendamentos criados pela IA ou manualmente pelos operadores.';

CREATE INDEX IF NOT EXISTS idx_appointments_tenant_id   ON appointments (tenant_id);
CREATE INDEX IF NOT EXISTS idx_appointments_contact_id  ON appointments (contact_id);
CREATE INDEX IF NOT EXISTS idx_appointments_date        ON appointments (tenant_id, date);
CREATE INDEX IF NOT EXISTS idx_appointments_status      ON appointments (tenant_id, status);
CREATE INDEX IF NOT EXISTS idx_appointments_assigned_to ON appointments (assigned_to);
CREATE INDEX IF NOT EXISTS idx_appointments_reminders   ON appointments (tenant_id, date, reminder_24h_sent, reminder_1h_sent)
  WHERE status NOT IN ('cancelled','completed');

CREATE TRIGGER trg_appointments_updated_at
  BEFORE UPDATE ON appointments
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

ALTER TABLE appointments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "tenant_isolation" ON appointments
  FOR ALL USING (tenant_id = (auth.jwt() ->> 'tenant_id')::UUID);

CREATE POLICY "super_admin_full_access" ON appointments
  FOR ALL USING ((auth.jwt() ->> 'is_super_admin')::BOOLEAN IS TRUE);

CREATE POLICY "service_role_full_access" ON appointments
  FOR ALL USING (auth.role() = 'service_role');


-- ================================================================
-- TABELA: follow_ups
-- ================================================================
CREATE TABLE IF NOT EXISTS follow_ups (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  contact_id UUID NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,
  conversation_id UUID NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  ai_agent_id UUID NOT NULL REFERENCES ai_agents(id) ON DELETE CASCADE,
  scheduled_at TIMESTAMPTZ NOT NULL,
  sent_at TIMESTAMPTZ,
  attempt_number INTEGER NOT NULL DEFAULT 1,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','sent','replied','cancelled','max_reached')),
  message_content TEXT,
  context TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

COMMENT ON TABLE follow_ups IS 'Registro de follow-ups automáticos enviados pela IA quando a conversa fica inativa.';

CREATE INDEX IF NOT EXISTS idx_follow_ups_pending ON follow_ups (tenant_id, scheduled_at) WHERE status = 'pending';
CREATE INDEX IF NOT EXISTS idx_follow_ups_contact_pending ON follow_ups (contact_id) WHERE status = 'pending';

ALTER TABLE follow_ups ENABLE ROW LEVEL SECURITY;

CREATE POLICY "tenant_isolation" ON follow_ups
  USING (tenant_id = (auth.jwt() ->> 'tenant_id')::UUID);

CREATE POLICY "service_role_full_access" ON follow_ups
  FOR ALL USING (auth.role() = 'service_role');

CREATE POLICY "super_admin_full_access" ON follow_ups
  FOR ALL USING ((auth.jwt() ->> 'is_super_admin')::BOOLEAN = true);

CREATE TRIGGER trg_follow_ups_updated_at
  BEFORE UPDATE ON follow_ups
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();


-- ================================================================
-- FUNÇÕES DE DOMÍNIO E TRIGGERS (migration 012 — 100% portáveis)
-- ================================================================

-- 1. Kanban stages padrão ao criar tenant
CREATE OR REPLACE FUNCTION create_default_kanban_stages()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  INSERT INTO kanban_stages (tenant_id, name, slug, color, position, is_default, is_closed, auto_assign)
  VALUES
    (NEW.id, 'Novo Lead',          'novo_lead',         '#6366f1', 0, true,  false, false),
    (NEW.id, 'IA Atendendo',       'ia_atendendo',      '#3b82f6', 1, false, false, true),
    (NEW.id, 'Aguardando Humano',  'aguardando_humano', '#f59e0b', 2, false, false, false),
    (NEW.id, 'Em Atendimento',     'em_atendimento',    '#10b981', 3, false, false, false),
    (NEW.id, 'Agendado',           'agendado',          '#8b5cf6', 4, false, false, false),
    (NEW.id, 'Finalizado',         'finalizado',        '#6b7280', 5, false, true,  false);
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_create_default_kanban_stages
  AFTER INSERT ON tenants
  FOR EACH ROW EXECUTE FUNCTION create_default_kanban_stages();

-- 2. Stage padrão em nova conversa sem stage
CREATE OR REPLACE FUNCTION assign_default_kanban_stage()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_stage_id UUID;
BEGIN
  IF NEW.kanban_stage_id IS NULL THEN
    SELECT id INTO v_stage_id FROM kanban_stages WHERE tenant_id = NEW.tenant_id AND is_default = true LIMIT 1;
    IF v_stage_id IS NOT NULL THEN
      NEW.kanban_stage_id := v_stage_id;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_assign_default_kanban_stage
  BEFORE INSERT ON conversations
  FOR EACH ROW EXECUTE FUNCTION assign_default_kanban_stage();

-- 3. Sincroniza status da conversa com o kanban
CREATE OR REPLACE FUNCTION sync_conversation_status_to_kanban()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_stage_id UUID;
  v_slug     TEXT;
BEGIN
  IF NEW.status = 'waiting_human' THEN v_slug := 'aguardando_humano';
  ELSIF NEW.status = 'human_handling' THEN v_slug := 'em_atendimento';
  ELSIF NEW.status = 'closed' THEN v_slug := 'finalizado';
  ELSIF NEW.status = 'ai_handling' THEN v_slug := 'ia_atendendo';
  ELSE RETURN NEW;
  END IF;

  IF OLD.status IS DISTINCT FROM NEW.status THEN
    SELECT id INTO v_stage_id FROM kanban_stages WHERE tenant_id = NEW.tenant_id AND slug = v_slug LIMIT 1;
    IF v_stage_id IS NOT NULL THEN
      NEW.kanban_stage_id := v_stage_id;
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_sync_conversation_kanban
  BEFORE UPDATE OF status ON conversations
  FOR EACH ROW EXECUTE FUNCTION sync_conversation_status_to_kanban();

-- 4. last_message_at na conversa ao inserir mensagem
CREATE OR REPLACE FUNCTION update_conversation_last_message_at()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  UPDATE conversations SET last_message_at = NEW.created_at WHERE id = NEW.conversation_id;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_update_conversation_last_message_at
  AFTER INSERT ON messages
  FOR EACH ROW EXECUTE FUNCTION update_conversation_last_message_at();

-- 5. last_contact_at no contact ao receber mensagem
CREATE OR REPLACE FUNCTION update_contact_last_contact_at()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  UPDATE contacts SET last_contact_at = NEW.created_at WHERE id = NEW.contact_id;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_update_contact_last_contact_at
  AFTER INSERT ON messages
  FOR EACH ROW EXECUTE FUNCTION update_contact_last_contact_at();

-- 6. Incrementa messages_used_month ao inserir mensagem da IA
CREATE OR REPLACE FUNCTION increment_tenant_message_count()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  IF NEW.sender_type = 'ai' THEN
    UPDATE tenants SET messages_used_month = messages_used_month + 1 WHERE id = NEW.tenant_id;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_increment_tenant_message_count
  AFTER INSERT ON messages
  FOR EACH ROW EXECUTE FUNCTION increment_tenant_message_count();

-- 7. Métricas do ai_agent ao mudar status da conversa
CREATE OR REPLACE FUNCTION update_ai_agent_metrics()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  IF OLD.status IS DISTINCT FROM NEW.status THEN
    IF NEW.ai_agent_id IS NOT NULL THEN
      IF NEW.status = 'closed' THEN
        UPDATE ai_agents SET total_conversations = total_conversations + 1 WHERE id = NEW.ai_agent_id;
      ELSIF NEW.status = 'waiting_human' THEN
        UPDATE ai_agents SET total_escalations = total_escalations + 1 WHERE id = NEW.ai_agent_id;
      END IF;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_update_ai_agent_metrics
  AFTER UPDATE OF status ON conversations
  FOR EACH ROW EXECUTE FUNCTION update_ai_agent_metrics();

-- 8. Busca de produtos por full-text search (tool: search_products)
CREATE OR REPLACE FUNCTION search_products(
  p_tenant_id  UUID,
  p_query      TEXT,
  p_category   TEXT    DEFAULT NULL,
  p_price_max  NUMERIC DEFAULT NULL,
  p_limit      INTEGER DEFAULT 5
)
RETURNS TABLE (
  id UUID, name TEXT, short_description TEXT, price NUMERIC,
  price_display TEXT, category TEXT, images JSONB, rank REAL
) LANGUAGE sql STABLE SECURITY DEFINER AS $$
  SELECT p.id, p.name, p.short_description, p.price, p.price_display, p.category, p.images,
    ts_rank(p.search_vector, plainto_tsquery('portuguese', p_query)) AS rank
  FROM products p
  WHERE p.tenant_id = p_tenant_id
    AND p.is_available = true
    AND p.search_vector @@ plainto_tsquery('portuguese', p_query)
    AND (p_category IS NULL OR p.category = p_category)
    AND (p_price_max IS NULL OR p.price <= p_price_max)
  ORDER BY rank DESC, p.is_featured DESC
  LIMIT p_limit;
$$;

-- 9. Slots disponíveis para agendamento (tool: check_availability)
CREATE OR REPLACE FUNCTION check_appointment_availability(p_tenant_id UUID, p_date DATE)
RETURNS TABLE (slot_start TIME, slot_end TIME, is_available BOOLEAN)
LANGUAGE plpgsql STABLE SECURITY DEFINER AS $$
DECLARE
  v_duration INTEGER;
  v_interval INTEGER;
  v_day_start TIME := '08:00';
  v_day_end   TIME := '18:00';
  v_slot_start TIME;
  v_slot_end   TIME;
BEGIN
  SELECT appointment_duration_minutes, appointment_slot_interval_minutes
    INTO v_duration, v_interval FROM tenants WHERE id = p_tenant_id;

  v_slot_start := v_day_start;

  WHILE v_slot_start < v_day_end LOOP
    v_slot_end := v_slot_start + (v_duration || ' minutes')::INTERVAL;
    IF v_slot_end > v_day_end THEN EXIT; END IF;

    RETURN QUERY
    SELECT v_slot_start, v_slot_end,
      NOT EXISTS (
        SELECT 1 FROM appointments a
        WHERE a.tenant_id = p_tenant_id AND a.date = p_date AND a.status NOT IN ('cancelled')
          AND a.start_time < v_slot_end AND a.end_time > v_slot_start
      );

    v_slot_start := v_slot_start + (v_interval || ' minutes')::INTERVAL;
  END LOOP;
END;
$$;

-- 10. Reset mensal do contador de mensagens (chamado via pg_cron, se disponível)
CREATE OR REPLACE FUNCTION reset_monthly_message_counts()
RETURNS VOID LANGUAGE sql SECURITY DEFINER AS $$
  UPDATE tenants SET messages_used_month = 0 WHERE active = true;
$$;


-- ================================================================
-- CRIPTOGRAFIA (versão final, migrations 017/023/024 consolidadas)
-- Todas aceitam a chave via parâmetro OU via current_setting('app.encryption_key').
-- ================================================================

CREATE OR REPLACE FUNCTION public.get_decrypted_evolution_key(p_tenant_id UUID, p_enc_key TEXT DEFAULT NULL)
RETURNS TEXT LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, pg_catalog AS $$
DECLARE
  v_key TEXT;
  v_encrypted TEXT;
BEGIN
  v_key := COALESCE(p_enc_key, current_setting('app.encryption_key', true));
  SELECT evolution_api_key INTO v_encrypted FROM public.tenants WHERE id = p_tenant_id AND evolution_api_key IS NOT NULL;
  IF v_encrypted IS NULL THEN RETURN NULL; END IF;
  IF v_key IS NULL OR v_key = '' THEN RETURN v_encrypted; END IF;
  BEGIN
    RETURN pgp_sym_decrypt(decode(v_encrypted, 'base64'), v_key)::TEXT;
  EXCEPTION WHEN OTHERS THEN
    RETURN v_encrypted;
  END;
END;
$$;

CREATE OR REPLACE FUNCTION public.encrypt_evolution_key(p_raw_key TEXT, p_enc_key TEXT DEFAULT NULL)
RETURNS TEXT LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_catalog AS $$
DECLARE
  v_key TEXT;
BEGIN
  v_key := COALESCE(p_enc_key, current_setting('app.encryption_key', true));
  IF v_key IS NULL OR v_key = '' THEN RETURN p_raw_key; END IF;
  RETURN encode(pgp_sym_encrypt(p_raw_key, v_key), 'base64');
END;
$$;

CREATE OR REPLACE FUNCTION public.get_tenant_llm_keys(p_tenant_id UUID, p_enc_key TEXT DEFAULT NULL)
RETURNS JSONB LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, pg_catalog AS $$
DECLARE
  v_key TEXT; v_anthropic TEXT; v_openai TEXT; v_gemini TEXT; v_elevenlabs TEXT;
BEGIN
  v_key := COALESCE(p_enc_key, current_setting('app.encryption_key', true));
  SELECT anthropic_api_key, openai_api_key, gemini_api_key, elevenlabs_api_key
    INTO v_anthropic, v_openai, v_gemini, v_elevenlabs
    FROM public.tenants WHERE id = p_tenant_id;

  IF v_key IS NOT NULL AND v_key != '' THEN
    IF v_anthropic IS NOT NULL THEN
      BEGIN v_anthropic := pgp_sym_decrypt(decode(v_anthropic, 'base64'), v_key)::TEXT; EXCEPTION WHEN OTHERS THEN NULL; END;
    END IF;
    IF v_openai IS NOT NULL THEN
      BEGIN v_openai := pgp_sym_decrypt(decode(v_openai, 'base64'), v_key)::TEXT; EXCEPTION WHEN OTHERS THEN NULL; END;
    END IF;
    IF v_gemini IS NOT NULL THEN
      BEGIN v_gemini := pgp_sym_decrypt(decode(v_gemini, 'base64'), v_key)::TEXT; EXCEPTION WHEN OTHERS THEN NULL; END;
    END IF;
    IF v_elevenlabs IS NOT NULL THEN
      BEGIN v_elevenlabs := pgp_sym_decrypt(decode(v_elevenlabs, 'base64'), v_key)::TEXT; EXCEPTION WHEN OTHERS THEN NULL; END;
    END IF;
  END IF;

  RETURN jsonb_build_object(
    'anthropic_api_key', v_anthropic, 'openai_api_key', v_openai,
    'gemini_api_key', v_gemini, 'elevenlabs_api_key', v_elevenlabs
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.encrypt_llm_key(p_raw_key TEXT, p_enc_key TEXT DEFAULT NULL)
RETURNS TEXT LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_catalog AS $$
DECLARE
  v_key TEXT;
BEGIN
  v_key := COALESCE(p_enc_key, current_setting('app.encryption_key', true));
  IF v_key IS NULL OR v_key = '' THEN RETURN p_raw_key; END IF;
  RETURN encode(pgp_sym_encrypt(p_raw_key, v_key), 'base64');
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_decrypted_evolution_key(UUID, TEXT) TO service_role;
GRANT EXECUTE ON FUNCTION public.encrypt_evolution_key(TEXT, TEXT)      TO service_role;
GRANT EXECUTE ON FUNCTION public.get_tenant_llm_keys(UUID, TEXT)        TO service_role;
GRANT EXECUTE ON FUNCTION public.encrypt_llm_key(TEXT, TEXT)            TO service_role;

REVOKE EXECUTE ON FUNCTION public.get_decrypted_evolution_key(UUID, TEXT) FROM authenticated, anon, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.encrypt_evolution_key(TEXT, TEXT)      FROM authenticated, anon, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.get_tenant_llm_keys(UUID, TEXT)        FROM authenticated, anon, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.encrypt_llm_key(TEXT, TEXT)            FROM authenticated, anon, PUBLIC;


-- ================================================================
-- SESSION CLAIMS — substitui o custom_access_token_hook do Supabase.
-- Chame isso na sua aplicação logo depois de autenticar o usuário
-- (com o seu novo auth), e use o resultado pra popular a GUC
-- request.jwt.claims antes de rodar queries que dependam de RLS:
--
--   const claims = await db.query('select get_session_claims($1) as c', [userId]);
--   await db.query('select set_config($1, $2, true)', ['request.jwt.claims', JSON.stringify(claims)]);
--   -- (dentro da MESMA transação da query seguinte, sempre)
-- ================================================================
CREATE OR REPLACE FUNCTION public.get_session_claims(p_user_id UUID)
RETURNS JSONB LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_tenant_id UUID;
  v_role TEXT;
  v_is_super BOOLEAN;
BEGIN
  SELECT EXISTS(SELECT 1 FROM super_admins WHERE id = p_user_id AND active = true) INTO v_is_super;

  IF v_is_super THEN
    RETURN jsonb_build_object('sub', p_user_id::TEXT, 'role', 'service_role', 'is_super_admin', true);
  END IF;

  SELECT tenant_id, role INTO v_tenant_id, v_role FROM users WHERE id = p_user_id AND active = true LIMIT 1;

  RETURN jsonb_build_object(
    'sub', p_user_id::TEXT,
    'role', 'authenticated',
    'tenant_id', v_tenant_id::TEXT,
    'user_role', v_role,
    'is_super_admin', false
  );
END;
$$;

COMMENT ON FUNCTION public.get_session_claims IS
  'Substitui o custom_access_token_hook do Supabase. Chame após autenticar o usuário no seu novo sistema de auth para montar o JSON de request.jwt.claims usado pelas RLS policies.';


-- ================================================================
-- GRANTS — no Supabase isso é feito automaticamente pela plataforma;
-- no Neon precisa ser explícito, senão os roles não enxergam nada
-- mesmo com RLS liberando as linhas (privilégio de tabela é uma
-- camada separada da RLS).
-- ================================================================
GRANT USAGE ON SCHEMA public TO authenticated, anon, service_role;
GRANT USAGE ON SCHEMA auth   TO authenticated, anon, service_role;

GRANT ALL ON ALL TABLES IN SCHEMA public TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO authenticated;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO authenticated, service_role;

ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO authenticated;


-- ================================================================
-- PG_CRON — apenas o job 100% portável (sem pg_net/HTTP).
-- Descomente se sua extensão pg_cron estiver habilitada no Neon.
-- Os outros 3 jobs do Supabase (send-appointment-reminders,
-- process-follow-ups, invoke_process_message) dependiam de pg_net e
-- precisam virar Vercel Cron Jobs / chamadas HTTP feitas pela
-- aplicação — não têm equivalente direto em SQL aqui.
-- ================================================================
-- SELECT cron.schedule(
--   'reset-monthly-message-counts',
--   '0 0 1 * *',
--   'SELECT reset_monthly_message_counts()'
-- );


-- ================================================================
-- FIM. Próximos passos manuais (fora deste SQL):
-- 1. ALTER DATABASE <db> SET app.encryption_key = '<sua-chave>';
-- 2. Crie um usuário de conexão pro backend e conceda service_role:
--      CREATE USER app_backend WITH PASSWORD '...';
--      GRANT service_role TO app_backend;
-- 3. Decida e implemente o novo auth (Auth.js/Clerk/custom) e ligue
--    get_session_claims() no fluxo de login.
-- 4. Recrie os 3 jobs de cron que dependiam de pg_net como Vercel
--    Cron Jobs / rotas HTTP chamadas externamente.
-- 5. Reescreva as 9 edge functions Deno como Route Handlers Next.js
--    (ou outra plataforma serverless) — Neon não tem compute.
-- 6. Substitua supabase.storage (bucket 'media') por Cloudinary/S3/MinIO.
-- 7. Substitua supabase.channel()/postgres_changes (Realtime) por
--    polling, Pusher/Ably, ou LISTEN/NOTIFY + WebSocket próprio.
-- ================================================================
