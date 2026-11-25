-- Preferências de notificação push por usuário (Configurações → Notificações).
-- Aditiva e idempotente: valores padrão mantêm o comportamento atual pra todo mundo.
--
-- Gravação: server action que altera APENAS estas colunas na linha do próprio
-- usuário logado (apps/web/lib/actions/notification-preferences.ts), via
-- withClaims + policy operator_self_update — mesmo caminho de is_available.

ALTER TABLE users ADD COLUMN IF NOT EXISTS push_only_assigned BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE users ADD COLUMN IF NOT EXISTS push_quiet_start   TIME;
ALTER TABLE users ADD COLUMN IF NOT EXISTS push_quiet_end     TIME;

COMMENT ON COLUMN users.push_only_assigned IS 'Push só de conversas atribuídas a este usuário.';
COMMENT ON COLUMN users.push_quiet_start   IS 'Início do horário silencioso (fuso do tenant). NULL = sem horário silencioso.';
COMMENT ON COLUMN users.push_quiet_end     IS 'Fim do horário silencioso (fuso do tenant). Pode ser menor que o início (atravessa a meia-noite).';

-- Os dois horários juntos ou nenhum, e diferentes entre si.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'users_push_quiet_hours_check') THEN
    ALTER TABLE users ADD CONSTRAINT users_push_quiet_hours_check CHECK (
      (push_quiet_start IS NULL AND push_quiet_end IS NULL)
      OR (push_quiet_start IS NOT NULL AND push_quiet_end IS NOT NULL AND push_quiet_start <> push_quiet_end)
    );
  END IF;
END $$;
