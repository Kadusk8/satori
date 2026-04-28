-- Migration 020: corrige políticas RLS de escrita na tabela products
-- O super_admin precisa de políticas explícitas para INSERT/UPDATE/DELETE
-- (a política FOR ALL só cobria SELECT no contexto anterior)

-- Remove política antiga genérica e recria separada por operação
DROP POLICY IF EXISTS "super_admin_full_access" ON products;

CREATE POLICY "super_admin_select" ON products FOR SELECT
  USING ((auth.jwt() ->> 'is_super_admin')::BOOLEAN IS TRUE);

CREATE POLICY "super_admin_insert" ON products FOR INSERT
  WITH CHECK ((auth.jwt() ->> 'is_super_admin')::BOOLEAN IS TRUE);

CREATE POLICY "super_admin_update" ON products FOR UPDATE
  USING ((auth.jwt() ->> 'is_super_admin')::BOOLEAN IS TRUE);

CREATE POLICY "super_admin_delete" ON products FOR DELETE
  USING ((auth.jwt() ->> 'is_super_admin')::BOOLEAN IS TRUE);
