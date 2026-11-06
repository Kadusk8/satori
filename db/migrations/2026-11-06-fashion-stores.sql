BEGIN;

ALTER TABLE tenants DROP CONSTRAINT IF EXISTS tenants_business_model_check;
ALTER TABLE tenants ADD CONSTRAINT tenants_business_model_check
  CHECK (business_model IN ('product', 'fashion', 'service'));

ALTER TABLE tenant_business_model_history DROP CONSTRAINT IF EXISTS tenant_business_model_history_from_model_check;
ALTER TABLE tenant_business_model_history DROP CONSTRAINT IF EXISTS tenant_business_model_history_to_model_check;
ALTER TABLE tenant_business_model_history ADD CONSTRAINT tenant_business_model_history_from_model_check
  CHECK (from_model IN ('product', 'fashion', 'service'));
ALTER TABLE tenant_business_model_history ADD CONSTRAINT tenant_business_model_history_to_model_check
  CHECK (to_model IN ('product', 'fashion', 'service'));

ALTER TABLE products ADD COLUMN IF NOT EXISTS brand TEXT;
ALTER TABLE products ADD COLUMN IF NOT EXISTS audience TEXT;
ALTER TABLE products ADD COLUMN IF NOT EXISTS promotional_price NUMERIC;

ALTER TABLE products DROP CONSTRAINT IF EXISTS products_audience_check;
ALTER TABLE products ADD CONSTRAINT products_audience_check
  CHECK (audience IS NULL OR audience IN ('female', 'male', 'kids', 'unisex'));

ALTER TABLE products DROP CONSTRAINT IF EXISTS products_promotional_price_check;
ALTER TABLE products ADD CONSTRAINT products_promotional_price_check
  CHECK (promotional_price IS NULL OR (promotional_price >= 0 AND price IS NOT NULL AND promotional_price < price));

CREATE OR REPLACE FUNCTION update_product_search_vector()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.search_vector := to_tsvector(
    'portuguese',
    coalesce(NEW.name, '') || ' ' || coalesce(NEW.description, '') || ' ' ||
    coalesce(NEW.short_description, '') || ' ' || coalesce(NEW.category, '') || ' ' ||
    coalesce(NEW.subcategory, '') || ' ' || coalesce(NEW.brand, '') || ' ' ||
    coalesce(NEW.audience, '') || ' ' || coalesce(array_to_string(NEW.tags, ' '), '') || ' ' ||
    coalesce(array_to_string(NEW.characteristics, ' '), '')
  );
  RETURN NEW;
END;
$$;

UPDATE products SET updated_at = updated_at;

CREATE TABLE IF NOT EXISTS product_variants (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  product_id UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  size TEXT NOT NULL,
  color TEXT NOT NULL,
  sku TEXT NOT NULL,
  stock INTEGER NOT NULL DEFAULT 0 CHECK (stock >= 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, sku),
  UNIQUE (product_id, size, color)
);

CREATE INDEX IF NOT EXISTS idx_product_variants_product ON product_variants(product_id);
CREATE INDEX IF NOT EXISTS idx_product_variants_tenant_stock ON product_variants(tenant_id, stock);

DROP TRIGGER IF EXISTS trg_product_variants_updated_at ON product_variants;
CREATE TRIGGER trg_product_variants_updated_at
  BEFORE UPDATE ON product_variants FOR EACH ROW EXECUTE FUNCTION set_updated_at();

ALTER TABLE product_variants ENABLE ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolation_select" ON product_variants FOR SELECT
  USING (tenant_id = (auth.jwt() ->> 'tenant_id')::UUID OR (auth.jwt() ->> 'is_super_admin')::BOOLEAN IS TRUE);
CREATE POLICY "owner_admin_insert" ON product_variants FOR INSERT
  WITH CHECK (tenant_id = (auth.jwt() ->> 'tenant_id')::UUID AND (auth.jwt() ->> 'user_role') IN ('owner', 'admin'));
CREATE POLICY "owner_admin_update" ON product_variants FOR UPDATE
  USING (tenant_id = (auth.jwt() ->> 'tenant_id')::UUID AND (auth.jwt() ->> 'user_role') IN ('owner', 'admin'));
CREATE POLICY "owner_admin_delete" ON product_variants FOR DELETE
  USING (tenant_id = (auth.jwt() ->> 'tenant_id')::UUID AND (auth.jwt() ->> 'user_role') IN ('owner', 'admin'));
CREATE POLICY "super_admin_full_access" ON product_variants FOR ALL
  USING ((auth.jwt() ->> 'is_super_admin')::BOOLEAN IS TRUE);
CREATE POLICY "service_role_full_access" ON product_variants FOR ALL
  USING (auth.role() = 'service_role');

COMMIT;
