-- ============================================================
-- Migration 008: conversations
-- Uma conversa = thread WhatsApp de um contact com o tenant.
-- ============================================================

CREATE TABLE IF NOT EXISTS conversations (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       UUID NOT NULL REFERENCES tenants(id)     ON DELETE CASCADE,
  contact_id      UUID NOT NULL REFERENCES contacts(id)    ON DELETE CASCADE,
  ai_agent_id     UUID          REFERENCES ai_agents(id),
  kanban_stage_id UUID          REFERENCES kanban_stages(id),
  assigned_to     UUID          REFERENCES users(id),

  status TEXT NOT NULL DEFAULT 'ai_handling'
    CHECK (status IN ('ai_handling','waiting_human','human_handling','closed')),

  ai_context   JSONB NOT NULL DEFAULT '{}',  -- Contexto acumulado pela IA
  ai_summary   TEXT,                          -- Resumo gerado pela IA ao escalar

  priority TEXT NOT NULL DEFAULT 'normal'
    CHECK (priority IN ('low','normal','high','urgent')),

  channel TEXT NOT NULL DEFAULT 'whatsapp',

  started_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  closed_at        TIMESTAMPTZ,
  last_message_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  metadata         JSONB       NOT NULL DEFAULT '{}',
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE conversations IS 'Thread de atendimento: um por (contact, tenant) ativo simultaneamente.';
COMMENT ON COLUMN conversations.ai_context IS 'Estado acumulado: intent, dados coletados, etapa do funil.';
COMMENT ON COLUMN conversations.ai_summary IS 'Resumo gerado pela IA no momento da escalação para humano.';

-- ── Indexes ────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_conversations_tenant_id       ON conversations (tenant_id);
CREATE INDEX IF NOT EXISTS idx_conversations_contact_id      ON conversations (contact_id);
CREATE INDEX IF NOT EXISTS idx_conversations_status          ON conversations (tenant_id, status);
CREATE INDEX IF NOT EXISTS idx_conversations_stage           ON conversations (kanban_stage_id);
CREATE INDEX IF NOT EXISTS idx_conversations_assigned_to     ON conversations (assigned_to);
CREATE INDEX IF NOT EXISTS idx_conversations_last_message_at ON conversations (tenant_id, last_message_at DESC);

-- ── RLS ────────────────────────────────────────────────────
ALTER TABLE conversations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "tenant_isolation"
  ON conversations FOR ALL
  USING (tenant_id = (auth.jwt() ->> 'tenant_id')::UUID);

CREATE POLICY "super_admin_full_access"
  ON conversations FOR ALL
  USING ((auth.jwt() ->> 'is_super_admin')::BOOLEAN IS TRUE);

CREATE POLICY "service_role_full_access"
  ON conversations FOR ALL
  USING (auth.role() = 'service_role');
