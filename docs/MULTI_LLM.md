# Multi-LLM Support: Claude + Gemini + OpenAI

## Overview

O sistema de IA agora suporta **três providers de LLM**:
- **Claude (Anthropic)** — `claude-sonnet-4-20250514`, `claude-opus-4-20250805`, etc.
- **OpenAI (ChatGPT)** — `gpt-4o`, `gpt-4-turbo`, `gpt-3.5-turbo`, etc.
- **Google Gemini** — `gemini-2.0-flash`, `gemini-1.5-pro`, etc.

## Architecture

### 1. LLM Client (`supabase/functions/_shared/llm-client.ts`)

Abstração unificada que:
- Detecta o provider pelo prefixo do `model` string
- Normaliza requisições e respostas entre os 3 providers
- Suporta **function calling** (tools) em todos os providers
- Retorna sempre `LLMResponse` padronizado

**Fluxo interno:**
```
callLLM(params)
  ├─ getProvider(model) → 'anthropic' | 'openai' | 'gemini'
  ├─ Converte params para formato do provider
  ├─ Chama API do provider
  └─ Normaliza resposta → LLMResponse
```

### 2. Process Message (`supabase/functions/process-message/index.ts`)

Modificado para usar `callLLM` ao invés de `callClaude`. O loop de function calling permanece idêntico.

### 3. Database Schema

Novas colunas na tabela `tenants`:
- `openai_api_key` — API key da OpenAI (BYOK)
- `gemini_api_key` — API key do Google (BYOK)
- `anthropic_api_key` — API key da Anthropic (BYOK, opcional — cai para env var)

Coluna existente em `ai_agents`:
- `model` — determina qual provider usar

## Usage

### Setup do Tenant

1. No painel admin, ao criar um novo tenant, adicione as API keys (opcionais):
   - Deixe em branco para usar as keys globais (env vars do Supabase)
   - Ou preencha com keys BYOK do cliente

2. No painel do tenant, ao criar um agente de IA, escolha o modelo:
   - `claude-sonnet-4-20250514` → Anthropic
   - `gpt-4o` → OpenAI
   - `gemini-2.0-flash` → Gemini

### Fallback de Keys

Se a key BYOK não estiver preenchida, o sistema cai para as env vars do Supabase:
- Anthropic: `ANTHROPIC_API_KEY`
- OpenAI: `OPENAI_API_KEY`
- Gemini: `GEMINI_API_KEY`

```typescript
// Exemplo no llm-client.ts
const apiKey = params.anthropicApiKey || Deno.env.get('ANTHROPIC_API_KEY')
```

## API Format Mapping

| Aspecto | Claude | OpenAI | Gemini |
|---------|--------|--------|--------|
| **Endpoint** | `api.anthropic.com/v1/messages` | `api.openai.com/v1/chat/completions` | `generativelanguage.googleapis.com/v1beta/models/{id}:generateContent` |
| **Tool Definition** | `tools[].input_schema` | `tools[].function.parameters` | `tools[0].functionDeclarations[].parameters` |
| **Tool Call** | `content[].type='tool_use'` | `message.tool_calls[].function` | `parts[].functionCall` |
| **Tool Result** | `content[].type='tool_result'` | `role='tool', tool_call_id=''` | `parts[].functionResponse` |
| **Stop Reason** | `stop_reason='tool_use'` | `finish_reason='tool_calls'` | `finishReason='STOP'` |

## Testing

### 1. Test Claude (Default)
```bash
# Criar agente com model = 'claude-sonnet-4-20250514'
# Deixar API keys em branco no tenant
# Sistema usa ANTHROPIC_API_KEY env var
```

### 2. Test OpenAI
```bash
# Criar agente com model = 'gpt-4o'
# Preenchher openai_api_key no tenant OU usar OPENAI_API_KEY env var
# Enviar mensagem → /process-message deve usar OpenAI API
```

### 3. Test Gemini
```bash
# Criar agente com model = 'gemini-2.0-flash'
# Preencher gemini_api_key no tenant OU usar GEMINI_API_KEY env var
# Enviar mensagem → /process-message deve usar Gemini API
```

### 4. Test Function Calling
Enviar mensagem como "Quais produtos vocês têm?" para qualquer provider:
```
LLM chama search_products(query='produtos')
  ↓
executeTool() busca na DB
  ↓
LLM recebe resultado + gera resposta natural
```

## Environment Variables

```env
# Fallback keys (opcional)
ANTHROPIC_API_KEY=sk-ant-...
OPENAI_API_KEY=sk-...
GEMINI_API_KEY=AI...
```

## Migration

Migration `018_add_llm_api_keys_to_tenants.sql` adiciona as 3 colunas. Já foi rodada.

## Known Limitations

1. **Gemini**: Não suporta `top_p` parameter — usando apenas `temperature`
2. **OpenAI**: Requer `content` não-null em todas as mensagens — se vazio, envia string vazia
3. **Tool Results**: Gemini requer formato `functionResponse` específico — adaptado no llm-client

## Future Enhancements

- [ ] Support para Claude with vision (image input)
- [ ] Support para OpenAI vision models
- [ ] Support para Gemini multimodal
- [ ] Cache de responses para economizar tokens
- [ ] Provider-specific parameter tuning (ex: `top_p` só para OpenAI)
