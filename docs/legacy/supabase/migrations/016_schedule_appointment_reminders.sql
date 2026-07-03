-- ============================================================
-- Migration 016: pg_cron job para lembretes de agendamento
-- Dispara a cada 15 minutos e chama a edge function schedule-reminder
-- ============================================================

-- Garante que a extensão pg_net está disponível (necessária para http_post)
CREATE EXTENSION IF NOT EXISTS pg_net;

-- Remove job anterior se existir (idempotente)
SELECT cron.unschedule('send-appointment-reminders') WHERE EXISTS (
  SELECT 1 FROM cron.job WHERE jobname = 'send-appointment-reminders'
);

-- Agenda chamada à edge function a cada 15 minutos
SELECT cron.schedule(
  'send-appointment-reminders',
  '*/15 * * * *',
  $$
  SELECT net.http_post(
    url := current_setting('app.supabase_functions_url') || '/schedule-reminder',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || current_setting('app.service_role_key')
    ),
    body := '{}'::jsonb
  );
  $$
);
