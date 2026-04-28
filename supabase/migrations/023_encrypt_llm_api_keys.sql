-- ============================================================
-- Migration 023: criptografar LLM API keys na tabela tenants
-- Aplica o mesmo padrão pgp_sym_encrypt já usado pela evolution_api_key.
-- ============================================================

-- ── Funções helper ──────────────────────────────────────────

-- Retorna todas as LLM keys descriptografadas como JSONB.
-- Chamada pelas edge functions via supabase.rpc('get_tenant_llm_keys', {...}).
-- Só acessível com service_role (edge functions).
CREATE OR REPLACE FUNCTION public.get_tenant_llm_keys(p_tenant_id UUID)
RETURNS JSONB
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, extensions, pg_catalog
AS $$
  SELECT jsonb_build_object(
    'anthropic_api_key',
      CASE WHEN anthropic_api_key IS NOT NULL
        THEN extensions.pgp_sym_decrypt(
          decode(anthropic_api_key, 'base64'),
          current_setting('app.encryption_key')
        )::TEXT
        ELSE NULL END,
    'openai_api_key',
      CASE WHEN openai_api_key IS NOT NULL
        THEN extensions.pgp_sym_decrypt(
          decode(openai_api_key, 'base64'),
          current_setting('app.encryption_key')
        )::TEXT
        ELSE NULL END,
    'gemini_api_key',
      CASE WHEN gemini_api_key IS NOT NULL
        THEN extensions.pgp_sym_decrypt(
          decode(gemini_api_key, 'base64'),
          current_setting('app.encryption_key')
        )::TEXT
        ELSE NULL END,
    'elevenlabs_api_key',
      CASE WHEN elevenlabs_api_key IS NOT NULL
        THEN extensions.pgp_sym_decrypt(
          decode(elevenlabs_api_key, 'base64'),
          current_setting('app.encryption_key')
        )::TEXT
        ELSE NULL END
  )
  FROM public.tenants
  WHERE id = p_tenant_id;
$$;

-- Criptografa uma LLM key antes de persistir no banco.
-- Usar: UPDATE tenants SET openai_api_key = encrypt_llm_key('sk-...') WHERE id = ...
CREATE OR REPLACE FUNCTION public.encrypt_llm_key(p_raw_key TEXT)
RETURNS TEXT
LANGUAGE sql
SECURITY DEFINER
SET search_path = public, extensions, pg_catalog
AS $$
  SELECT encode(
    extensions.pgp_sym_encrypt(p_raw_key, current_setting('app.encryption_key')),
    'base64'
  );
$$;

GRANT EXECUTE ON FUNCTION public.get_tenant_llm_keys TO service_role;
GRANT EXECUTE ON FUNCTION public.encrypt_llm_key TO service_role;
REVOKE EXECUTE ON FUNCTION public.get_tenant_llm_keys FROM authenticated, anon, public;
REVOKE EXECUTE ON FUNCTION public.encrypt_llm_key FROM authenticated, anon, public;

COMMENT ON FUNCTION public.get_tenant_llm_keys IS
  'Descriptografa as LLM API keys do tenant. Usar apenas em edge functions com service_role.';
COMMENT ON FUNCTION public.encrypt_llm_key IS
  'Criptografa uma LLM API key antes de salvar na tabela tenants.';

-- ── Criptografar valores existentes em texto plano ─────────
-- Só roda se app.encryption_key estiver configurado no banco.
-- Se não estiver, emite aviso — rodar manualmente depois de configurar a chave.
DO $$
DECLARE
  v_enc_key TEXT;
BEGIN
  -- missing_ok = true: retorna NULL em vez de erro se a setting não existir
  v_enc_key := current_setting('app.encryption_key', true);

  IF v_enc_key IS NULL OR v_enc_key = '' THEN
    RAISE WARNING
      'app.encryption_key não configurado — LLM keys NÃO foram criptografadas. '
      'Configure a chave no Supabase Dashboard (Database → Settings → Custom) e '
      'execute manualmente: SELECT encrypt_llm_key(openai_api_key) ... FROM tenants';
    RETURN;
  END IF;

  UPDATE public.tenants
  SET
    openai_api_key = CASE
      WHEN openai_api_key IS NOT NULL AND openai_api_key NOT LIKE 'hQ%'
        THEN encode(
          extensions.pgp_sym_encrypt(openai_api_key, v_enc_key),
          'base64'
        )
      ELSE openai_api_key
    END,
    anthropic_api_key = CASE
      WHEN anthropic_api_key IS NOT NULL AND anthropic_api_key NOT LIKE 'hQ%'
        THEN encode(
          extensions.pgp_sym_encrypt(anthropic_api_key, v_enc_key),
          'base64'
        )
      ELSE anthropic_api_key
    END,
    gemini_api_key = CASE
      WHEN gemini_api_key IS NOT NULL AND gemini_api_key NOT LIKE 'hQ%'
        THEN encode(
          extensions.pgp_sym_encrypt(gemini_api_key, v_enc_key),
          'base64'
        )
      ELSE gemini_api_key
    END,
    elevenlabs_api_key = CASE
      WHEN elevenlabs_api_key IS NOT NULL AND elevenlabs_api_key NOT LIKE 'hQ%'
        THEN encode(
          extensions.pgp_sym_encrypt(elevenlabs_api_key, v_enc_key),
          'base64'
        )
      ELSE elevenlabs_api_key
    END
  WHERE
    openai_api_key IS NOT NULL
    OR anthropic_api_key IS NOT NULL
    OR gemini_api_key IS NOT NULL
    OR elevenlabs_api_key IS NOT NULL;

  RAISE NOTICE 'LLM API keys criptografadas com sucesso.';
END;
$$;
