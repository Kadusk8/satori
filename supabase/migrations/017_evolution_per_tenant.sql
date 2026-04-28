-- ============================================================
-- Migration 014: Evolution API por tenant
-- - Habilita pgcrypto
-- - Adiciona evolution_api_url e evolution_api_key (criptografada)
-- - Renomeia whatsapp_instance_name → evolution_instance_name
-- - Cria função helper para descriptografia
-- ============================================================

CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA extensions;

-- Novos campos por tenant para conectar sua própria Evolution API
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS evolution_api_url  TEXT;
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS evolution_api_key  TEXT;
-- evolution_api_key armazena: encode(pgp_sym_encrypt(raw_key, enc_key), 'base64')
-- Leitura: pgp_sym_decrypt(decode(evolution_api_key, 'base64'), enc_key)

-- Renomear whatsapp_instance_name → evolution_instance_name (mais semântico)
ALTER TABLE tenants RENAME COLUMN whatsapp_instance_name TO evolution_instance_name;

COMMENT ON COLUMN tenants.evolution_api_url IS
  'URL base da Evolution API do tenant (ex: https://evo.seuservidor.com)';
COMMENT ON COLUMN tenants.evolution_api_key IS
  'API Key criptografada com pgp_sym_encrypt. Usar get_decrypted_evolution_key() para ler.';
COMMENT ON COLUMN tenants.evolution_instance_name IS
  'Nome da instância na Evolution API deste tenant (ex: tenant_minha_loja)';

-- ── Função helper para descriptografar evolution_api_key ─────
-- Só pode ser chamada com service role (edge functions).
-- Lê a chave de criptografia de current_setting('app.encryption_key').
CREATE OR REPLACE FUNCTION get_decrypted_evolution_key(p_tenant_id UUID)
RETURNS TEXT
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, extensions, pg_catalog
AS $$
  SELECT extensions.pgp_sym_decrypt(
    decode(evolution_api_key, 'base64'),
    current_setting('app.encryption_key')
  )::TEXT
  FROM tenants
  WHERE id = p_tenant_id
    AND evolution_api_key IS NOT NULL;
$$;

COMMENT ON FUNCTION get_decrypted_evolution_key IS
  'Descriptografa evolution_api_key do tenant. Usar apenas em edge functions com service role.';

-- Função helper para criptografar a API key (chamada pelo onboard-tenant)
-- Retorna base64 para armazenar como TEXT
CREATE OR REPLACE FUNCTION encrypt_evolution_key(p_raw_key TEXT)
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

COMMENT ON FUNCTION encrypt_evolution_key IS
  'Criptografa uma API key de Evolution. Retorna base64 para armazenar em evolution_api_key.';

-- Índice para lookups por instância (webhook-evolution)
CREATE INDEX IF NOT EXISTS idx_tenants_evolution_instance
  ON tenants (evolution_instance_name)
  WHERE evolution_instance_name IS NOT NULL;
