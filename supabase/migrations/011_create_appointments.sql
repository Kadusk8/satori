-- ============================================================
-- Migration 011: appointments (agendamentos)
-- Requer a extensão btree_gist para o EXCLUDE constraint.
-- ============================================================

CREATE EXTENSION IF NOT EXISTS btree_gist;

CREATE TABLE IF NOT EXISTS appointments (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       UUID NOT NULL REFERENCES tenants(id)       ON DELETE CASCADE,
  contact_id      UUID NOT NULL REFERENCES contacts(id),
  conversation_id UUID          REFERENCES conversations(id),
  assigned_to     UUID          REFERENCES users(id),

  title  TEXT,
  notes  TEXT,

  date       DATE NOT NULL,
  start_time TIME NOT NULL,
  end_time   TIME NOT NULL,

  status TEXT NOT NULL DEFAULT 'confirmed'
    CHECK (status IN ('pending','confirmed','cancelled','completed','no_show')),

  -- Controle de lembretes
  reminder_24h_sent       BOOLEAN NOT NULL DEFAULT false,
  reminder_1h_sent        BOOLEAN NOT NULL DEFAULT false,
  whatsapp_reminder_sent  BOOLEAN NOT NULL DEFAULT false,

  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  -- Prevenir conflitos de horário por tenant (ignora cancelados)
  EXCLUDE USING gist (
    tenant_id WITH =,
    tstzrange(
      (date + start_time) AT TIME ZONE 'America/Sao_Paulo',
      (date + end_time)   AT TIME ZONE 'America/Sao_Paulo'
    ) WITH &&
  ) WHERE (status NOT IN ('cancelled'))
);

COMMENT ON TABLE appointments IS 'Agendamentos criados pela IA ou manualmente pelos operadores.';
COMMENT ON COLUMN appointments.end_time IS 'Calculado a partir de start_time + tenant.appointment_duration_minutes.';
COMMENT ON CONSTRAINT appointments_tenant_id_tstzrange_excl ON appointments IS
  'Impede agendamentos sobrepostos no mesmo tenant (exceto cancelados).';

-- ── Indexes ────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_appointments_tenant_id    ON appointments (tenant_id);
CREATE INDEX IF NOT EXISTS idx_appointments_contact_id   ON appointments (contact_id);
CREATE INDEX IF NOT EXISTS idx_appointments_date         ON appointments (tenant_id, date);
CREATE INDEX IF NOT EXISTS idx_appointments_status       ON appointments (tenant_id, status);
CREATE INDEX IF NOT EXISTS idx_appointments_assigned_to  ON appointments (assigned_to);
CREATE INDEX IF NOT EXISTS idx_appointments_reminders    ON appointments (tenant_id, date, reminder_24h_sent, reminder_1h_sent)
  WHERE status NOT IN ('cancelled','completed');

-- ── Trigger: updated_at ───────────────────────────────────
CREATE TRIGGER trg_appointments_updated_at
  BEFORE UPDATE ON appointments
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ── RLS ────────────────────────────────────────────────────
ALTER TABLE appointments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "tenant_isolation"
  ON appointments FOR ALL
  USING (tenant_id = (auth.jwt() ->> 'tenant_id')::UUID);

CREATE POLICY "super_admin_full_access"
  ON appointments FOR ALL
  USING ((auth.jwt() ->> 'is_super_admin')::BOOLEAN IS TRUE);

CREATE POLICY "service_role_full_access"
  ON appointments FOR ALL
  USING (auth.role() = 'service_role');
