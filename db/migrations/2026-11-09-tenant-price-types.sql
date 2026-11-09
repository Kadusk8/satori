-- Liga por tenant os 3 tipos de preço (Varejo/Atacado/Revenda) no cadastro de produtos.
ALTER TABLE tenants
  ADD COLUMN IF NOT EXISTS price_types_enabled BOOLEAN NOT NULL DEFAULT false;
