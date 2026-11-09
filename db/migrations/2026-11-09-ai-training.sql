-- "Teste com a IA": o dono conversa com a IA numa tela estilo WhatsApp e deixa
-- observações do que quer mudar. A conversa de teste usa as mesmas tabelas da
-- produção (pra rodar o pipeline real) mas é marcada is_sandbox e apagada ao final.

ALTER TABLE contacts      ADD COLUMN IF NOT EXISTS is_sandbox BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE conversations ADD COLUMN IF NOT EXISTS is_sandbox BOOLEAN NOT NULL DEFAULT false;

CREATE TABLE IF NOT EXISTS ai_training_sessions (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  user_id         UUID REFERENCES users(id) ON DELETE SET NULL,
  -- conversa de teste (apagada ao encerrar; sem FK de propósito)
  conversation_id UUID,
  status          TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','finished','abandoned')),
  general_notes   TEXT,
  -- cópia da conversa tirada ao encerrar: [{role,content,contentType,mediaUrl,at}]
  transcript      JSONB NOT NULL DEFAULT '[]',
  started_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  finished_at     TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_ai_training_sessions_tenant ON ai_training_sessions (tenant_id, started_at DESC);

CREATE TABLE IF NOT EXISTS ai_training_feedback (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id       UUID NOT NULL REFERENCES ai_training_sessions(id) ON DELETE CASCADE,
  tenant_id        UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  -- o que o cliente (dono) disse, o que a IA respondeu e como ele queria que fosse
  customer_message TEXT,
  ai_response      TEXT,
  desired_response TEXT NOT NULL,
  status           TEXT NOT NULL DEFAULT 'new' CHECK (status IN ('new','applied','dismissed')),
  -- Regra ativa: o texto (editado pelo admin) entra no prompt da IA desse tenant.
  rule_text        TEXT,
  rule_active      BOOLEAN NOT NULL DEFAULT false,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ai_training_feedback_tenant ON ai_training_feedback (tenant_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_ai_training_feedback_session ON ai_training_feedback (session_id);
CREATE INDEX IF NOT EXISTS idx_ai_training_feedback_rules ON ai_training_feedback (tenant_id) WHERE rule_active;

ALTER TABLE ai_training_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE ai_training_feedback ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY "tenant_isolation" ON ai_training_sessions
    FOR ALL USING (tenant_id = (auth.jwt() ->> 'tenant_id')::UUID);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE POLICY "super_admin_full_access" ON ai_training_sessions
    FOR ALL USING ((auth.jwt() ->> 'is_super_admin')::BOOLEAN IS TRUE);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE POLICY "service_role_full_access" ON ai_training_sessions
    FOR ALL USING (auth.role() = 'service_role');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY "tenant_isolation" ON ai_training_feedback
    FOR ALL USING (tenant_id = (auth.jwt() ->> 'tenant_id')::UUID);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE POLICY "super_admin_full_access" ON ai_training_feedback
    FOR ALL USING ((auth.jwt() ->> 'is_super_admin')::BOOLEAN IS TRUE);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE POLICY "service_role_full_access" ON ai_training_feedback
    FOR ALL USING (auth.role() = 'service_role');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

GRANT SELECT, INSERT, UPDATE, DELETE ON ai_training_sessions, ai_training_feedback TO authenticated, service_role;
