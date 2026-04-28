-- ============================================================
-- Migration 010: products (catálogo de produtos por tenant)
-- ============================================================

CREATE TABLE IF NOT EXISTS products (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,

  name              TEXT    NOT NULL,
  description       TEXT,
  short_description TEXT,                -- Versão curta para WhatsApp
  price             NUMERIC(12,2),
  price_display     TEXT,                -- "A partir de R$ 99,90" ou "Sob consulta"
  currency          TEXT    NOT NULL DEFAULT 'BRL',
  category          TEXT,
  subcategory       TEXT,
  tags              TEXT[]  NOT NULL DEFAULT '{}',

  -- Imagens: [{url, thumbnail_url, alt, position}]
  images JSONB NOT NULL DEFAULT '[]',

  is_available BOOLEAN NOT NULL DEFAULT true,
  is_featured  BOOLEAN NOT NULL DEFAULT false,

  -- Campos extras livres configuráveis por tenant
  metadata JSONB NOT NULL DEFAULT '{}',

  -- Full-text search (atualizado por trigger)
  search_vector TSVECTOR,

  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE products IS 'Catálogo de produtos/serviços por tenant. Usado pela IA via function calling.';
COMMENT ON COLUMN products.short_description IS 'Texto curto enviado no WhatsApp junto à imagem do produto.';
COMMENT ON COLUMN products.search_vector IS 'Coluna alimentada por trigger para busca textual em português.';

-- ── Indexes ────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_products_tenant_id     ON products (tenant_id);
CREATE INDEX IF NOT EXISTS idx_products_category      ON products (tenant_id, category);
CREATE INDEX IF NOT EXISTS idx_products_is_available  ON products (tenant_id, is_available);
CREATE INDEX IF NOT EXISTS idx_products_is_featured   ON products (tenant_id, is_featured);
CREATE INDEX IF NOT EXISTS idx_products_tags          ON products USING GIN (tags);
CREATE INDEX IF NOT EXISTS idx_products_search        ON products USING GIN (search_vector);

-- ── Trigger: atualizar search_vector ──────────────────────
CREATE OR REPLACE FUNCTION update_product_search_vector()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.search_vector := to_tsvector(
    'portuguese',
    coalesce(NEW.name, '')              || ' ' ||
    coalesce(NEW.description, '')       || ' ' ||
    coalesce(NEW.short_description, '') || ' ' ||
    coalesce(NEW.category, '')          || ' ' ||
    coalesce(NEW.subcategory, '')       || ' ' ||
    coalesce(array_to_string(NEW.tags, ' '), '')
  );
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_products_search_vector
  BEFORE INSERT OR UPDATE ON products
  FOR EACH ROW EXECUTE FUNCTION update_product_search_vector();

-- ── Trigger: updated_at ───────────────────────────────────
CREATE TRIGGER trg_products_updated_at
  BEFORE UPDATE ON products
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ── RLS ────────────────────────────────────────────────────
ALTER TABLE products ENABLE ROW LEVEL SECURITY;

-- Leitura: qualquer membro do tenant (IA usa via service role)
CREATE POLICY "tenant_isolation_select"
  ON products FOR SELECT
  USING (tenant_id = (auth.jwt() ->> 'tenant_id')::UUID);

-- Escrita: apenas owner e admin
CREATE POLICY "tenant_owner_admin_write"
  ON products FOR INSERT
  WITH CHECK (
    tenant_id = (auth.jwt() ->> 'tenant_id')::UUID
    AND (auth.jwt() ->> 'role')::TEXT IN ('owner','admin')
  );

CREATE POLICY "tenant_owner_admin_update"
  ON products FOR UPDATE
  USING (
    tenant_id = (auth.jwt() ->> 'tenant_id')::UUID
    AND (auth.jwt() ->> 'role')::TEXT IN ('owner','admin')
  );

CREATE POLICY "tenant_owner_admin_delete"
  ON products FOR DELETE
  USING (
    tenant_id = (auth.jwt() ->> 'tenant_id')::UUID
    AND (auth.jwt() ->> 'role')::TEXT IN ('owner','admin')
  );

CREATE POLICY "super_admin_full_access"
  ON products FOR ALL
  USING ((auth.jwt() ->> 'is_super_admin')::BOOLEAN IS TRUE);

CREATE POLICY "service_role_full_access"
  ON products FOR ALL
  USING (auth.role() = 'service_role');
