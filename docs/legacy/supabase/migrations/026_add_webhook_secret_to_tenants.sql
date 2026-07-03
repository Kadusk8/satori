-- ============================================================
-- Migration 026: adiciona webhook_secret por tenant
-- A Evolution API (e a Evolution Go) não enviam nenhum header de
-- autenticação nas chamadas de webhook — a validação precisa ser
-- feita via um segredo embutido na própria URL do webhook
-- (?ts=<webhook_secret>), conferido em webhook-evolution/index.ts.
-- ============================================================

ALTER TABLE tenants
  ADD COLUMN IF NOT EXISTS webhook_secret TEXT NOT NULL DEFAULT encode(gen_random_bytes(24), 'hex');

CREATE INDEX IF NOT EXISTS idx_tenants_webhook_secret ON tenants (webhook_secret);
