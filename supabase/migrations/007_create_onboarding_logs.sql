-- ============================================================
-- Migration 007: onboarding_logs (auditoria do processo)
-- ============================================================

CREATE TABLE IF NOT EXISTS onboarding_logs (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id  UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  created_by UUID NOT NULL REFERENCES super_admins(id),

  -- Step completo no wizard de onboarding
  step      TEXT NOT NULL
    CHECK (step IN (
      'business_info',
      'whatsapp_setup',
      'ai_config',
      'products',
      'business_hours',
      'activated'
    )),
  step_data    JSONB       NOT NULL DEFAULT '{}',
  completed_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE onboarding_logs IS 'Auditoria de cada step executado durante o onboarding de um tenant.';
COMMENT ON COLUMN onboarding_logs.step_data IS 'Dados coletados naquele step (snapshot para auditoria).';

-- ── Indexes ────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_onboarding_logs_tenant_id ON onboarding_logs (tenant_id);
CREATE INDEX IF NOT EXISTS idx_onboarding_logs_step      ON onboarding_logs (tenant_id, step);

-- ── RLS ────────────────────────────────────────────────────
ALTER TABLE onboarding_logs ENABLE ROW LEVEL SECURITY;

-- Apenas super admin e service role acessam logs de onboarding
CREATE POLICY "super_admin_full_access"
  ON onboarding_logs FOR ALL
  USING ((auth.jwt() ->> 'is_super_admin')::BOOLEAN IS TRUE);

CREATE POLICY "service_role_full_access"
  ON onboarding_logs FOR ALL
  USING (auth.role() = 'service_role');
