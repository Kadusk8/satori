-- Modos de negócio (produtos ou serviços), mantendo compatibilidade com tenants existentes.
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS business_model TEXT NOT NULL DEFAULT 'product';

DO $$ BEGIN
  ALTER TABLE tenants ADD CONSTRAINT tenants_business_model_check
    CHECK (business_model IN ('product', 'service'));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

ALTER TABLE products ADD COLUMN IF NOT EXISTS item_kind TEXT NOT NULL DEFAULT 'product';
ALTER TABLE products ADD COLUMN IF NOT EXISTS duration_minutes INTEGER;

DO $$ BEGIN
  ALTER TABLE products ADD CONSTRAINT products_item_kind_check
    CHECK (item_kind IN ('product', 'service'));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE products ADD CONSTRAINT products_duration_minutes_check
    CHECK (
      (item_kind = 'product' AND duration_minutes IS NULL)
      OR (item_kind = 'service' AND duration_minutes IS NOT NULL AND duration_minutes > 0)
    );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE INDEX IF NOT EXISTS idx_products_tenant_kind
  ON products (tenant_id, item_kind, is_available);

ALTER TABLE appointments
  ADD COLUMN IF NOT EXISTS service_id UUID REFERENCES products(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_appointments_service_id
  ON appointments (service_id) WHERE service_id IS NOT NULL;

COMMENT ON COLUMN tenants.business_model IS 'Experiência principal do tenant: produtos ou serviços.';
COMMENT ON COLUMN products.item_kind IS 'Tipo do item do catálogo, preservando as FKs históricas.';
COMMENT ON COLUMN products.duration_minutes IS 'Duração usada para calcular slots de serviços.';
COMMENT ON COLUMN appointments.service_id IS 'Serviço escolhido na reserva; nulo para visitas genéricas e registros antigos.';

CREATE TABLE IF NOT EXISTS tenant_business_model_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  from_model TEXT NOT NULL CHECK (from_model IN ('product', 'service')),
  to_model TEXT NOT NULL CHECK (to_model IN ('product', 'service')),
  changed_by UUID REFERENCES super_admins(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_tenant_business_model_history_tenant
  ON tenant_business_model_history (tenant_id, created_at DESC);

ALTER TABLE tenant_business_model_history ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "super_admin_full_access" ON tenant_business_model_history;
CREATE POLICY "super_admin_full_access" ON tenant_business_model_history
  FOR ALL USING ((auth.jwt() ->> 'is_super_admin')::BOOLEAN IS TRUE);
DROP POLICY IF EXISTS "service_role_full_access" ON tenant_business_model_history;
CREATE POLICY "service_role_full_access" ON tenant_business_model_history
  FOR ALL USING (auth.role() = 'service_role');
