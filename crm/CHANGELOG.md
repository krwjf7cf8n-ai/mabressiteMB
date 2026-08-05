# CHANGELOG — Mabres CRM

Consolidado ao final do Marco 1 (Sprint 8). Agrupado por sprint, na ordem em
que foi entregue — este projeto não usa versionamento semântico de pacote
ainda (produto interno, sem release pública), então as entradas seguem a
numeração de sprint/fase usada durante o desenvolvimento.

## Sprint 8 — Homologação, Go-Live e encerramento do Marco 1

- Homologação completa: checklist funcional (21 fluxos), operacional,
  segurança e qualidade re-executados do zero.
- **Bug crítico corrigido**: `AuditLog` descartava silenciosamente a entrada
  de auditoria de toda atualização de preço/status de imóvel
  (`Prisma.Decimal` não serializável em `before`/`after`) — corrigido na
  raiz em `redactSensitiveFields()`.
- **Bug crítico corrigido**: o pipeline de CI nunca passava de verdade no
  GitHub Actions — três jobs falhavam consistentemente por falta de
  `REDIS_URL`/serviço Redis e por um diff de três pontos incompatível com
  checkout raso ("no merge base").
- Cobertura E2E nova para dois fluxos sem teste (funcionavam, mas nunca
  tinham sido validados pela UI): CRUD de Proprietários e Logout.
- Documentação final: este CHANGELOG, Release Notes do Marco 1,
  `docs/architecture.md` atualizado, `docs/marco-1-inventario.md`.

## Sprint 7 — Infraestrutura, Deploy e Operação

- ADR 0002: arquitetura de hospedagem (VPS único, dois stacks Docker Compose
  isolados para staging/produção, Caddy com TLS automático).
- Dockerfiles de produção para `apps/web` e `apps/worker`.
- `GET /api/health` (healthcheck real, verifica conexão com o banco).
- Docker Compose completo (Postgres, Redis, job de migration one-shot, web,
  worker, Caddy), com startup ordenado e restart policies.
- Scripts operacionais: `deploy.sh`, `backup-postgres.sh`, `restore-postgres.sh`.
- Monitoramento: Sentry opcional (`SENTRY_DSN`), rotação de log no Docker.
- Documentação operacional completa (`docs/ops/`: deploy, update, rollback,
  backup, restore, disaster recovery, checklist de produção, branch
  protection, troubleshooting).
- **Bug corrigido**: o worker nunca teria iniciado em produção
  (`node dist/index.js` não resolve os pacotes de workspace em TypeScript) —
  corrigido rodando via `tsx`, mesmo mecanismo já usado em `dev`.

## Sprint 6 — Melhorias de gestão e acabamento de experiência

- Dashboard clicável (cards levam à listagem já filtrada).
- Administração das etapas do funil (`/admin/stages`).
- Reorganização das telas administrativas.
- Tradução de enums/status técnicos exibidos ao usuário.
- Preservação de dados digitados em erro de validação (imóveis).
- Estado ativo no menu de navegação.
- Indicador visual de fases na importação (stepper).
- Compartilhamento de resultados do Matching (copiar/WhatsApp).
- Estados de carregamento consolidados (`SubmitButton`).

## Sprint 5 — Performance

- Otimização do Matching (pré-filtro, gravação em lote, loading no recálculo).
- Paralelização de consultas independentes (`Promise.all`).
- Teste de carga real da importação (até 5.000 linhas).

## Sprint 4 — Segurança e integridade de dados

- Criptografia de campos sensíveis fortalecida (AES-256-GCM, versionada).
- Migration consolidando `Property.status` em enum + índice em `Contact.firstContactAt`.
- Guard append-only expandido para todos os modelos históricos.
- Redação automática de campos sensíveis no `AuditLog`.
- Normalização de e-mail para minúsculas.
- Detecção de proprietário duplicado (mesmo padrão de `Contact`).
- Rate limiting no login via Redis (5 tentativas / 15 min, fail-open).
- Hardenings de segurança pontuais (headers, CSP, sanitização, callback).
- Documentação do padrão seguro de migrations.

## Sprint 3 — Extração de service layer e cobertura de testes

- Lógica de negócio extraída das Server Actions para `lib/*-service.ts`
  (leads, imóveis, tarefas, visitas).
- Suíte Playwright expandida cobrindo os fluxos de mutação tocados.
- Testes de autenticação negativa, integração real com Redis/BullMQ, guard
  anti-`.only`.

## Marco 1.9 — Auditorias e correção de escopo/IDOR

- 8 auditorias completas: arquitetura, banco de dados, segurança da
  aplicação, performance, qualidade de código, testes/confiabilidade,
  deploy/infraestrutura (avaliação inicial), experiência operacional.
- Correção emergencial de supply chain e segredos.
- Correção de escopo por dono/responsável (leads, visitas, tarefas) e IDOR;
  checagem de permissão em páginas administrativas.
- Menu mobile responsivo; tabelas responsivas.
- Busca e paginação (Leads e demais listagens).
- Contexto operacional no detalhe (último contato, tarefas/visitas relacionadas).
- Sino de notificações; follow-up automático ao cadastrar lead; card de
  leads parados no dashboard; filtros rápidos de tarefas (hoje/atrasadas).

## Fases 1.1 – 1.5 — Módulos do MVP

- **1.1 — Imóveis e Proprietários**: schema, CRUD, telas.
- **1.2 — Matching**: motor determinístico cliente↔imóvel na interface.
- **1.3 — Visitas e Tarefas**: máquina de estados, conflito de agenda,
  concorrência otimista, timeline via `AuditLog`, notificações, dashboard.
- **1.4 — Importação CSV**: upload, mapeamento, validação, resolução de
  duplicidade, execução em lote, rollback, relatório de erros.
- **1.5 — Administração**: usuários, papéis/permissões, gestão de sessões,
  reatribuição de registros.

## Fase 1 (inicial) — Arquitetura e início do MVP

- Monorepo pnpm (`apps/web`, `apps/worker`, `packages/db`, `packages/shared`).
- Schema Prisma completo (todos os módulos do briefing, mesmo os que ainda
  não têm UI).
- Autenticação com RBAC configurável em tabela.
- Dashboard com métricas reais.
- Módulo de Leads/Clientes ponta a ponta (cadastro, dedup, funil, auditoria).
- CI (GitHub Actions): lint, typecheck, testes, migrations, build,
  verificação de segredos.
