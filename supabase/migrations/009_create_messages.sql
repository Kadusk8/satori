-- ============================================================
-- Migration 009: messages (mensagens de cada conversa)
-- ============================================================

CREATE TABLE IF NOT EXISTS messages (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       UUID NOT NULL REFERENCES tenants(id)       ON DELETE CASCADE,
  conversation_id UUID NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  contact_id      UUID NOT NULL REFERENCES contacts(id),

  sender_type TEXT NOT NULL
    CHECK (sender_type IN ('customer','ai','human','system')),
  sender_id   UUID,          -- users.id se human; NULL se ai/customer/system

  content      TEXT,
  content_type TEXT NOT NULL DEFAULT 'text'
    CHECK (content_type IN ('text','image','audio','video','document','location','product_card')),

  media_url        TEXT,
  media_mime_type  TEXT,
  whatsapp_message_id TEXT,  -- ID da msg no WhatsApp (tracking/dedup)

  -- Metadados da IA
  ai_tool_calls   JSONB,            -- Tools chamadas nesta resposta
  ai_confidence   NUMERIC(3,2)
    CHECK (ai_confidence IS NULL OR (ai_confidence >= 0 AND ai_confidence <= 1)),

  is_read    BOOLEAN     NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE messages IS 'Todas as mensagens trocadas em cada conversa.';
COMMENT ON COLUMN messages.sender_type IS 'customer=WhatsApp | ai=agente IA | human=operador | system=automação';
COMMENT ON COLUMN messages.whatsapp_message_id IS 'ID retornado pela Evolution API. Usado para evitar duplicatas.';
COMMENT ON COLUMN messages.ai_tool_calls IS 'Array de tool_use blocks do Claude (para auditoria e replay).';

-- ── Indexes ────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_messages_conversation_id      ON messages (conversation_id, created_at);
CREATE INDEX IF NOT EXISTS idx_messages_tenant_id            ON messages (tenant_id);
CREATE INDEX IF NOT EXISTS idx_messages_contact_id           ON messages (contact_id);
CREATE INDEX IF NOT EXISTS idx_messages_whatsapp_message_id ON messages (whatsapp_message_id)
  WHERE whatsapp_message_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_messages_is_read              ON messages (conversation_id, is_read)
  WHERE is_read = false;

-- ── RLS ────────────────────────────────────────────────────
ALTER TABLE messages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "tenant_isolation"
  ON messages FOR ALL
  USING (tenant_id = (auth.jwt() ->> 'tenant_id')::UUID);

CREATE POLICY "super_admin_full_access"
  ON messages FOR ALL
  USING ((auth.jwt() ->> 'is_super_admin')::BOOLEAN IS TRUE);

CREATE POLICY "service_role_full_access"
  ON messages FOR ALL
  USING (auth.role() = 'service_role');
