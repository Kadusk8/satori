-- ============================================================
-- Migration 025: corrige conflito do claim 'role' com PostgREST
-- O PostgREST usa o claim 'role' no JWT para trocar o database role.
-- Quando o hook injetava role='owner', PostgREST tentava SET ROLE owner
-- e falhava com "role owner does not exist".
-- Solução: renomear o claim de aplicação para 'user_role'.
-- ============================================================

-- 1. Atualiza o custom access token hook
CREATE OR REPLACE FUNCTION public.custom_access_token_hook(event JSONB)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id   UUID;
  v_tenant_id UUID;
  v_role      TEXT;
  v_is_super  BOOLEAN;
  claims      JSONB;
BEGIN
  v_user_id := (event ->> 'user_id')::UUID;
  claims    := event -> 'claims';

  -- Verifica se é super_admin
  SELECT EXISTS(
    SELECT 1 FROM public.super_admins WHERE id = v_user_id AND active = true
  ) INTO v_is_super;

  IF v_is_super THEN
    claims := jsonb_set(claims, '{is_super_admin}', 'true'::jsonb);
  ELSE
    -- Busca tenant_id e role do usuário operador/owner
    SELECT tenant_id, role
      INTO v_tenant_id, v_role
      FROM public.users
     WHERE id = v_user_id AND active = true
     LIMIT 1;

    IF v_tenant_id IS NOT NULL THEN
      claims := jsonb_set(claims, '{tenant_id}', to_jsonb(v_tenant_id::TEXT));
      -- IMPORTANTE: usar 'user_role' e NÃO 'role'.
      -- O PostgREST interpreta o claim 'role' como database role e tenta SET ROLE.
      claims := jsonb_set(claims, '{user_role}', to_jsonb(v_role));
    END IF;
  END IF;

  RETURN jsonb_set(event, '{claims}', claims);
END;
$$;

-- 2. Atualiza políticas RLS que checavam auth.jwt() ->> 'role'

-- users
DROP POLICY IF EXISTS "owner_admin_manage" ON users;
CREATE POLICY "owner_admin_manage"
  ON users FOR ALL
  USING (
    tenant_id = (auth.jwt() ->> 'tenant_id')::UUID
    AND (auth.jwt() ->> 'user_role')::TEXT IN ('owner','admin')
  );

-- ai_agents (verifica se existe antes de recriar)
DO $$
BEGIN
  DROP POLICY IF EXISTS "owner_admin_manage" ON ai_agents;
  CREATE POLICY "owner_admin_manage"
    ON ai_agents FOR ALL
    USING (
      tenant_id = (auth.jwt() ->> 'tenant_id')::UUID
      AND (auth.jwt() ->> 'user_role')::TEXT IN ('owner','admin')
    );
EXCEPTION WHEN undefined_table THEN NULL;
END$$;

-- products (3 políticas separadas)
DROP POLICY IF EXISTS "owner_admin_write"  ON products;
DROP POLICY IF EXISTS "owner_admin_insert" ON products;
DROP POLICY IF EXISTS "owner_admin_update" ON products;
DROP POLICY IF EXISTS "owner_admin_delete" ON products;

DO $$
DECLARE
  pol RECORD;
BEGIN
  -- Remove qualquer política de escrita owner/admin que exista
  FOR pol IN
    SELECT policyname FROM pg_policies
    WHERE tablename = 'products'
      AND policyname ILIKE '%owner%admin%'
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON products', pol.policyname);
  END LOOP;

  CREATE POLICY "owner_admin_insert"
    ON products FOR INSERT
    WITH CHECK (
      tenant_id = (auth.jwt() ->> 'tenant_id')::UUID
      AND (auth.jwt() ->> 'user_role')::TEXT IN ('owner','admin')
    );

  CREATE POLICY "owner_admin_update"
    ON products FOR UPDATE
    USING (
      tenant_id = (auth.jwt() ->> 'tenant_id')::UUID
      AND (auth.jwt() ->> 'user_role')::TEXT IN ('owner','admin')
    );

  CREATE POLICY "owner_admin_delete"
    ON products FOR DELETE
    USING (
      tenant_id = (auth.jwt() ->> 'tenant_id')::UUID
      AND (auth.jwt() ->> 'user_role')::TEXT IN ('owner','admin')
    );
EXCEPTION WHEN undefined_table THEN NULL;
END$$;
