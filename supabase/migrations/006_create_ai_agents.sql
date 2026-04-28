-- ============================================================
-- Migration 006: ai_agents (agentes de IA por tenant)
-- ============================================================

CREATE TABLE IF NOT EXISTS ai_agents (
  id        UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,

  name      TEXT NOT NULL,                    -- "SDR/Vendedor", "Suporte", "Agendamento"
  slug      TEXT NOT NULL,                    -- "sdr", "suporte", "agendamento"
  type      TEXT NOT NULL DEFAULT 'sdr'
    CHECK (type IN ('sdr','support','scheduler','custom')),
  is_active   BOOLEAN NOT NULL DEFAULT true,
  is_default  BOOLEAN NOT NULL DEFAULT false, -- Agente padrão do tenant

  -- Configuração do LLM
  model       TEXT    NOT NULL DEFAULT 'claude-sonnet-4-20250514',
  temperature NUMERIC(3,2) NOT NULL DEFAULT 0.7
    CHECK (temperature >= 0 AND temperature <= 1),
  max_tokens  INTEGER NOT NULL DEFAULT 1024,

  -- Prompt e personalidade
  system_prompt TEXT NOT NULL,
  personality   TEXT,
  language      TEXT NOT NULL DEFAULT 'pt-BR',

  -- Mensagens padronizadas
  greeting_message      TEXT,
  farewell_message      TEXT,
  out_of_hours_message  TEXT,

  -- Regras de escalação
  escalation_rules JSONB NOT NULL DEFAULT '{
    "max_turns_without_resolution": 10,
    "low_confidence_threshold": 0.3,
    "escalation_keywords": ["falar com humano","atendente","gerente"]
  }',

  -- Capacidades (quais tools o agente pode usar)
  can_search_products    BOOLEAN NOT NULL DEFAULT true,
  can_book_appointments  BOOLEAN NOT NULL DEFAULT true,
  can_send_images        BOOLEAN NOT NULL DEFAULT true,
  can_escalate           BOOLEAN NOT NULL DEFAULT true,
  can_collect_lead_info  BOOLEAN NOT NULL DEFAULT true,

  -- Instruções específicas para SDR
  sdr_instructions JSONB NOT NULL DEFAULT '{
    "qualification_questions": [
      "Qual seu nome?",
      "Qual produto/serviço te interessa?",
      "Qual seu orçamento?"
    ],
    "follow_up_after_hours": 24,
    "auto_tag_leads": true,
    "lead_scoring_enabled": true
  }',

  -- Métricas acumuladas
  total_conversations       INTEGER      NOT NULL DEFAULT 0,
  total_escalations         INTEGER      NOT NULL DEFAULT 0,
  avg_response_time_seconds INTEGER,
  satisfaction_score        NUMERIC(3,2),

  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  UNIQUE (tenant_id, slug)
);

COMMENT ON TABLE ai_agents IS 'Agentes de IA configuráveis por tenant (SDR, Suporte, Agendamento, Custom).';
COMMENT ON COLUMN ai_agents.is_default IS 'Somente um agente pode ser padrão por tenant.';
COMMENT ON COLUMN ai_agents.system_prompt IS 'Prompt personalizado no onboarding com dados do negócio.';

-- ── Garantir apenas 1 agente padrão por tenant ──────────────
CREATE UNIQUE INDEX IF NOT EXISTS idx_ai_agents_one_default
  ON ai_agents (tenant_id)
  WHERE is_default = true;

-- ── Indexes ────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_ai_agents_tenant_id ON ai_agents (tenant_id);

-- ── Trigger: updated_at ───────────────────────────────────
CREATE TRIGGER trg_ai_agents_updated_at
  BEFORE UPDATE ON ai_agents
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ── RLS ────────────────────────────────────────────────────
ALTER TABLE ai_agents ENABLE ROW LEVEL SECURITY;

-- Usuários do tenant veem somente os agentes do seu tenant
CREATE POLICY "tenant_isolation"
  ON ai_agents FOR ALL
  USING (tenant_id = (auth.jwt() ->> 'tenant_id')::UUID);

-- Somente owner e admin podem criar/editar agentes
CREATE POLICY "owner_admin_write"
  ON ai_agents FOR INSERT
  WITH CHECK (
    tenant_id = (auth.jwt() ->> 'tenant_id')::UUID
    AND (auth.jwt() ->> 'role')::TEXT IN ('owner','admin')
  );

CREATE POLICY "super_admin_full_access"
  ON ai_agents FOR ALL
  USING ((auth.jwt() ->> 'is_super_admin')::BOOLEAN IS TRUE);

CREATE POLICY "service_role_full_access"
  ON ai_agents FOR ALL
  USING (auth.role() = 'service_role');
