-- Categorias adicionais e preços progressivos por quantidade.
ALTER TABLE products
  ADD COLUMN IF NOT EXISTS additional_categories TEXT[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS price_tiers JSONB NOT NULL DEFAULT '[]';

CREATE INDEX IF NOT EXISTS idx_products_additional_categories
  ON products USING GIN (additional_categories);

CREATE OR REPLACE FUNCTION update_product_search_vector()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.search_vector := to_tsvector(
    'portuguese',
    coalesce(NEW.name, '')              || ' ' ||
    coalesce(NEW.description, '')       || ' ' ||
    coalesce(NEW.short_description, '') || ' ' ||
    coalesce(NEW.category, '')          || ' ' ||
    coalesce(array_to_string(NEW.additional_categories, ' '), '') || ' ' ||
    coalesce(NEW.subcategory, '')       || ' ' ||
    coalesce(NEW.brand, '')             || ' ' ||
    coalesce(NEW.audience, '')          || ' ' ||
    coalesce(array_to_string(NEW.tags, ' '), '') || ' ' ||
    coalesce(array_to_string(NEW.characteristics, ' '), '')
  );
  RETURN NEW;
END;
$$;

UPDATE products SET updated_at = updated_at;
