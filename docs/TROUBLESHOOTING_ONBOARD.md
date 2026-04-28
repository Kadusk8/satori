# Troubleshooting: Erro ao Criar Tenant

Se receber "Erro ao criar tenant" na tela de revisão final do onboarding, siga estes passos.

---

## Passo 1: Verificar Logs da Edge Function

### No Supabase Dashboard

1. Vá para **Functions**
2. Clique em **onboard-tenant**
3. Vá para aba **Logs** (deve estar no menu superior)
4. Procure pela última execução e veja qual é a mensagem de erro exata

### Via CLI

```bash
supabase functions logs onboard-tenant --tail

# Vai mostrar:
# [onboard-tenant] ERROR: Tenant: ...
# [onboard-tenant] STACK: ...
# [onboard-tenant] PAYLOAD: { step1, step2, ... }
```

---

## Passo 2: Verificar se Migration foi rodada

### No Supabase Dashboard → SQL Editor

```sql
-- Execute este comando
SELECT column_name, data_type
FROM information_schema.columns
WHERE table_name = 'tenants'
  AND column_name IN ('openai_api_key', 'gemini_api_key', 'anthropic_api_key');
```

**Resultado esperado:** 3 linhas (uma para cada coluna)

**Se retornar 0 linhas:** A migration NÃO foi rodada!

### Solução: Rodar a Migration

```sql
-- Copiar e rodar no SQL Editor do Supabase
ALTER TABLE tenants
  ADD COLUMN IF NOT EXISTS openai_api_key TEXT,
  ADD COLUMN IF NOT EXISTS gemini_api_key TEXT,
  ADD COLUMN IF NOT EXISTS anthropic_api_key TEXT;

COMMENT ON COLUMN tenants.openai_api_key IS 'API key da OpenAI (sk-...) — BYOK do tenant para usar GPT';
COMMENT ON COLUMN tenants.gemini_api_key IS 'API key do Google Generative AI (AI...) — BYOK do tenant para usar Gemini';
COMMENT ON COLUMN tenants.anthropic_api_key IS 'API key da Anthropic (sk-ant-...) — BYOK do tenant para usar Claude';
```

Agora tente criar o tenant novamente.

---

## Passo 3: Verificar RLS (Row Level Security)

Se continuar falhando, o problema pode ser uma política RLS que está bloqueando a service role.

### No Supabase Dashboard → SQL Editor

```sql
-- Verificar policies da tabela tenants
SELECT * FROM pg_policies WHERE tablename = 'tenants';

-- Deve retornar policies que incluem:
-- - tenant_isolation
-- - service_role_full_access (ou similar)
```

Se não houver uma policy que permita `service_role`, crie:

```sql
ALTER TABLE tenants ENABLE ROW LEVEL SECURITY;

CREATE POLICY "service_role_full_access"
  ON tenants
  FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');
```

---

## Passo 4: Verificar Evolution API

A falha pode estar ao tentar conectar com Evolution API.

### Checklist

- [ ] `step2.evolutionApiUrl` é uma URL válida (ex: `http://localhost:8080`)
- [ ] `step2.evolutionApiKey` é uma key válida
- [ ] `step2.instanceName` é um nome válido (sem espaços)
- [ ] Evolution API está rodando e acessível

### Se Evolution falhar

A função retorna erro na etapa "evolution" (3ª etapa).

**Solução temporária:** Deixe uma Evolution API dummy rodando:

```bash
# Exemplo com Docker
docker run -d -p 8080:8080 evolution-api:latest
```

---

## Passo 5: Validação de Dados

Verifique se os dados do wizard estão completos:

```
Step 1 (Negócio):
  ✅ name (obrigatório)
  ✅ ownerEmail (obrigatório)
  ✅ segment (obrigatório: clinica, loja, servicos, restaurante, outro)
  ⚠️  description, ownerName, ownerPhone, address, city, state, website (opcionais)

Step 2 (WhatsApp):
  ✅ whatsappNumber (obrigatório: ex 62999999999)
  ✅ evolutionApiUrl (obrigatório: ex http://localhost:8080)
  ✅ evolutionApiKey (obrigatório: qualquer string)
  ✅ instanceName (obrigatório: ex teste-multi-llm)
  ⚠️  connectionType (opcional: 'baileys' ou 'cloud_api', padrão 'baileys')

Step 3 (IA):
  ⚠️  name (opcional: padrão "Assistente {empresa}")
  ⚠️  personality (opcional: padrão "simpatico")

Step 4 (Produtos):
  ⚠️  skipped: boolean (pode pular essa etapa)
  ⚠️  products: array (pode estar vazio)

Step 5 (Horários):
  ✅ businessHours (obrigatório: { mon: {enabled, start, end}, ...})
  ✅ timezone (obrigatório: ex "America/Sao_Paulo")
  ✅ appointmentDurationMinutes (obrigatório: ex 30)
```

---

## Passo 6: Teste Isolado

Se nada funcionou, teste a função isoladamente:

### Criar arquivo `test-onboard.sh`

```bash
#!/bin/bash

SUPABASE_URL="https://xxxxx.supabase.co"
SUPABASE_ANON_KEY="eyJ..."

curl -X POST \
  "$SUPABASE_URL/functions/v1/onboard-tenant" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $SUPABASE_ANON_KEY" \
  -d '{
    "step1": {
      "name": "Teste Isolado",
      "ownerEmail": "test@test.com",
      "segment": "servicos",
      "ownerName": "Test User",
      "ownerPhone": "62999999999"
    },
    "step2": {
      "whatsappNumber": "62999999999",
      "evolutionApiUrl": "http://localhost:8080",
      "evolutionApiKey": "test-key",
      "instanceName": "teste-isolado",
      "connectionType": "baileys"
    },
    "step3": {
      "personality": "simpatico"
    },
    "step4": {
      "skipped": true,
      "products": []
    },
    "step5": {
      "businessHours": {
        "mon": {"enabled": true, "start": "08:00", "end": "18:00"},
        "tue": {"enabled": true, "start": "08:00", "end": "18:00"},
        "wed": {"enabled": true, "start": "08:00", "end": "18:00"},
        "thu": {"enabled": true, "start": "08:00", "end": "18:00"},
        "fri": {"enabled": true, "start": "08:00", "end": "18:00"}
      },
      "timezone": "America/Sao_Paulo",
      "appointmentDurationMinutes": 30
    }
  }'
```

Rode:
```bash
bash test-onboard.sh
```

A resposta deve ser:
```json
{
  "success": true,
  "tenantId": "xxx",
  "slug": "teste-isolado"
}
```

---

## Passo 7: Verificar Banco Manualmente

Após rodar o teste isolado, verifique se o tenant foi criado:

```sql
-- No SQL Editor
SELECT id, name, slug, status, created_at
FROM tenants
ORDER BY created_at DESC
LIMIT 5;

-- Procure por "Teste Isolado" ou o nome que usou
```

Se aparecer, o problema é na UI ou nas etapas subsequentes.

---

## Checklist Final

- [ ] Migration 018 foi rodada (3 colunas existem em `tenants`)
- [ ] RLS está configurado corretamente
- [ ] Evolution API está rodando e acessível
- [ ] Dados do wizard estão completos e validados
- [ ] Logs da função mostram o erro específico
- [ ] Teste isolado com curl funciona

Se todos os items passarem e continuar falhando, crie uma issue com os logs da função.
