-- Inscrições de Web Push (PWA) por usuário — usadas por apps/web/app/api/push-subscribe e
-- services/backend/src/shared/push-sender.ts. O código existia desde o commit adfaad7, mas a
-- tabela nunca tinha sido criada no banco, então nenhum push era enviado.
CREATE TABLE IF NOT EXISTS push_subscriptions (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  user_id     UUID NOT NULL REFERENCES users(id)   ON DELETE CASCADE,
  endpoint    TEXT NOT NULL UNIQUE,
  keys_p256dh TEXT NOT NULL,
  keys_auth   TEXT NOT NULL,
  user_agent  TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_push_subscriptions_tenant_user ON push_subscriptions (tenant_id, user_id);

ALTER TABLE push_subscriptions ENABLE ROW LEVEL SECURITY;

-- Cada usuário só vê/grava as próprias inscrições, dentro do próprio tenant.
DROP POLICY IF EXISTS "own_subscriptions" ON push_subscriptions;
CREATE POLICY "own_subscriptions" ON push_subscriptions
  FOR ALL
  USING (tenant_id = (auth.jwt() ->> 'tenant_id')::UUID AND user_id = auth.uid())
  WITH CHECK (tenant_id = (auth.jwt() ->> 'tenant_id')::UUID AND user_id = auth.uid());

DROP POLICY IF EXISTS "service_role_full_access" ON push_subscriptions;
CREATE POLICY "service_role_full_access" ON push_subscriptions
  FOR ALL USING (auth.role() = 'service_role');

GRANT SELECT, INSERT, UPDATE, DELETE ON push_subscriptions TO authenticated;
GRANT ALL ON push_subscriptions TO service_role;
