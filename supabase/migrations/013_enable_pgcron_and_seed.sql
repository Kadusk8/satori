-- ============================================================
-- Migration 013: seed super_admin + pg_cron
-- Habilita pg_cron e agenda o reset mensal de mensagens.
-- O registro do super_admin é inserido após criação do usuário
-- no Supabase Auth (via script de seed separado ou manualmente).
-- ============================================================

-- Habilitar extensão pg_cron (disponível no Supabase)
CREATE EXTENSION IF NOT EXISTS pg_cron;

-- Agendar reset mensal do contador de mensagens (todo dia 1 às 00:00 UTC)
SELECT cron.schedule(
  'reset-monthly-message-counts',
  '0 0 1 * *',
  'SELECT reset_monthly_message_counts()'
);

-- ──────────────────────────────────────────────────────────
-- Comentário: para criar o super_admin após criar o usuário
-- no Supabase Auth, execute:
--
-- INSERT INTO super_admins (id, full_name, email)
-- VALUES (
--   '<UUID-do-auth.users>',
--   'Nome do Super Admin',
--   'email@exemplo.com'
-- );
--
-- O custom claim 'is_super_admin' deve ser adicionado via
-- Supabase Auth Hook (ou manualmente via SQL):
--
-- UPDATE auth.users
--    SET raw_app_meta_data = raw_app_meta_data || '{"is_super_admin": true}'
--  WHERE id = '<UUID>';
-- ──────────────────────────────────────────────────────────
