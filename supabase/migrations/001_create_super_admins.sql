-- ============================================================
-- Migration 001: super_admins
-- Dono da plataforma ZapAgent. Acessa /admin.
-- ============================================================

CREATE TABLE IF NOT EXISTS super_admins (
  id         UUID        PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  full_name  TEXT        NOT NULL,
  email      TEXT        NOT NULL UNIQUE,
  avatar_url TEXT,
  active     BOOLEAN     NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE super_admins IS 'Donos da plataforma ZapAgent. Acesso total ao painel /admin.';

-- ── RLS ────────────────────────────────────────────────────
ALTER TABLE super_admins ENABLE ROW LEVEL SECURITY;

-- Super admin só vê a si mesmo via JWT normal
CREATE POLICY "super_admin_self_select"
  ON super_admins
  FOR SELECT
  USING (id = auth.uid());

-- Service role tem acesso irrestrito (edge functions)
CREATE POLICY "service_role_full_access"
  ON super_admins
  FOR ALL
  USING (auth.role() = 'service_role');

-- Index de suporte para lookups por email
CREATE UNIQUE INDEX IF NOT EXISTS idx_super_admins_email ON super_admins (email);
