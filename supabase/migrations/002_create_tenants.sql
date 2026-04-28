-- ============================================================
-- Migration 002: tenants
-- Clientes da plataforma (empresas/negócios).
-- ============================================================

CREATE TABLE IF NOT EXISTS tenants (
  id          UUID    PRIMARY KEY DEFAULT gen_random_uuid(),
  name        TEXT    NOT NULL,
  slug        TEXT    NOT NULL UNIQUE,

  -- Dados do negócio (coletados no onboarding)
  business_segment    TEXT CHECK (business_segment IN ('clinica','loja','servicos','restaurante','outro')),
  business_description TEXT,
  owner_name          TEXT,
  owner_email         TEXT,
  owner_phone         TEXT,
  address             TEXT,
  city                TEXT,
  state               TEXT,
  website             TEXT,

  -- Plano e status
  plan   TEXT NOT NULL DEFAULT 'free'
    CHECK (plan IN ('free','starter','pro','enterprise')),
  status TEXT NOT NULL DEFAULT 'onboarding'
    CHECK (status IN ('onboarding','active','suspended','cancelled')),
  onboarding_completed_at TIMESTAMPTZ,

  -- WhatsApp
  whatsapp_instance_name  TEXT,
  whatsapp_number         TEXT,
  whatsapp_connection_type TEXT DEFAULT 'baileys'
    CHECK (whatsapp_connection_type IN ('baileys','cloud_api')),
  whatsapp_connected      BOOLEAN NOT NULL DEFAULT false,

  -- Configuração geral
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
  cloudinary_upload_preset          TEXT,
  logo_url                          TEXT,

  -- Limites do plano
  max_messages_month  INTEGER NOT NULL DEFAULT 1000,
  max_products        INTEGER NOT NULL DEFAULT 50,
  max_operators       INTEGER NOT NULL DEFAULT 3,
  messages_used_month INTEGER NOT NULL DEFAULT 0,

  -- Metadata
  created_by UUID REFERENCES super_admins(id),
  active     BOOLEAN     NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE tenants IS 'Clientes da plataforma (negócios). Cada tenant é isolado via RLS.';
COMMENT ON COLUMN tenants.slug IS 'Identificador único URL-safe usado como instanceName na Evolution API.';
COMMENT ON COLUMN tenants.messages_used_month IS 'Contador resetado mensalmente via pg_cron.';

-- ── Indexes ────────────────────────────────────────────────
CREATE UNIQUE INDEX IF NOT EXISTS idx_tenants_slug         ON tenants (slug);
CREATE        INDEX IF NOT EXISTS idx_tenants_status       ON tenants (status);
CREATE        INDEX IF NOT EXISTS idx_tenants_created_by   ON tenants (created_by);

-- ── Trigger: atualizar updated_at ─────────────────────────
CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_tenants_updated_at
  BEFORE UPDATE ON tenants
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ── RLS ────────────────────────────────────────────────────
ALTER TABLE tenants ENABLE ROW LEVEL SECURITY;

-- Tenant vê apenas o seu próprio registro (via custom claim tenant_id no JWT)
CREATE POLICY "tenant_isolation_select"
  ON tenants FOR SELECT
  USING (id = (auth.jwt() ->> 'tenant_id')::UUID);

CREATE POLICY "tenant_isolation_update"
  ON tenants FOR UPDATE
  USING (id = (auth.jwt() ->> 'tenant_id')::UUID);

-- Super admin tem acesso total a todos os tenants
CREATE POLICY "super_admin_full_access"
  ON tenants FOR ALL
  USING ((auth.jwt() ->> 'is_super_admin')::BOOLEAN IS TRUE);

-- Service role (edge functions) tem acesso irrestrito
CREATE POLICY "service_role_full_access"
  ON tenants FOR ALL
  USING (auth.role() = 'service_role');
