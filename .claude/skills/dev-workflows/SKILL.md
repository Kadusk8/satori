---
name: dev-workflows
description: Workflows e agentes especialistas recomendados do Antigravity Kit para este projeto (ZapAgent) — quais /workflows, @agentes e skills usar para cada tipo de tarefa. Use ao planejar features grandes, mudanças de schema, ou antes de deploy.
---

## Setup inicial

```bash
npx antigravity-kit init
```
Isso instala a pasta `.agent/` com agentes, skills e workflows.

Para usar com Claude Code, copiar os skills para `.claude/skills/` também.

## Workflows recomendados para este projeto

| Workflow | Quando usar |
|----------|-------------|
| `/plan` | Antes de iniciar qualquer feature nova — gera plano estruturado |
| `/create` | Scaffolding de novas features (detecta Next.js automaticamente) |
| `/debug` | Debugging sistemático com root cause analysis |
| `/test` | Gerar e rodar testes (Jest, Vitest, Playwright) |
| `/deploy` | Preparar e executar deploy (Vercel, Docker) |
| `/orchestrate` | Tasks complexas multi-domínio (frontend + backend + banco) |
| `/brainstorm` | Discovery e ideação de features |

## Agentes especialistas mais usados

| Agente | Uso neste projeto |
|--------|-------------------|
| `@frontend-specialist` | Componentes React, Next.js, Tailwind, shadcn |
| `@backend-specialist` | Edge functions, API design, integrations |
| `@database-architect` | Schema SQL, migrations, RLS policies, índices |
| `@security-auditor` | Revisar auth, RLS, sanitização, CORS |
| `@test-engineer` | Testes unitários e E2E |
| `@devops-engineer` | Docker, deploy, CI/CD |
| `@orchestrator` | Coordenar múltiplos agentes em tasks grandes |

## Skills mais relevantes

| Skill | Contexto |
|-------|----------|
| `nextjs-react-expert` | Patterns do App Router, RSC, Server Actions |
| `tailwind-patterns` | Estilização consistente |
| `api-patterns` | Design de APIs RESTful, error handling |
| `database-design` | Normalização, índices, constraints |
| `testing-patterns` | Estrutura de testes, mocking, assertions |
| `systematic-debugging` | Processo de debugging estruturado |
| `security-checklist` | Checklist de segurança pré-deploy |
| `deployment-procedures` | Processo de deploy seguro |
