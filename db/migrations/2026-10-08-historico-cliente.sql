-- Migration: histórico do cliente (2026-10-08)
-- Aplica num banco já existente o mesmo bloco "HISTÓRICO DO CLIENTE" do
-- db/schema.sql. Idempotente — pode rodar mais de uma vez.
--
--   psql "$DATABASE_URL" -f db/migrations/2026-10-08-historico-cliente.sql

BEGIN;

ALTER TABLE contacts ADD COLUMN IF NOT EXISTS birth_date DATE;
ALTER TABLE contacts ADD COLUMN IF NOT EXISTS document   TEXT;
ALTER TABLE contacts ADD COLUMN IF NOT EXISTS address    TEXT;

CREATE TABLE IF NOT EXISTS appointment_services (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  appointment_id  UUID NOT NULL REFERENCES appointments(id) ON DELETE CASCADE,
  product_id      UUID REFERENCES products(id) ON DELETE SET NULL,
  service_name    TEXT NOT NULL,
  price           NUMERIC(12,2) NOT NULL DEFAULT 0,
  professional_id UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE appointment_services IS 'Serviços realizados num atendimento concluído — base do histórico do cliente (visitas, valores, quem atendeu).';

CREATE INDEX IF NOT EXISTS idx_appointment_services_tenant_id      ON appointment_services (tenant_id);
CREATE INDEX IF NOT EXISTS idx_appointment_services_appointment_id ON appointment_services (appointment_id);
CREATE INDEX IF NOT EXISTS idx_appointment_services_professional   ON appointment_services (professional_id);

ALTER TABLE appointment_services ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "tenant_isolation" ON appointment_services;
CREATE POLICY "tenant_isolation" ON appointment_services
  FOR ALL USING (tenant_id = (auth.jwt() ->> 'tenant_id')::UUID);

DROP POLICY IF EXISTS "super_admin_full_access" ON appointment_services;
CREATE POLICY "super_admin_full_access" ON appointment_services
  FOR ALL USING ((auth.jwt() ->> 'is_super_admin')::BOOLEAN IS TRUE);

DROP POLICY IF EXISTS "service_role_full_access" ON appointment_services;
CREATE POLICY "service_role_full_access" ON appointment_services
  FOR ALL USING (auth.role() = 'service_role');

CREATE TABLE IF NOT EXISTS client_score_rules (
  tenant_id             UUID PRIMARY KEY REFERENCES tenants(id) ON DELETE CASCADE,
  points_per_visit      INTEGER       NOT NULL DEFAULT 10,
  spend_step            NUMERIC(12,2) NOT NULL DEFAULT 10 CHECK (spend_step > 0),
  points_per_spend_step INTEGER       NOT NULL DEFAULT 1,
  no_show_penalty       INTEGER       NOT NULL DEFAULT 5,
  window_months         INTEGER CHECK (window_months IS NULL OR window_months > 0),
  inactive_after_days   INTEGER       NOT NULL DEFAULT 90 CHECK (inactive_after_days > 0),
  service_bonuses       JSONB NOT NULL DEFAULT '[]',
  tiers                 JSONB NOT NULL DEFAULT '[{"name":"Bronze","min_points":0},{"name":"Prata","min_points":100},{"name":"Ouro","min_points":300},{"name":"Diamante","min_points":600}]',
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE client_score_rules IS 'Regras de pontuação de clientes (score pra promoções), definidas pelo próprio tenant.';

ALTER TABLE client_score_rules ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "tenant_isolation" ON client_score_rules;
CREATE POLICY "tenant_isolation" ON client_score_rules
  FOR ALL USING (tenant_id = (auth.jwt() ->> 'tenant_id')::UUID);

DROP POLICY IF EXISTS "super_admin_full_access" ON client_score_rules;
CREATE POLICY "super_admin_full_access" ON client_score_rules
  FOR ALL USING ((auth.jwt() ->> 'is_super_admin')::BOOLEAN IS TRUE);

DROP POLICY IF EXISTS "service_role_full_access" ON client_score_rules;
CREATE POLICY "service_role_full_access" ON client_score_rules
  FOR ALL USING (auth.role() = 'service_role');

-- Mesmos grants do fim do schema.sql (tabelas novas não herdam se o
-- ALTER DEFAULT PRIVILEGES tiver sido rodado por outro usuário).
GRANT ALL ON appointment_services, client_score_rules TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON appointment_services, client_score_rules TO authenticated;

COMMIT;
