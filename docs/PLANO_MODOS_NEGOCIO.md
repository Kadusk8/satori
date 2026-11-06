# Plano: Satori para empresas de produtos e de serviços

> **Status em 06/11/2026:** implementação concluída e migration aplicada ao banco de produção. A publicação de frontend/backend e o piloto com uma empresa real são as etapas operacionais restantes.

## Objetivo e decisão

O super admin escolhe **Produtos** ou **Serviços** ao cadastrar uma empresa. O Satori continua com uma aplicação, um banco e um backend, mas apresenta cadastro, painel e comportamento da IA adequados ao modo escolhido. `business_segment` (clínica, loja etc.) continua independente do novo `business_model` (`product` ou `service`): o segmento não determina como a empresa opera.

O lançamento terá dois modos. O esquema e as funções de leitura devem permitir adicionar `hybrid` mais tarde sem reescrever o fluxo inteiro, mas não haverá opção mista no cadastro inicial.

## Situação atual que o plano precisa resolver

- O wizard (`apps/web/app/(admin)/admin/tenants/new/`) mostra “Produtos e Serviços”, mas grava todos os itens na tabela `products` (`apps/web/lib/data/onboarding.ts`).
- O prompt criado no onboarding manda buscar produtos e enviar imagem mesmo para um serviço. O prompt de execução e os guardrails em `services/backend/src/core/process-message.ts` têm várias regras específicas de produto e até exemplos de veículos.
- O painel sempre mostra “Produtos” e “Agenda” (`apps/web/components/dashboard/dashboard-sidebar.tsx`); nomes e campos do CRUD são de produto.
- `ai_agents` já possui permissões para busca e agendamento, mas são por agente; não definem o modo da empresa. O backend deve cruzar as permissões do agente com as capacidades do tenant.
- A agenda hoje usa duração padrão do tenant; `check_availability` e `book_appointment` não recebem um serviço. A restrição de conflitos em `appointments` impede sobreposição para o tenant inteiro. `appointment_services` registra serviços realizados **na conclusão**, não define o serviço no momento da reserva.

## Escopo funcional do primeiro lançamento

| Área | Produtos | Serviços |
| --- | --- | --- |
| Catálogo no painel | Produtos: descrição, preço, fotos, características, disponibilidade | Serviços: descrição, preço ou “sob consulta”, duração, disponibilidade; foto opcional |
| IA | Busca itens, apresenta um produto relevante e envia foto quando cabível | Busca serviços, explica escopo/preço/duração e oferece horário; não aplica regras automáticas de foto ou venda de produto |
| Agenda | Pode continuar disponível para visita, demonstração ou atendimento se o agente for configurado para agendar | Fluxo principal: selecionar serviço, consultar horários e confirmar agendamento |
| Configuração inicial | Produtos opcionais | Serviços opcionais; se nenhum for cadastrado, a IA não inventa serviços nem confirma reserva de serviço desconhecido |

Funcionalidade de múltiplos profissionais ou múltiplos atendimentos simultâneos fica fora deste lançamento. A agenda de serviços terá **uma capacidade por horário para a empresa**, como já acontece hoje. A interface deve explicar essa limitação; permitir escolher um profissional para executar o serviço exige uma etapa posterior de disponibilidade e conflito por recurso.

## Fases de implementação

### 1. Contrato de dados e migração compatível

**Implementado no código.**

1. Criar migration idempotente em `db/migrations/` e refletir em `db/schema.sql`: `tenants.business_model TEXT NOT NULL DEFAULT 'product'` com `CHECK` para `product`/`service` (incluir `hybrid` no contrato apenas quando houver suporte real). Atualizar os schemas Drizzle de `apps/web` e `services/backend` e o tipo compartilhado do wizard.
2. Manter `products` como catálogo físico nesta primeira etapa, com `item_kind` (`product`/`service`, default `product`) e `duration_minutes` positivo apenas para serviços. O modo da empresa determina o que pode ser cadastrado; o tipo de cada item permite filtro seguro e futura empresa mista. Não renomear a tabela agora: a agenda e o histórico já referenciam `products.id`.
3. Preservar os tenants e itens existentes como `product` por padrão. Identificar empresas que já cadastraram serviços em `products` e reclassificá-las **após revisão dos dados**, sem inferir pelo `business_segment`. Não apagar nem converter itens automaticamente.
4. Definir a regra de mudança de modo: somente super admin, com prévia de itens e agendamentos incompatíveis; bloquear a troca enquanto houver dados que precisem de conversão. Registrar a alteração. Evitar que uma nova tentativa de onboarding sobrescreva o modo ou duplique catálogo de um tenant criado anteriormente pelo mesmo slug.

**Aceite:** migration segura em banco existente e instalação nova; todos os tenants atuais continuam operando como antes; cada item tem tipo válido; leitura do modo tem fallback temporário durante a publicação gradual.

### 2. Cadastro do tenant e painel administrativo

**Implementado no código.**

1. Adicionar a escolha obrigatória “Produtos”/“Serviços” no passo de negócio do wizard, separada de “Segmento”. Persistir no estado, payload, validação no servidor e registro `tenants`.
2. Fazer o passo 4 acompanhar a escolha: formulário e texto de produto ou serviço; no serviço, pedir duração e manter preço opcional. O passo de horários deve deixar clara a diferença entre horário de funcionamento e disponibilidade para agendamento.
3. Mostrar o modo no resumo de ativação, na listagem e no detalhe do tenant. Na edição, aplicar a regra de mudança de modo da fase 1.
4. Gerar o agente inicial com objetivo, prompt e permissões coerentes: busca de catálogo adequada ao modo, imagens apenas quando úteis e agendamento conforme configuração. A seleção do modo deve ser validada também na Server Action.

**Aceite:** criar um tenant de cada modo produz o tipo correto no banco, itens iniciais corretos e agente coerente; voltar etapas ou recarregar o wizard não mistura rascunhos dos modos.

### 3. Experiência do tenant e ações de servidor

**Implementado no código para os dois modos, incluindo vínculo do serviço e duração na reserva.**

1. Renderizar navegação e rótulos conforme o modo, mantendo CRM, contatos, equipe e configurações compartilhados. “Produtos” vira “Serviços” no modo de serviço. “Agenda” permanece acessível quando a empresa a usa.
2. Adaptar o CRUD e categorias: campos específicos, validação de duração, disponibilidade, preço “sob consulta” e ausência de imagem obrigatória. Filtrar listagem, edição e exclusão por `tenant_id` **e** `item_kind` no servidor; esconder o menu não basta para proteger rotas e ações.
3. Na agenda, escolher um serviço ao reservar, derivar a duração dele e registrar o vínculo com o serviço no agendamento (novo campo/relacionamento, preservando a cópia de nome e preço em `appointment_services` na conclusão). Atualizar visualização, conclusão e histórico do cliente sem quebrar agendamentos antigos sem serviço vinculado.
4. Revisar métricas, limite `max_products`, regras de pontuação e componentes que leem `products` para usar termos e contagens adequados ao modo. Manter o limite físico compartilhado no primeiro lançamento, com rótulo contextual.

**Aceite:** usuário de serviços consegue cadastrar serviço, agendar e concluir atendimento; usuário de produtos conserva o fluxo atual; acesso direto por URL ou chamada de ação não permite manipular item do tipo errado.

### 4. Atendimento da IA e regras de agendamento

**Implementado no código, com prompts, tools e guardrails separados por modo.**

1. Separar o prompt em regras comuns + regras de produto + regras de serviço. Retirar do modo serviço as instruções específicas de catálogo com foto, veículo, estoque, negociação de mercadoria e fallback que reapresenta produto. Preservar as regras comuns de segurança, atendimento e escalação.
2. Criar busca de serviços filtrada por `item_kind` (uma tool própria `search_services` ou nome exposto por modo) e manter `search_products` para produtos. A execução deve validar modo e tenant também no backend, inclusive quando receber uma chamada de tool inesperada.
3. No modo serviço, `check_availability` e `book_appointment` recebem `service_id`; usam duração do serviço e só confirmam após verificar disponibilidade e confirmação do cliente. Sem serviço escolhido, pedem esclarecimento; não usam duração genérica nem inventam preço. Preservar o agendamento genérico do modo produto para visitas quando habilitado.
4. Ajustar guardrails e pós-processamento de `process-message.ts` (busca forçada, produto em foco, indicação de anúncios, autoenvio de foto e tratamento de resultados) para executar apenas no modo apropriado. Conferir também follow-ups e resumos que mencionem produto.

**Aceite:** conversas simuladas de ambos os modos usam apenas tools permitidas e não misturam discurso de produto com serviço; dois clientes não conseguem reservar o mesmo horário; duração e serviço persistidos correspondem à oferta selecionada.

### 5. Validação, migração dos clientes e publicação

**Validação local e migration do banco concluídas. Deploy e piloto ainda pendentes.**

1. Testar migration em cópia de banco, fluxo de onboarding dos dois modos, CRUD, isolamento por tenant, agenda manual e pela IA, conclusão e histórico. Cobrir regressões do atendimento de produtos, especialmente busca, anúncios e envio de imagens.
2. Publicar migration e código em ordem compatível, com backend e frontend aceitando tenants antigos durante a transição. Verificar logs de tool calls e falhas de reserva em tenants piloto.
3. Ativar primeiro em uma empresa de serviços piloto. Revisar manualmente seus itens existentes antes de classificá-los como serviços; depois ampliar o uso. Preparar reversão operacional para voltar a empresa ao modo produto sem perder registros, caso o piloto exponha falha.

**Aceite final:** super admin cria cada tipo; o owner só vê e configura o fluxo pertinente; a IA responde e agenda de acordo com o tipo; os clientes atuais de produtos não perdem cadastro, histórico ou comportamento existente.

## Ordem e dependências

`Dados e compatibilidade → Onboarding e admin → Painel e agenda → IA → Piloto e publicação`.

O ponto de maior risco é a **IA**: hoje o prompt e alguns guardrails de produto estão concentrados em `process-message.ts`. Essa separação merece implementação e testes específicos antes de ativar uma empresa de serviços. O segundo risco é assumir que “agenda por empresa” serve a negócios com vários profissionais; isso precisa ser comunicado como limite do primeiro lançamento.
