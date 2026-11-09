-- Três tipos de preço para o modo loja de roupas (fashion): Varejo (coluna
-- price já existente), Atacado e Revenda. A IA decide qual usar conforme o cliente.
ALTER TABLE products
  ADD COLUMN IF NOT EXISTS price_wholesale NUMERIC(12,2) CHECK (price_wholesale IS NULL OR price_wholesale >= 0),
  ADD COLUMN IF NOT EXISTS price_reseller  NUMERIC(12,2) CHECK (price_reseller IS NULL OR price_reseller >= 0);
