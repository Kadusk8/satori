-- B7: operador não pode alterar a linha do tenant; só owner/admin (defesa em profundidade).
-- Idempotente. Rodar manualmente no banco (não foi executada pela auditoria).
DROP POLICY IF EXISTS "tenant_isolation_update" ON tenants;
CREATE POLICY "tenant_isolation_update" ON tenants
  FOR UPDATE USING (
    id = (auth.jwt() ->> 'tenant_id')::UUID
    AND COALESCE(auth.jwt() ->> 'user_role', '') IN ('owner', 'admin')
  );
