-- Tutoriais em vídeo (Central de treinamento do Satori) — 2026-11-19.
-- Conteúdo GLOBAL da plataforma (não pertence a nenhum tenant): o super admin cadastra/edita em
-- /admin/tutoriais; empresas e vendedores assistem em /tutoriais. Idempotente.
--
--   psql "$DATABASE_URL" -f db/migrations/2026-11-19-tutoriais.sql

BEGIN;

CREATE TABLE IF NOT EXISTS tutorial_videos (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slug             TEXT NOT NULL UNIQUE,
  title            TEXT NOT NULL,
  description      TEXT,
  category         TEXT NOT NULL DEFAULT 'Geral',
  -- 'all' = todo usuário do painel; 'manager' = só owner/admin (telas que o vendedor não acessa)
  audience         TEXT NOT NULL DEFAULT 'all' CHECK (audience IN ('all', 'manager')),
  video_url        TEXT,            -- NULL = "em breve" (vaga criada, vídeo ainda não enviado)
  poster_url       TEXT,
  duration_seconds INTEGER,
  position         INTEGER NOT NULL DEFAULT 0,
  published        BOOLEAN NOT NULL DEFAULT true,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_tutorial_videos_position ON tutorial_videos (position);

-- Quem já assistiu o quê (por usuário do painel)
CREATE TABLE IF NOT EXISTS tutorial_progress (
  user_id    UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  video_id   UUID NOT NULL REFERENCES tutorial_videos(id) ON DELETE CASCADE,
  watched_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, video_id)
);

ALTER TABLE tutorial_videos   ENABLE ROW LEVEL SECURITY;
ALTER TABLE tutorial_progress ENABLE ROW LEVEL SECURITY;

-- Qualquer usuário logado lê os vídeos publicados; só o super admin enxerga/edita rascunhos.
DROP POLICY IF EXISTS "read_published" ON tutorial_videos;
CREATE POLICY "read_published" ON tutorial_videos
  FOR SELECT USING (published = true);

DROP POLICY IF EXISTS "super_admin_full_access" ON tutorial_videos;
CREATE POLICY "super_admin_full_access" ON tutorial_videos
  FOR ALL USING ((auth.jwt() ->> 'is_super_admin')::BOOLEAN IS TRUE);

DROP POLICY IF EXISTS "service_role_full_access" ON tutorial_videos;
CREATE POLICY "service_role_full_access" ON tutorial_videos
  FOR ALL USING (auth.role() = 'service_role');

-- Progresso: cada usuário só vê/grava o próprio.
DROP POLICY IF EXISTS "own_progress" ON tutorial_progress;
CREATE POLICY "own_progress" ON tutorial_progress
  FOR ALL USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "service_role_full_access" ON tutorial_progress;
CREATE POLICY "service_role_full_access" ON tutorial_progress
  FOR ALL USING (auth.role() = 'service_role');

GRANT SELECT ON tutorial_videos TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON tutorial_progress TO authenticated;
GRANT ALL ON tutorial_videos, tutorial_progress TO service_role;

-- Vagas já cadastradas (sem vídeo: aparecem como "Em breve" até o super admin anexar o arquivo).
INSERT INTO tutorial_videos (slug, title, description, category, audience, position) VALUES
  ('dashboard',           'Dashboard',                                   'Os números do dia, o status do sistema e o uso do seu plano.',                          'Visão geral e atendimento', 'all',     0),
  ('crm-kanban',          'CRM e Kanban',                                'Acompanhe cada conversa no quadro, entenda as colunas e monte o seu funil.',            'Visão geral e atendimento', 'all',     1),
  ('conversas-chat',      'Conversas no chat',                           'Abra uma conversa, leia o histórico e o resumo que a IA faz do cliente.',               'Visão geral e atendimento', 'all',     2),
  ('assumir-devolver-ia', 'Assumir a conversa e devolver para a IA',     'Entre na conversa quando precisar, responda o cliente e devolva o atendimento à IA.',    'Visão geral e atendimento', 'all',     3),
  ('contatos',            'Contatos',                                    'Busque clientes, filtre por etiqueta e faixa e abra a ficha com o histórico.',          'Visão geral e atendimento', 'all',     4),
  ('produtos',            'Produtos',                                    'Cadastre e organize o catálogo que a IA usa para atender.',                             'Catálogo e agenda',         'all',     5),
  ('agenda',              'Agenda',                                      'Veja a semana, o dia ou a lista e marque horários com os clientes.',                    'Catálogo e agenda',         'all',     6),
  ('testar-ia',           'Testar a IA',                                 'Converse com o seu agente como se fosse um cliente e peça ajustes nas respostas.',      'Inteligência artificial',   'manager', 7),
  ('equipe',              'Equipe',                                      'Convide vendedores e gerencie quem tem acesso ao painel.',                              'Gestão da empresa',         'manager', 8),
  ('configuracoes',       'Configurações e categorias',                  'Os ajustes da empresa e como organizar as categorias do catálogo.',                     'Gestão da empresa',         'manager', 9),
  ('pontuacao',           'Pontuação de clientes',                       'Defina como o cliente ganha pontos e as faixas Bronze, Prata, Ouro e Diamante.',        'Gestão da empresa',         'manager', 10)
ON CONFLICT (slug) DO NOTHING;

COMMIT;
