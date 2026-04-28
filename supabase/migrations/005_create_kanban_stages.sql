-- ============================================================
-- Migration 005: kanban_stages
-- Colunas do kanban por tenant. Depende de tenants.
-- (criado antes de conversations pois conversations referencia stages)
-- ============================================================

CREATE TABLE IF NOT EXISTS kanban_stages (
  id        UUID    PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID    NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  name      TEXT    NOT NULL,
  slug      TEXT    NOT NULL,
  color     TEXT    NOT NULL DEFAULT '#6366f1',
  position  INTEGER NOT NULL DEFAULT 0,
  is_default BOOLEAN NOT NULL DEFAULT false,   -- Stage inicial para novos contatos
  is_closed  BOOLEAN NOT NULL DEFAULT false,   -- Coluna de finalização
  auto_assign BOOLEAN NOT NULL DEFAULT false,  -- IA atribui automaticamente
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  UNIQUE (tenant_id, slug)
);

COMMENT ON TABLE kanban_stages IS 'Colunas do kanban de atendimento por tenant.';
COMMENT ON COLUMN kanban_stages.is_default IS 'Novos contatos entram neste stage automaticamente.';
COMMENT ON COLUMN kanban_stages.is_closed  IS 'Conversas neste stage são consideradas finalizadas.';
COMMENT ON COLUMN kanban_stages.position   IS 'Ordem de exibição da coluna (0 = mais à esquerda).';

-- ── Indexes ────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_kanban_stages_tenant_id ON kanban_stages (tenant_id);
CREATE INDEX IF NOT EXISTS idx_kanban_stages_position  ON kanban_stages (tenant_id, position);

-- ── RLS ────────────────────────────────────────────────────
ALTER TABLE kanban_stages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "tenant_isolation"
  ON kanban_stages FOR ALL
  USING (tenant_id = (auth.jwt() ->> 'tenant_id')::UUID);

CREATE POLICY "super_admin_full_access"
  ON kanban_stages FOR ALL
  USING ((auth.jwt() ->> 'is_super_admin')::BOOLEAN IS TRUE);

CREATE POLICY "service_role_full_access"
  ON kanban_stages FOR ALL
  USING (auth.role() = 'service_role');
