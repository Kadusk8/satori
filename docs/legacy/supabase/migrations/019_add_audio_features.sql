-- Migração 019: Adiciona suporte a áudio bidirecional (ElevenLabs TTS + Whisper STT)
-- voice_id e audio_response_enabled por agente, elevenlabs_api_key por tenant

ALTER TABLE ai_agents
  ADD COLUMN IF NOT EXISTS voice_id TEXT DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS audio_response_enabled BOOLEAN DEFAULT false;

COMMENT ON COLUMN ai_agents.voice_id IS 'Voice ID do ElevenLabs. NULL = responde em texto.';
COMMENT ON COLUMN ai_agents.audio_response_enabled IS 'Se true, IA responde em áudio via ElevenLabs TTS em vez de texto.';

ALTER TABLE tenants
  ADD COLUMN IF NOT EXISTS elevenlabs_api_key TEXT DEFAULT NULL;

COMMENT ON COLUMN tenants.elevenlabs_api_key IS 'API key do ElevenLabs para TTS. Necessária para áudio_response_enabled = true nos agentes do tenant.';
