# Arquitetura — Mabres CRM

## Visão geral

Monorepo pnpm com três pacotes de execução e dois pacotes compartilhados:

- `apps/web` — Next.js 14 (App Router) + TypeScript + Tailwind. Dashboard autenticado,
  módulos de CRM, Server Actions para mutações internas, Route Handlers reservados
  para webhooks (não implementados nesta fase).
- `apps/worker` — processo Node.js separado, consome filas (BullMQ + Redis) e roda
  jobs agendados (ex.: notificação de tarefas vencidas). Contém as interfaces de
  integração externa (`src/providers`) e implementações **mock** — nenhuma chamada
  real a Meta/WhatsApp/Google/e-Móvel acontece nesta fase.
- `packages/db` — schema Prisma único, cliente compartilhado, seed.
- `packages/shared` — RBAC (catálogo de permissões), validação (Zod), motor de
  matching determinístico, deduplicação, formatação BRL/data, feature flags.

## Por que este desenho

- **RBAC configurável, não hardcoded**: `Role`/`Permission`/`RolePermission` são
  tabelas. O seed cria os papéis Administrador/Gestor/Corretor/Assistente com um
  conjunto padrão de permissões, mas o administrador pode alterar via painel
  (tela ainda não implementada — permissões já são editáveis diretamente no banco
  nesta fase).
- **Contact unificado**: leads e clientes são o mesmo registro (`Contact`), que
  evolui de etapa em etapa no funil. Evita duplicar cadastro quando um lead vira
  cliente.
- **Soft delete + auditoria**: entidades de negócio (`Contact`, `Property`, `Owner`,
  `Proposal`, `Contract`) têm `deletedAt`. Toda mutação relevante grava um
  `AuditLog` (ator, ação, antes/depois, IP, timestamp).
- **Integrações desligadas por padrão**: `FEATURE_META_LEAD_ADS`,
  `FEATURE_WHATSAPP_CLOUD_API`, `FEATURE_GOOGLE_OAUTH`,
  `FEATURE_EMOVEL_INTEGRATION` controlam se uma integração está pronta para ser
  ativada. Nesta fase todas são `false` e os providers em `apps/worker/src/providers`
  são mocks — a arquitetura está pronta, a ativação real é decisão futura e
  explícita.
- **Imóveis com fonte externa**: `Property.sourceSystem` e `Property.externalRef`
  guardam a origem (CRM ou e-Móvel) e o ID externo, para quando a sincronização
  com o e-Móvel Brokers for confirmada — sem sobrescrever o cadastro de lá.

## Diagrama de componentes

```
 Meta / WhatsApp / Google / e-Móvel (integrações reais - fases futuras)
                    │  (nenhuma chamada real nesta fase)
                    ▼
      apps/worker (mocks + jobs agendados: BullMQ + Redis)
                    │
                    ▼
      packages/db (Prisma) ── PostgreSQL
                    ▲
                    │
      apps/web (Next.js: dashboard, leads, auth, RBAC)
```

## Ambientes

- **Desenvolvimento**: local, Postgres/Redis locais ou em containers, `.env` com
  flags de integração desligadas.
- **Staging**: subdomínio gratuito da hospedagem (ex.: `*.vercel.app`), banco
  separado (branch do Neon ou instância própria), mesmas flags desligadas até
  serem testadas em sandbox.
- **Produção**: futuramente em `crm.mabresnegociosimobiliarios.com.br`, somente
  após Fase 2 (MVP) validada em staging.

## O que fica para as próximas entregas

- Telas de Imóveis, Proprietários, Visitas e Tarefas (schema e permissões já
  existem; interface ainda não).
- Tela de administração de papéis/permissões (hoje editável só via banco).
- Importação CSV (schema `ImportJob`/`ImportError` já existe).
- Webhooks reais de Meta/WhatsApp e OAuth real do Google (Fases 3-5).
