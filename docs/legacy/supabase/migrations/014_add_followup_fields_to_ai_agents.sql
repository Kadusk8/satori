-- ============================================================
-- Migration 014: adiciona campos de follow-up na tabela ai_agents
-- ============================================================

ALTER TABLE ai_agents
  ADD COLUMN IF NOT EXISTS follow_up_enabled BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS follow_up_delay_hours INTEGER NOT NULL DEFAULT 24,
  ADD COLUMN IF NOT EXISTS follow_up_max_attempts INTEGER NOT NULL DEFAULT 3,
  ADD COLUMN IF NOT EXISTS follow_up_message_template TEXT;

COMMENT ON COLUMN ai_agents.follow_up_enabled IS 'Habilita envio automático de follow-up quando a conversa fica inativa';
COMMENT ON COLUMN ai_agents.follow_up_delay_hours IS 'Horas de espera antes de enviar o primeiro follow-up';
COMMENT ON COLUMN ai_agents.follow_up_max_attempts IS 'Número máximo de tentativas de follow-up antes de desistir';
COMMENT ON COLUMN ai_agents.follow_up_message_template IS 'Template opcional para a mensagem de follow-up. Se NULL, a IA gera uma mensagem personalizada.';
