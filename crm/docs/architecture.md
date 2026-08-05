# Arquitetura — Mabres CRM

Atualizado ao final do Marco 1 (Sprint 8 — homologação). Substitui a versão
anterior deste documento, que ainda descrevia planos de sprints iniciais
(algumas telas listadas como pendentes já foram entregues; a seção de
ambientes de staging/produção foi reescrita para refletir a decisão real
tomada no Sprint 7).

## Visão geral

Monorepo pnpm com três pacotes de execução e dois pacotes compartilhados:

- `apps/web` — Next.js 14 (App Router) + TypeScript + Tailwind. Dashboard
  autenticado, todos os módulos do CRM, Server Actions para mutações,
  `GET /api/health` como único Route Handler HTTP além do NextAuth.
- `apps/worker` — processo Node.js separado, consome filas (BullMQ + Redis)
  e roda os jobs agendados (notificação de tarefas vencidas/visitas
  próximas). Contém as interfaces de integração externa (`src/providers`) e
  implementações **mock** — nenhuma chamada real a Meta/WhatsApp/Google/
  e-Móvel acontece nesta fase.
- `packages/db` — schema Prisma único (41 modelos), cliente compartilhado, seed.
- `packages/shared` — RBAC (catálogo de 70 permissões), validação (Zod),
  motor de matching determinístico, deduplicação, criptografia de campo
  (AES-256-GCM), formatação BRL/data (America/Sao_Paulo).

## Árvore de módulos

```
crm/
├── apps/
│   ├── web/                      # Next.js — UI, Server Actions, auth
│   │   ├── app/
│   │   │   ├── (app)/            # rotas autenticadas (dashboard, leads,
│   │   │   │                     # properties, owners, visits, tasks,
│   │   │   │                     # imports, admin/*, profile)
│   │   │   ├── api/               # /api/auth/[...nextauth], /api/health
│   │   │   ├── login/, change-password/
│   │   ├── components/           # componentes de UI compartilhados
│   │   ├── lib/                  # *-service.ts (regra de negócio), auth,
│   │   │                         # rate-limit, redis, session, etc.
│   │   ├── e2e/                  # suíte Playwright (11 arquivos, 86 testes)
│   │   ├── instrumentation.ts    # init opcional do Sentry (SENTRY_DSN)
│   │   ├── middleware.ts         # sessão + rotas públicas
│   │   └── Dockerfile
│   └── worker/                   # Node.js — BullMQ, jobs, providers mock
│       ├── src/jobs/              # overdue-tasks, upcoming-visits
│       ├── src/providers/         # meta/whatsapp/google/emovel (mock)
│       └── Dockerfile
├── packages/
│   ├── db/                       # schema.prisma, migrations, seed, audit
│   └── shared/                   # RBAC, validação, matching, dedup, crypto
├── infra/                        # Docker Compose, Caddyfile, scripts,
│   │                             # .env.*.example (Sprint 7)
│   └── scripts/                  # deploy.sh, backup-postgres.sh, restore-postgres.sh
├── docs/
│   ├── decisions/                # ADRs (0001 stack, 0002 infraestrutura)
│   ├── ops/                      # deploy/update/rollback/backup/restore/
│   │                             # disaster-recovery/troubleshooting/
│   │                             # branch-protection/production-checklist
│   └── ...                       # matching-algorithm, csv-import, etc.
└── .dockerignore, pnpm-workspace.yaml, tsconfig.base.json
```

## Por que este desenho

- **RBAC configurável, não hardcoded**: `Role`/`Permission`/`RolePermission`
  são tabelas, editáveis pelo administrador em `/admin/roles` (Fase 1.5).
  70 permissões cobrem todos os domínios, incluindo os que ainda não têm UI
  (propostas, comissões) — prontas para quando esses módulos forem
  construídos, sem precisar de nova migration de permissões.
- **Contact unificado**: leads e clientes são o mesmo registro (`Contact`),
  que evolui de etapa em etapa no funil (`PipelineStage`, configurável).
- **Soft delete + auditoria**: entidades de negócio (`Contact`, `Property`,
  `Owner`, `Proposal`, `Contract`, `User`) têm `deletedAt`. Toda mutação
  relevante grava um `AuditLog` (ator, ação, antes/depois redigido, IP,
  timestamp) — `redactSensitiveFields()` mascara campos sensíveis por nome e
  converte tipos não-JSON-simples (`Decimal`, `Date`) via `toJSON()`
  automaticamente (correção do Sprint 8).
- **Integrações desligadas por padrão**: `FEATURE_META_LEAD_ADS`,
  `FEATURE_WHATSAPP_CLOUD_API`, `FEATURE_GOOGLE_OAUTH`,
  `FEATURE_EMOVEL_INTEGRATION` controlam se uma integração está pronta para
  ser ativada. Todas `false` nesta fase; os providers em
  `apps/worker/src/providers` são mocks — a arquitetura está pronta, a
  ativação real é decisão futura e explícita (Marco 2+).
- **Imóveis com fonte externa**: `Property.sourceSystem` e
  `Property.externalRef` guardam a origem (CRM ou e-Móvel) e o ID externo,
  para quando a sincronização com o e-Móvel Brokers for confirmada.

## Diagrama de componentes

```
 Meta / WhatsApp / Google / e-Móvel (integrações reais - Marco 2+)
                    │  (nenhuma chamada real nesta fase)
                    ▼
      apps/worker (mocks + jobs agendados: BullMQ + Redis)
                    │
                    ▼
      packages/db (Prisma) ── PostgreSQL
                    ▲
                    │
      apps/web (Next.js: dashboard, todos os módulos, auth, RBAC)
                    │
                    ▼
      Caddy (reverse proxy + TLS automático) ── produção/staging
```

## Infraestrutura e ambientes (decisão do Sprint 7 — ADR 0002)

- **Desenvolvimento**: local, Postgres/Redis locais, `.env` com flags de
  integração desligadas.
- **Staging e produção**: um VPS único, dois stacks Docker Compose
  isolados (nome de projeto + `.env` próprios — nunca compartilham banco),
  Caddy como reverse proxy com TLS automático (Let's Encrypt). Detalhes
  completos e justificativa em
  [`docs/decisions/0002-infraestrutura-deploy.md`](./decisions/0002-infraestrutura-deploy.md)
  e nos guias em [`docs/ops/`](./ops/deploy.md).
- Nenhum VPS/domínio real está provisionado ainda — toda a infraestrutura
  (Dockerfiles, Compose, scripts de deploy/backup/restore, documentação
  operacional) está pronta e versionada, aguardando as credenciais reais
  (ver o relatório do Sprint 7 e o relatório final do Sprint 8 na PR #1 para
  a lista exata do que falta).

## O que fica para o Marco 2

Propostas, Contratos, Comissões, Documentos, Kanban visual, IA, e as
integrações reais (WhatsApp Business API, Google OAuth, e-Móvel Brokers,
Meta Lead Ads). Todo o schema de dados para essas áreas já existe
(`Proposal`, `Contract`, `Commission*`, `Automation*`, `IntegrationAccount`,
`GoogleAccount`, `WebhookEvent`) — nenhuma dessas funcionalidades foi
iniciada durante o Marco 1 (Sprints 1-8), incluindo o Sprint 8, que é
exclusivamente homologação e documentação.
