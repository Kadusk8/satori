-- ============================================================
-- Migration 018: Adiciona colunas de API keys para LLM (BYOK)
-- Suporta Claude (Anthropic), OpenAI (GPT) e Gemini
-- ============================================================

ALTER TABLE tenants
  ADD COLUMN IF NOT EXISTS openai_api_key TEXT,
  ADD COLUMN IF NOT EXISTS gemini_api_key TEXT,
  ADD COLUMN IF NOT EXISTS anthropic_api_key TEXT;

COMMENT ON COLUMN tenants.openai_api_key IS 'API key da OpenAI (sk-...) — BYOK do tenant para usar GPT';
COMMENT ON COLUMN tenants.gemini_api_key IS 'API key do Google Generative AI (AI...) — BYOK do tenant para usar Gemini';
COMMENT ON COLUMN tenants.anthropic_api_key IS 'API key da Anthropic (sk-ant-...) — BYOK do tenant para usar Claude. Se vazio, usa ANTHROPIC_API_KEY env var como fallback.';
