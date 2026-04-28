-- ============================================================
-- Migration 024: funções de criptografia aceitam chave via parâmetro
-- Permite passar ENCRYPTION_KEY via env var das edge functions,
-- sem depender de current_setting('app.encryption_key') no banco.
-- Backward-compatible: se p_enc_key for NULL, tenta current_setting;
-- se ainda NULL, retorna o valor direto (texto plano).
-- ============================================================

-- ── get_decrypted_evolution_key ──────────────────────────────

CREATE OR REPLACE FUNCTION public.get_decrypted_evolution_key(
  p_tenant_id UUID,
  p_enc_key   TEXT DEFAULT NULL
)
RETURNS TEXT
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, extensions, pg_catalog
AS $$
DECLARE
  v_key       TEXT;
  v_encrypted TEXT;
BEGIN
  v_key := COALESCE(p_enc_key, current_setting('app.encryption_key', true));

  SELECT evolution_api_key INTO v_encrypted
  FROM public.tenants
  WHERE id = p_tenant_id AND evolution_api_key IS NOT NULL;

  IF v_encrypted IS NULL THEN
    RETURN NULL;
  END IF;

  -- Sem chave de criptografia: retorna valor direto (texto plano)
  IF v_key IS NULL OR v_key = '' THEN
    RETURN v_encrypted;
  END IF;

  BEGIN
    RETURN extensions.pgp_sym_decrypt(decode(v_encrypted, 'base64'), v_key)::TEXT;
  EXCEPTION WHEN OTHERS THEN
    -- Valor ainda em texto plano (não foi criptografado)
    RETURN v_encrypted;
  END;
END;
$$;

-- ── encrypt_evolution_key ────────────────────────────────────

CREATE OR REPLACE FUNCTION public.encrypt_evolution_key(
  p_raw_key TEXT,
  p_enc_key TEXT DEFAULT NULL
)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions, pg_catalog
AS $$
DECLARE
  v_key TEXT;
BEGIN
  v_key := COALESCE(p_enc_key, current_setting('app.encryption_key', true));
  IF v_key IS NULL OR v_key = '' THEN
    RETURN p_raw_key;
  END IF;
  RETURN encode(extensions.pgp_sym_encrypt(p_raw_key, v_key), 'base64');
END;
$$;

-- ── get_tenant_llm_keys ──────────────────────────────────────

CREATE OR REPLACE FUNCTION public.get_tenant_llm_keys(
  p_tenant_id UUID,
  p_enc_key   TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, extensions, pg_catalog
AS $$
DECLARE
  v_key        TEXT;
  v_anthropic  TEXT;
  v_openai     TEXT;
  v_gemini     TEXT;
  v_elevenlabs TEXT;
BEGIN
  v_key := COALESCE(p_enc_key, current_setting('app.encryption_key', true));

  SELECT anthropic_api_key, openai_api_key, gemini_api_key, elevenlabs_api_key
  INTO v_anthropic, v_openai, v_gemini, v_elevenlabs
  FROM public.tenants
  WHERE id = p_tenant_id;

  IF v_key IS NOT NULL AND v_key != '' THEN
    IF v_anthropic IS NOT NULL THEN
      BEGIN
        v_anthropic := extensions.pgp_sym_decrypt(decode(v_anthropic, 'base64'), v_key)::TEXT;
      EXCEPTION WHEN OTHERS THEN
        NULL; -- mantém valor original (texto plano)
      END;
    END IF;
    IF v_openai IS NOT NULL THEN
      BEGIN
        v_openai := extensions.pgp_sym_decrypt(decode(v_openai, 'base64'), v_key)::TEXT;
      EXCEPTION WHEN OTHERS THEN
        NULL;
      END;
    END IF;
    IF v_gemini IS NOT NULL THEN
      BEGIN
        v_gemini := extensions.pgp_sym_decrypt(decode(v_gemini, 'base64'), v_key)::TEXT;
      EXCEPTION WHEN OTHERS THEN
        NULL;
      END;
    END IF;
    IF v_elevenlabs IS NOT NULL THEN
      BEGIN
        v_elevenlabs := extensions.pgp_sym_decrypt(decode(v_elevenlabs, 'base64'), v_key)::TEXT;
      EXCEPTION WHEN OTHERS THEN
        NULL;
      END;
    END IF;
  END IF;

  RETURN jsonb_build_object(
    'anthropic_api_key',  v_anthropic,
    'openai_api_key',     v_openai,
    'gemini_api_key',     v_gemini,
    'elevenlabs_api_key', v_elevenlabs
  );
END;
$$;

-- ── encrypt_llm_key ──────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.encrypt_llm_key(
  p_raw_key TEXT,
  p_enc_key TEXT DEFAULT NULL
)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions, pg_catalog
AS $$
DECLARE
  v_key TEXT;
BEGIN
  v_key := COALESCE(p_enc_key, current_setting('app.encryption_key', true));
  IF v_key IS NULL OR v_key = '' THEN
    RETURN p_raw_key;
  END IF;
  RETURN encode(extensions.pgp_sym_encrypt(p_raw_key, v_key), 'base64');
END;
$$;

-- ── Permissões (mantém as mesmas) ────────────────────────────

GRANT EXECUTE ON FUNCTION public.get_decrypted_evolution_key(UUID, TEXT) TO service_role;
GRANT EXECUTE ON FUNCTION public.encrypt_evolution_key(TEXT, TEXT) TO service_role;
GRANT EXECUTE ON FUNCTION public.get_tenant_llm_keys(UUID, TEXT) TO service_role;
GRANT EXECUTE ON FUNCTION public.encrypt_llm_key(TEXT, TEXT) TO service_role;

REVOKE EXECUTE ON FUNCTION public.get_decrypted_evolution_key(UUID, TEXT) FROM authenticated, anon, public;
REVOKE EXECUTE ON FUNCTION public.encrypt_evolution_key(TEXT, TEXT) FROM authenticated, anon, public;
REVOKE EXECUTE ON FUNCTION public.get_tenant_llm_keys(UUID, TEXT) FROM authenticated, anon, public;
REVOKE EXECUTE ON FUNCTION public.encrypt_llm_key(TEXT, TEXT) FROM authenticated, anon, public;
