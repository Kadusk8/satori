-- ============================================================
-- Migration 012: functions e triggers de domínio
-- Triggers de negócio que dependem de todas as tabelas já criadas.
-- ============================================================

-- ─────────────────────────────────────────────────────────────
-- 1. Criar kanban stages padrão ao criar novo tenant
-- ─────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION create_default_kanban_stages()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  INSERT INTO kanban_stages (tenant_id, name, slug, color, position, is_default, is_closed, auto_assign)
  VALUES
    (NEW.id, 'Novo Lead',          'novo_lead',         '#6366f1', 0, true,  false, false),
    (NEW.id, 'IA Atendendo',       'ia_atendendo',      '#3b82f6', 1, false, false, true),
    (NEW.id, 'Aguardando Humano',  'aguardando_humano', '#f59e0b', 2, false, false, false),
    (NEW.id, 'Em Atendimento',     'em_atendimento',    '#10b981', 3, false, false, false),
    (NEW.id, 'Agendado',           'agendado',          '#8b5cf6', 4, false, false, false),
    (NEW.id, 'Finalizado',         'finalizado',        '#6b7280', 5, false, true,  false);
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_create_default_kanban_stages
  AFTER INSERT ON tenants
  FOR EACH ROW EXECUTE FUNCTION create_default_kanban_stages();

-- ─────────────────────────────────────────────────────────────
-- 2. Atribuir stage padrão ao criar nova conversa (sem stage)
-- ─────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION assign_default_kanban_stage()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_stage_id UUID;
BEGIN
  -- Só atribui se não veio com stage definido
  IF NEW.kanban_stage_id IS NULL THEN
    SELECT id INTO v_stage_id
      FROM kanban_stages
     WHERE tenant_id   = NEW.tenant_id
       AND is_default  = true
     LIMIT 1;

    IF v_stage_id IS NOT NULL THEN
      NEW.kanban_stage_id := v_stage_id;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_assign_default_kanban_stage
  BEFORE INSERT ON conversations
  FOR EACH ROW EXECUTE FUNCTION assign_default_kanban_stage();

-- ─────────────────────────────────────────────────────────────
-- 3. Ao escalar conversa (waiting_human), mover no kanban
-- ─────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION sync_conversation_status_to_kanban()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_stage_id UUID;
  v_slug     TEXT;
BEGIN
  -- Determina o slug do stage alvo conforme o novo status
  IF NEW.status = 'waiting_human' THEN
    v_slug := 'aguardando_humano';
  ELSIF NEW.status = 'human_handling' THEN
    v_slug := 'em_atendimento';
  ELSIF NEW.status = 'closed' THEN
    v_slug := 'finalizado';
  ELSIF NEW.status = 'ai_handling' THEN
    v_slug := 'ia_atendendo';
  ELSE
    RETURN NEW; -- nenhum mapeamento → não altera
  END IF;

  -- Só executa se o status realmente mudou
  IF OLD.status IS DISTINCT FROM NEW.status THEN
    SELECT id INTO v_stage_id
      FROM kanban_stages
     WHERE tenant_id = NEW.tenant_id
       AND slug      = v_slug
     LIMIT 1;

    IF v_stage_id IS NOT NULL THEN
      NEW.kanban_stage_id := v_stage_id;
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_sync_conversation_kanban
  BEFORE UPDATE OF status ON conversations
  FOR EACH ROW EXECUTE FUNCTION sync_conversation_status_to_kanban();

-- ─────────────────────────────────────────────────────────────
-- 4. Ao criar nova mensagem, atualizar last_message_at na conversa
-- ─────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION update_conversation_last_message_at()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  UPDATE conversations
     SET last_message_at = NEW.created_at
   WHERE id = NEW.conversation_id;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_update_conversation_last_message_at
  AFTER INSERT ON messages
  FOR EACH ROW EXECUTE FUNCTION update_conversation_last_message_at();

-- ─────────────────────────────────────────────────────────────
-- 5. Atualizar last_contact_at no contact ao receber mensagem
-- ─────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION update_contact_last_contact_at()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  UPDATE contacts
     SET last_contact_at = NEW.created_at
   WHERE id = NEW.contact_id;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_update_contact_last_contact_at
  AFTER INSERT ON messages
  FOR EACH ROW EXECUTE FUNCTION update_contact_last_contact_at();

-- ─────────────────────────────────────────────────────────────
-- 6. Incrementar messages_used_month no tenant ao inserir mensagem da IA
-- ─────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION increment_tenant_message_count()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  -- Conta apenas mensagens enviadas pela IA (não as do cliente)
  IF NEW.sender_type = 'ai' THEN
    UPDATE tenants
       SET messages_used_month = messages_used_month + 1
     WHERE id = NEW.tenant_id;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_increment_tenant_message_count
  AFTER INSERT ON messages
  FOR EACH ROW EXECUTE FUNCTION increment_tenant_message_count();

-- ─────────────────────────────────────────────────────────────
-- 7. Incrementar métricas do ai_agent ao fechar conversa
-- ─────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION update_ai_agent_metrics()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  -- Quando status muda para 'closed' ou 'waiting_human'
  IF OLD.status IS DISTINCT FROM NEW.status THEN
    IF NEW.ai_agent_id IS NOT NULL THEN
      IF NEW.status = 'closed' THEN
        UPDATE ai_agents
           SET total_conversations = total_conversations + 1
         WHERE id = NEW.ai_agent_id;
      ELSIF NEW.status = 'waiting_human' THEN
        UPDATE ai_agents
           SET total_escalations = total_escalations + 1
         WHERE id = NEW.ai_agent_id;
      END IF;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_update_ai_agent_metrics
  AFTER UPDATE OF status ON conversations
  FOR EACH ROW EXECUTE FUNCTION update_ai_agent_metrics();

-- ─────────────────────────────────────────────────────────────
-- 8. Função utilitária: busca de produtos por full-text search
--    Usada pelas edge functions (tool: search_products)
-- ─────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION search_products(
  p_tenant_id  UUID,
  p_query      TEXT,
  p_category   TEXT    DEFAULT NULL,
  p_price_max  NUMERIC DEFAULT NULL,
  p_limit      INTEGER DEFAULT 5
)
RETURNS TABLE (
  id                UUID,
  name              TEXT,
  short_description TEXT,
  price             NUMERIC,
  price_display     TEXT,
  category          TEXT,
  images            JSONB,
  rank              REAL
) LANGUAGE sql STABLE SECURITY DEFINER AS $$
  SELECT
    p.id,
    p.name,
    p.short_description,
    p.price,
    p.price_display,
    p.category,
    p.images,
    ts_rank(p.search_vector, plainto_tsquery('portuguese', p_query)) AS rank
  FROM products p
  WHERE p.tenant_id    = p_tenant_id
    AND p.is_available = true
    AND p.search_vector @@ plainto_tsquery('portuguese', p_query)
    AND (p_category  IS NULL OR p.category = p_category)
    AND (p_price_max IS NULL OR p.price <= p_price_max)
  ORDER BY rank DESC, p.is_featured DESC
  LIMIT p_limit;
$$;

-- ─────────────────────────────────────────────────────────────
-- 9. Função utilitária: verificar slots disponíveis para agendamento
--    Usada pelas edge functions (tool: check_availability)
-- ─────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION check_appointment_availability(
  p_tenant_id UUID,
  p_date      DATE
)
RETURNS TABLE (
  slot_start TIME,
  slot_end   TIME,
  is_available BOOLEAN
) LANGUAGE plpgsql STABLE SECURITY DEFINER AS $$
DECLARE
  v_duration INTEGER;
  v_interval INTEGER;
  v_day_start TIME := '08:00';
  v_day_end   TIME := '18:00';
  v_slot_start TIME;
  v_slot_end   TIME;
BEGIN
  -- Busca configurações do tenant
  SELECT appointment_duration_minutes, appointment_slot_interval_minutes
    INTO v_duration, v_interval
    FROM tenants
   WHERE id = p_tenant_id;

  v_slot_start := v_day_start;

  WHILE v_slot_start < v_day_end LOOP
    v_slot_end := v_slot_start + (v_duration || ' minutes')::INTERVAL;

    IF v_slot_end > v_day_end THEN
      EXIT;
    END IF;

    RETURN QUERY
    SELECT
      v_slot_start,
      v_slot_end,
      NOT EXISTS (
        SELECT 1 FROM appointments a
         WHERE a.tenant_id   = p_tenant_id
           AND a.date        = p_date
           AND a.status NOT IN ('cancelled')
           AND a.start_time  < v_slot_end
           AND a.end_time    > v_slot_start
      ) AS is_available;

    v_slot_start := v_slot_start + (v_interval || ' minutes')::INTERVAL;
  END LOOP;
END;
$$;

-- ─────────────────────────────────────────────────────────────
-- 10. Reset mensal do contador messages_used_month (chamado via pg_cron)
-- ─────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION reset_monthly_message_counts()
RETURNS VOID LANGUAGE sql SECURITY DEFINER AS $$
  UPDATE tenants SET messages_used_month = 0 WHERE active = true;
$$;

COMMENT ON FUNCTION reset_monthly_message_counts() IS
  'Chamada mensalmente via pg_cron: SELECT cron.schedule(''0 0 1 * *'', ''SELECT reset_monthly_message_counts()'');';
