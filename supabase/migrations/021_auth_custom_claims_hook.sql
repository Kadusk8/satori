-- ============================================================
-- Migration 021: Auth Custom Claims Hook
-- Injeta tenant_id, role e is_super_admin no JWT a cada login.
-- Sem esse hook as RLS policies que dependem de auth.jwt() não funcionam.
-- ============================================================

-- Função chamada pelo Supabase Auth a cada geração de JWT
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
      claims := jsonb_set(claims, '{role}',      to_jsonb(v_role));
    END IF;
  END IF;

  RETURN jsonb_set(event, '{claims}', claims);
END;
$$;

-- Permite que o Supabase Auth chame a função
GRANT EXECUTE ON FUNCTION public.custom_access_token_hook TO supabase_auth_admin;
REVOKE EXECUTE ON FUNCTION public.custom_access_token_hook FROM authenticated, anon, public;

COMMENT ON FUNCTION public.custom_access_token_hook IS
  'Hook do Supabase Auth: injeta tenant_id, role e is_super_admin nos claims do JWT.
   Configurar no Dashboard: Authentication → Hooks → Custom Access Token Hook.
   Ou no config.toml local: [auth.hook.custom_access_token].';
