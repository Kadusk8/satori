-- ============================================================
-- Migration 015: cria tabela follow_ups e job pg_cron
-- ============================================================

CREATE TABLE follow_ups (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  contact_id UUID NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,
  conversation_id UUID NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  ai_agent_id UUID NOT NULL REFERENCES ai_agents(id) ON DELETE CASCADE,
  scheduled_at TIMESTAMPTZ NOT NULL,
  sent_at TIMESTAMPTZ,
  attempt_number INTEGER NOT NULL DEFAULT 1,
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'sent', 'replied', 'cancelled', 'max_reached')),
  message_content TEXT,
  context TEXT,        -- Contexto passado pela IA ao agendar (resumo da conversa)
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Índice para busca eficiente dos pending (usado pelo process-follow-ups a cada hora)
CREATE INDEX idx_follow_ups_pending ON follow_ups (tenant_id, scheduled_at)
  WHERE status = 'pending';

-- Índice para cancelar follow-ups ao receber resposta do contato
CREATE INDEX idx_follow_ups_contact_pending ON follow_ups (contact_id)
  WHERE status = 'pending';

-- RLS
ALTER TABLE follow_ups ENABLE ROW LEVEL SECURITY;

CREATE POLICY "tenant_isolation" ON follow_ups
  USING (tenant_id = (auth.jwt() ->> 'tenant_id')::UUID);

CREATE POLICY "service_role_full_access" ON follow_ups
  FOR ALL
  USING (auth.role() = 'service_role');

CREATE POLICY "super_admin_full_access" ON follow_ups
  FOR ALL
  USING ((auth.jwt() ->> 'is_super_admin')::BOOLEAN = true);

-- Trigger de updated_at
CREATE OR REPLACE FUNCTION update_follow_ups_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_follow_ups_updated_at
  BEFORE UPDATE ON follow_ups
  FOR EACH ROW EXECUTE FUNCTION update_follow_ups_updated_at();

-- ── pg_cron: processa follow-ups a cada 60 minutos ──────────────────────────
-- Requer a extensão pg_cron habilitada na migration 013.
-- A edge function process-follow-ups é chamada com service role key.

SELECT cron.schedule(
  'process-follow-ups',
  '0 * * * *',
  $$
  SELECT net.http_post(
    url := current_setting('app.supabase_functions_url') || '/process-follow-ups',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || current_setting('app.service_role_key')
    ),
    body := '{}'::jsonb
  );
  $$
);

COMMENT ON TABLE follow_ups IS 'Registro de follow-ups automáticos enviados pela IA quando a conversa fica inativa';
