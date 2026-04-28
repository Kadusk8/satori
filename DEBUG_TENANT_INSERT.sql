-- ============================================================
-- Debug: Tentar insert na tabela tenants e ver erro exato
-- ============================================================

-- 1. Verificar que as 3 colunas LLM existem
SELECT column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_name = 'tenants'
  AND column_name IN ('openai_api_key', 'gemini_api_key', 'anthropic_api_key')
ORDER BY column_name;

-- Se retornar vazio, rode isto:
-- ALTER TABLE tenants ADD COLUMN openai_api_key TEXT, ADD COLUMN gemini_api_key TEXT, ADD COLUMN anthropic_api_key TEXT;

-- 2. Tentar insert de teste
INSERT INTO tenants (
  name,
  slug,
  business_segment,
  owner_email,
  plan,
  status,
  business_hours,
  timezone,
  appointment_duration_minutes,
  openai_api_key,
  gemini_api_key,
  anthropic_api_key
) VALUES (
  'Debug Tenant',
  'debug-tenant-' || to_char(now(), 'HH24MISS'),
  'servicos',
  'debug@test.com',
  'starter',
  'onboarding',
  '{"mon": {"enabled": true, "start": "08:00", "end": "18:00"}}'::jsonb,
  'America/Sao_Paulo',
  30,
  NULL,
  NULL,
  NULL
)
RETURNING id, name, slug, created_at;

-- Se der erro, veja a mensagem e compartilhe
