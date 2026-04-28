# Guia de Deploy: Multi-LLM Support

## Pré-requisitos

- Supabase projeto criado e configurado
- Edge Functions deployadas
- Database migrations rodadas

---

## Passo 1: Rodar Migration 018

A migration `supabase/migrations/018_add_llm_api_keys_to_tenants.sql` adiciona as 3 colunas de API keys BYOK.

### Via Supabase CLI

```bash
cd /Users/mac/zapai
supabase db push
```

Ou manualmente no SQL Editor do Supabase Dashboard:

```sql
-- Copiar o conteúdo de supabase/migrations/018_add_llm_api_keys_to_tenants.sql
ALTER TABLE tenants
  ADD COLUMN IF NOT EXISTS openai_api_key TEXT,
  ADD COLUMN IF NOT EXISTS gemini_api_key TEXT,
  ADD COLUMN IF NOT EXISTS anthropic_api_key TEXT;
```

### Verificar que rodou

```sql
-- No Supabase Dashboard SQL Editor
SELECT column_name, data_type
FROM information_schema.columns
WHERE table_name = 'tenants'
  AND column_name IN ('openai_api_key', 'gemini_api_key', 'anthropic_api_key');

-- Deve retornar 3 linhas com data_type = 'text'
```

---

## Passo 2: Deploy das Edge Functions

### Funções que mudaram

1. **`supabase/functions/process-message/index.ts`**
   - Agora usa `callLLM` ao invés de `callClaude`
   - Compatível com Claude, OpenAI, Gemini

2. **`supabase/functions/onboard-tenant/index.ts`**
   - Adicionado inicialização das 3 colunas de API keys com `null`

3. **`supabase/functions/_shared/llm-client.ts`** (NOVA)
   - Cliente unificado para 3 providers
   - OBRIGATÓRIA para que `process-message` funcione

### Deploy via CLI

```bash
cd /Users/mac/zapai
supabase functions deploy
```

Ou selectively:

```bash
supabase functions deploy process-message --no-verify
supabase functions deploy onboard-tenant --no-verify
```

### Verificar Deploy

```bash
supabase functions list

# Deve listar todas as functions:
# - process-message
# - onboard-tenant
# - schedule-reminder
# - send-whatsapp
# - webhook-evolution
# - setup-ai-agent
```

---

## Passo 3: Configurar Environment Variables

### No Supabase Project Settings → Functions

Configure as 3 API keys globais (fallback):

```env
# Anthropic
ANTHROPIC_API_KEY=sk-ant-xxxxx

# OpenAI
OPENAI_API_KEY=sk-xxxxx

# Google Generative AI
GEMINI_API_KEY=AIxxxxx
```

Se deixar em branco, o sistema vai falhar apenas quando um agente tentar usar esse provider sem chave BYOK.

---

## Passo 4: Testar Onboarding

### Cenário: Criar novo tenant

1. Acesse admin panel → Tenants
2. Clique "Novo Tenant"
3. Preencha wizard com dados:
   - Nome: "Teste Multi-LLM"
   - Segmento: "serviços"
   - Email: seu email
   - WhatsApp number: `62999999999`
   - Instância Evolution: `teste-multi-llm`
   - Evolution URL: sua URL ou mock
   - Modelo: `claude-sonnet-4-20250514`
4. Clique "Ativar Tenant"

### Checklist

- ✅ Tenant criado com sucesso
- ✅ Coluna `openai_api_key` = null
- ✅ Coluna `gemini_api_key` = null
- ✅ Coluna `anthropic_api_key` = null
- ✅ Magic link enviado ao email

---

## Passo 5: Testar Settings Page

### Cenário: Configurar API keys BYOK

1. Login como tenant owner
2. Clique menu → Configurações
3. Vê 3 cards: OpenAI, Gemini, Anthropic
4. Preencha OpenAI API key (obtém em https://platform.openai.com/account/api-keys)
5. Clique "Salvar Configurações"
6. Página recarrega
7. Vê checkmark verde em OpenAI

### Checklist

- ✅ Form carrega (não falha)
- ✅ Pode salvar keys
- ✅ Checkmark aparece quando preenchida
- ✅ Dados persistem após reload

---

## Passo 6: Testar AI Agents Page

### Cenário: Criar agente com GPT-4o

1. No dashboard, clique menu → Agentes IA
2. Clique "Novo Agente"
3. Preencha:
   - Nome: "Vendedor GPT"
   - Tipo: "Vendedor/SDR"
   - Modelo: "GPT-4o"
   - Ativo: ✅
   - Padrão: ✅
4. Clique "Criar"
5. Agente aparece na lista com badge verde "GPT-4o"

### Checklist

- ✅ Pode criar agente
- ✅ Model dropdown mostra opções (Claude, GPT, Gemini)
- ✅ Badge cor correta (purple/Claude, green/GPT, blue/Gemini)
- ✅ Pode editar agente
- ✅ Pode deletar agente

---

## Passo 7: Testar Function Calling

### Cenário: Chat com busca de produtos

1. Vá para chat com cliente
2. Envie mensagem: "Quais produtos vocês têm?"
3. Observe:
   - IA chama `search_products` tool
   - Retorna produtos reais do DB
   - IA gera resposta natural
   - LLM usado = aquele do agente

### Checklist

- ✅ Tool calling funciona
- ✅ Produtos retornados são reais
- ✅ Resposta é natural (não apenas JSON)
- ✅ Não há erro de API key

### Se der erro de API key

```
"OPENAI_API_KEY not configured"
```

Significa:
- Agente usa modelo `gpt-4o`
- Tenant não preencheu `openai_api_key`
- Env var `OPENAI_API_KEY` não está configurada

**Solução:** Configure a env var ou preencha a chave BYOK em Configurações.

---

## Troubleshooting

### "Erro ao criar tenant"

**Causas possíveis:**
1. Migration 018 não foi rodada → execute a migration
2. Slug duplicado → mude o nome da empresa
3. Evolution API falhou → checa URL e key da Evolution

**Debug:**
```sql
-- Verificar se as 3 colunas existem
\d tenants

-- Deve aparecer:
-- openai_api_key | text
-- gemini_api_key | text
-- anthropic_api_key | text
```

---

### "Settings page não carrega"

**Causa:** Usuário não autenticado ou tenant_id não está em `user.user_metadata`.

**Debug:**
```typescript
// No browser console, ao carregar /settings
const { data: { user } } = await supabase.auth.getUser()
console.log(user.user_metadata)
// Deve ter `tenant_id`
```

---

### "Tool calling retorna error de API key"

**Possível causa:** `callLLM` não recebeu a API key.

**Debug:**
1. Verificar se env var está configurada:
   ```bash
   # No Supabase Dashboard
   Project Settings → Functions → Environment Variables
   ```

2. Verificar se BYOK foi preenchida:
   ```sql
   SELECT openai_api_key, gemini_api_key, anthropic_api_key
   FROM tenants
   WHERE id = '...' -- seu tenant
   ```

3. Se ambas estão vazias, configure a env var global (fallback).

---

## Rollback (se necessário)

### Remover as 3 colunas (desastroso)

```sql
ALTER TABLE tenants
  DROP COLUMN openai_api_key,
  DROP COLUMN gemini_api_key,
  DROP COLUMN anthropic_api_key;
```

### Ou: Desativar suporte multi-LLM

1. Deixar env vars vazias
2. Continuará funcionando com Claude (padrão)
3. Agentes com `model != 'claude-*'` vão falhar

---

## Monitoramento

### Ver logs das Edge Functions

```bash
supabase functions logs process-message --tail
```

### Queries úteis

```sql
-- Ver últimos tenants criados
SELECT id, name, created_at
FROM tenants
ORDER BY created_at DESC
LIMIT 5;

-- Ver agentes de um tenant
SELECT id, name, model, is_default
FROM ai_agents
WHERE tenant_id = '...'
ORDER BY created_at DESC;

-- Ver se API keys foram preenchidas
SELECT id, name,
  CASE WHEN openai_api_key IS NOT NULL THEN '✅' ELSE '❌' END as openai,
  CASE WHEN gemini_api_key IS NOT NULL THEN '✅' ELSE '❌' END as gemini,
  CASE WHEN anthropic_api_key IS NOT NULL THEN '✅' ELSE '❌' END as anthropic
FROM tenants;
```

---

## Próximos Passos

1. Deploy para produção via Vercel (frontend) + Supabase
2. Configurar monitoria e alertas
3. Documentação para clientes sobre como configurar keys BYOK
