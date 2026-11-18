-- Modo de atuação da IA por tenant:
--   auto   → vendedora quando não há vendedor online (ou fora do horário / sem equipe);
--            SDR (qualifica e passa) quando há vendedor online dentro do horário.
--   seller → sempre vendedora ("IA atende por mim").
--   sdr    → sempre SDR (se não houver vendedor cadastrado, cai pra vendedora).
ALTER TABLE tenants
  ADD COLUMN IF NOT EXISTS ai_sales_mode TEXT NOT NULL DEFAULT 'auto';

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'tenants_ai_sales_mode_check') THEN
    ALTER TABLE tenants
      ADD CONSTRAINT tenants_ai_sales_mode_check CHECK (ai_sales_mode IN ('auto', 'seller', 'sdr'));
  END IF;
END $$;

COMMENT ON COLUMN tenants.ai_sales_mode IS 'Modo da IA: auto (SDR com vendedor online no horário, vendedora caso contrário), seller (sempre vendedora), sdr (sempre SDR).';
