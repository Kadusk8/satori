# Próximos Passos: Debug do Erro de Tenant

O erro está acontecendo na 1ª etapa: "Criando registro do tenant". Isso significa que há um problema no `INSERT` da tabela `tenants`.

## 1️⃣ Verificar Migration (5 min)

Abra **Supabase Dashboard → SQL Editor** e rode:

```sql
SELECT column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_name = 'tenants'
  AND column_name IN ('openai_api_key', 'gemini_api_key', 'anthropic_api_key')
ORDER BY column_name;
```

**Se retornar 0 linhas:** A migration NÃO foi rodada!

Execute isto:
```sql
ALTER TABLE tenants
  ADD COLUMN IF NOT EXISTS openai_api_key TEXT,
  ADD COLUMN IF NOT EXISTS gemini_api_key TEXT,
  ADD COLUMN IF NOT EXISTS anthropic_api_key TEXT;
```

## 2️⃣ Rodar INSERT de Teste (5 min)

No mesmo SQL Editor, copie todo o conteúdo de `DEBUG_TENANT_INSERT.sql` e rode.

Se der erro, compartilhe a mensagem de erro exata que aparece.

## 3️⃣ Verificar se é RLS (5 min)

Se o insert funciona manualmente mas falha na function, o problema pode ser RLS.

Execute:
```sql
-- Ver policies da tabela tenants
SELECT schemaname, tablename, policyname, permissive, roles, qual, with_check
FROM pg_policies
WHERE tablename = 'tenants';
```

Procure por policies que NÃO permitam `service_role`. Se não houver uma que permita service_role, crie:

```sql
ALTER TABLE tenants ENABLE ROW LEVEL SECURITY;

CREATE POLICY "service_role_full"
  ON tenants
  FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');
```

## 4️⃣ Testar Novamente

Volte ao admin panel e tente criar um novo tenant.

---

## 📋 Checklist

- [ ] Migration foi rodada (3 colunas existem)
- [ ] INSERT de teste passou
- [ ] RLS foi verificado/corrigido
- [ ] Tentou criar tenant novamente
- [ ] Se continuar falhando, compartilhe o erro dos logs

---

## 📞 Se Continuar Falhando

Se mesmo após rodar tudo isso ainda estiver falhando, faça isto:

1. **Capture os logs:**
   ```bash
   supabase functions logs onboard-tenant --tail
   ```

2. **Rode o teste isolado:**
   ```bash
   bash test-onboard.sh  # Se tiver criado o arquivo
   ```

3. **Verifique no SQL Editor:**
   ```sql
   -- Ver últimos tenants
   SELECT id, name, slug, status, created_at FROM tenants ORDER BY created_at DESC LIMIT 5;
   ```

4. **Compartilhe:**
   - Mensagem de erro exata dos logs
   - Resultado do INSERT de teste
   - Resultado do query de últimos tenants

---

## 📚 Documentação Criada

- `docs/MULTI_LLM.md` — Overview da arquitetura multi-LLM
- `docs/UI_SETUP.md` — Como usar as páginas de settings e ai-agents
- `docs/DEPLOYMENT.md` — Guia completo de deploy
- `docs/TROUBLESHOOTING_ONBOARD.md` — Troubleshooting do onboarding
- `DEBUG_TENANT_INSERT.sql` — Script para debug

---

## ✅ O Que Já Foi Feito

### Backend
- ✅ Migration 018: 3 colunas de LLM keys (BYOK)
- ✅ llm-client.ts: Cliente unificado para Claude, OpenAI, Gemini
- ✅ process-message: Migrado para usar callLLM
- ✅ onboard-tenant: Adiciona inicialização das 3 colunas

### Frontend
- ✅ /settings: Página para configurar API keys BYOK
- ✅ /ai-agents: Página para gerenciar agentes e escolher modelo
- ✅ AgentForm: Component modal para criar/editar agentes
- ✅ Sidebar: Links já existem para /settings e /ai-agents

### Documentação
- ✅ Guias de setup, deployment, troubleshooting
- ✅ Script de debug SQL
- ✅ Exemplos de teste isolado

### Build
- ✅ npm run build passa sem erros
- ✅ TypeScript clean

---

## 🎯 Após Resolver o Erro

1. Teste function calling: "Quais produtos vocês têm?"
2. Teste escalação: "Falar com um humano"
3. Teste diferentes modelos: Claude, GPT, Gemini
4. Teste configurar API keys em /settings
5. Teste criar agentes em /ai-agents

---

**Aviso:** Não delete nada enquanto investigamos. Os arquivos criados são:
- `supabase/migrations/018_add_llm_api_keys_to_tenants.sql`
- `supabase/functions/_shared/llm-client.ts`
- `apps/web/app/(dashboard)/settings/page.tsx`
- `apps/web/app/(dashboard)/ai-agents/page.tsx`
- `apps/web/components/ai-agents/agent-form.tsx`
- `docs/MULTI_LLM.md`, `docs/UI_SETUP.md`, `docs/DEPLOYMENT.md`, `docs/TROUBLESHOOTING_ONBOARD.md`
