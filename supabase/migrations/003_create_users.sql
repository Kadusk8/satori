-- ============================================================
-- Migration 003: users (operadores do painel tenant)
-- Owner, admin e operadores vinculados a um tenant.
-- NOTA: Super admin é uma entidade separada (tabela super_admins).
-- ============================================================

CREATE TABLE IF NOT EXISTS users (
  id         UUID    PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  tenant_id  UUID    NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  full_name  TEXT    NOT NULL,
  email      TEXT    NOT NULL,
  role       TEXT    NOT NULL DEFAULT 'operator'
    CHECK (role IN ('owner','admin','operator')),
  avatar_url    TEXT,
  is_available  BOOLEAN     NOT NULL DEFAULT true,
  active        BOOLEAN     NOT NULL DEFAULT true,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE users IS 'Operadores do painel tenant. Owner criado automaticamente no onboarding.';
COMMENT ON COLUMN users.role IS 'owner: dono do tenant | admin: gestor | operator: atendente';
COMMENT ON COLUMN users.is_available IS 'Indica se o operador está disponível para receber chats escalados.';

-- ── Indexes ────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_users_tenant_id ON users (tenant_id);
CREATE INDEX IF NOT EXISTS idx_users_email     ON users (email);
CREATE UNIQUE INDEX IF NOT EXISTS idx_users_tenant_email ON users (tenant_id, email);

-- ── RLS ────────────────────────────────────────────────────
ALTER TABLE users ENABLE ROW LEVEL SECURITY;

-- Usuário vê apenas os membros do seu próprio tenant
CREATE POLICY "tenant_isolation"
  ON users FOR SELECT
  USING (tenant_id = (auth.jwt() ->> 'tenant_id')::UUID);

-- Owner e admin podem inserir/atualizar operadores do seu tenant
CREATE POLICY "owner_admin_manage"
  ON users FOR ALL
  USING (
    tenant_id = (auth.jwt() ->> 'tenant_id')::UUID
    AND (auth.jwt() ->> 'role')::TEXT IN ('owner','admin')
  );

-- Operador pode atualizar apenas seu próprio registro (ex.: is_available)
CREATE POLICY "operator_self_update"
  ON users FOR UPDATE
  USING (id = auth.uid());

-- Super admin vê todos
CREATE POLICY "super_admin_full_access"
  ON users FOR ALL
  USING ((auth.jwt() ->> 'is_super_admin')::BOOLEAN IS TRUE);

-- Service role irrestrito
CREATE POLICY "service_role_full_access"
  ON users FOR ALL
  USING (auth.role() = 'service_role');
