-- ============================================================
-- Migration 004: contacts (leads/clientes vindos do WhatsApp)
-- ============================================================

CREATE TABLE IF NOT EXISTS contacts (
  id               UUID    PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id        UUID    NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  whatsapp_number  TEXT    NOT NULL,
  whatsapp_name    TEXT,      -- Nome exibido no WhatsApp
  custom_name      TEXT,      -- Nome editado pelo operador
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

COMMENT ON TABLE contacts IS 'Leads e clientes vindos do WhatsApp. Um por número por tenant.';
COMMENT ON COLUMN contacts.tags IS 'Tags para segmentação e busca (ex.: [''lead_quente'', ''vip''])';
COMMENT ON COLUMN contacts.metadata IS 'Campos livres extras configuráveis por tenant.';

-- ── Indexes ────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_contacts_tenant_id         ON contacts (tenant_id);
CREATE INDEX IF NOT EXISTS idx_contacts_whatsapp_number   ON contacts (tenant_id, whatsapp_number);
CREATE INDEX IF NOT EXISTS idx_contacts_last_contact_at   ON contacts (tenant_id, last_contact_at DESC);
CREATE INDEX IF NOT EXISTS idx_contacts_tags              ON contacts USING GIN (tags);

-- ── RLS ────────────────────────────────────────────────────
ALTER TABLE contacts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "tenant_isolation"
  ON contacts FOR ALL
  USING (tenant_id = (auth.jwt() ->> 'tenant_id')::UUID);

CREATE POLICY "super_admin_full_access"
  ON contacts FOR ALL
  USING ((auth.jwt() ->> 'is_super_admin')::BOOLEAN IS TRUE);

CREATE POLICY "service_role_full_access"
  ON contacts FOR ALL
  USING (auth.role() = 'service_role');
