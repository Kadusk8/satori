# UI Setup: Multi-LLM Configuration

## Novas Páginas

### 1. `/settings` — Configurar API Keys BYOK

**Localização:** Painel do tenant → Configurações

**O que você pode fazer:**
- Visualizar status de cada provider (Claude, OpenAI, Gemini)
- Configurar API keys individuais (BYOK)
- Ver qual provider está ativo (com checkmark verde)
- Links diretos para obter keys

**Como testar:**
1. Acesse `/settings` no dashboard
2. Você verá 3 cards: OpenAI, Gemini, Anthropic
3. Se deixar em branco → sistema usa as keys globais (env vars)
4. Se preencher → aquela key BYOK é usada
5. Clique "Salvar Configurações"

**Fallback inteligente:**
```
Agent escolhe modelo 'gpt-4o'
  ↓
process-message busca openai_api_key do tenant
  ↓
Se preenchida → usa BYOK
  ↓
Se vazia → cai para OPENAI_API_KEY env var
```

---

### 2. `/ai-agents` — Gerenciar Agentes e Modelos

**Localização:** Painel do tenant → Agentes IA

**O que você pode fazer:**
- Criar novo agente
- Escolher modelo (Claude, GPT, Gemini)
- Escolher tipo (SDR, Suporte, Agendamento, Custom)
- Marcar como padrão
- Ativar/desativar
- Editar agente
- Deletar agente

**Como testar:**
1. Acesse `/ai-agents`
2. Clique "Novo Agente"
3. Preencha nome (ex: "Vendedor GPT")
4. Escolha tipo: "Vendedor/SDR"
5. Escolha modelo: "GPT-4o"
6. Deixe "Ativo" e "Padrão" marcados
7. Clique "Criar"
8. Agente aparece na lista
9. Edite clicando no ícone de lápis
10. Delete clicando no ícone de lixo

---

## Fluxo Completo de Setup

### Cenário 1: Usar Claude (padrão)
```
1. Acesse /settings
2. Deixe tudo em branco (ou preencha anthropic_api_key do cliente)
3. Acesse /ai-agents
4. Crie agente com model = 'claude-sonnet-4-20250514'
5. Salve configurações e ative
6. Pronto! Agente usa Claude
```

### Cenário 2: Usar OpenAI
```
1. Acesse /settings
2. Preencha openai_api_key (obtém em https://platform.openai.com/account/api-keys)
3. Clique "Salvar Configurações"
4. Acesse /ai-agents
5. Crie agente com model = 'gpt-4o'
6. Salve e ative
7. Pronto! Agente usa OpenAI
```

### Cenário 3: Usar Gemini
```
1. Acesse /settings
2. Preencha gemini_api_key (obtém em https://aistudio.google.com/app/apikey)
3. Clique "Salvar Configurações"
4. Acesse /ai-agents
5. Crie agente com model = 'gemini-2.0-flash'
6. Salve e ative
7. Pronto! Agente usa Gemini
```

---

## Componentes Criados

### Pages
- `apps/web/app/(dashboard)/settings/page.tsx` — Form de API keys
- `apps/web/app/(dashboard)/ai-agents/page.tsx` — Lista e gerenciamento de agentes

### Components
- `apps/web/components/ai-agents/agent-form.tsx` — Modal form para criar/editar agentes

### Sidebar
- Já havia links para `/settings` e `/ai-agents`
- Ícones: ⚙️ Configurações, 🤖 Agentes IA

---

## Database Integration

### Reads
```typescript
// Agents
FROM ai_agents WHERE tenant_id = $1 ORDER BY created_at DESC

// Tenant keys
FROM tenants WHERE id = $1 SELECT openai_api_key, gemini_api_key, anthropic_api_key
```

### Writes
```typescript
// Update tenant keys
UPDATE tenants SET openai_api_key, gemini_api_key, anthropic_api_key WHERE id = $1

// Create agent
INSERT INTO ai_agents (tenant_id, name, slug, model, type, system_prompt, is_active, is_default)

// Update agent
UPDATE ai_agents SET name, model, type, is_active, is_default WHERE id = $1

// Delete agent
DELETE FROM ai_agents WHERE id = $1
```

---

## Próximos Passos

1. **Test Function Calling:** Enviar mensagem "Quais produtos vocês têm?" em um chat
   - Deve chamar `search_products` tool
   - Deve retornar produtos

2. **Test Escalação:** Enviar "Falar com um humano"
   - Deve escalar para operador
   - Conversation status muda para `waiting_human`

3. **Test Reminders:** Aguardar 15 minutos
   - pg_cron deve disparar `schedule-reminder`
   - Deve enviar lembretes de 24h e 1h

---

## Validação de Chaves

A UI mostra badges de status:
- ✅ Green checkmark = Key configurada
- ⚠️ Info icon = Usando chave global

Não há validação real das keys (teste com valores fake primeiro, depois adicione reais).
