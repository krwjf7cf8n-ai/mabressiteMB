# Marco 1 — Inventário técnico completo

Sprint 8 (homologação). Fotografia do estado do sistema ao final do Marco 1
— gerada a partir do código-fonte real (schema, catálogo de permissões,
rotas, testes), não de memória/estimativa.

## 1. Funcionalidades implementadas

| Módulo | Status | Onde |
|---|---|---|
| Autenticação (login/logout, sessão JWT revogável, troca de senha obrigatória) | Completo | `apps/web/lib/auth.ts`, `apps/web/middleware.ts` |
| RBAC configurável (papéis/permissões em tabela, tela de administração) | Completo | `/admin/roles`, `packages/shared/src/permissions/` |
| Leads/Clientes (`Contact`) — CRUD, funil com histórico, dedup, LGPD | Completo | `/leads`, `apps/web/lib/lead-service.ts` |
| Imóveis (`Property`) — CRUD, histórico de preço/status | Completo | `/properties`, `apps/web/lib/property-service.ts` |
| Proprietários (`Owner`) — CRUD, dedup | Completo | `/owners`, `apps/web/app/(app)/owners/actions.ts` |
| Matching cliente↔imóvel (determinístico, versionado, auditável) | Completo | `packages/shared/src/matching.ts`, `apps/web/lib/matching-service.ts` |
| Visitas — agendamento, conflito de agenda, reagendamento, resultado | Completo | `/visits`, `apps/web/lib/visit-service.ts` |
| Tarefas — CRUD, conclusão/cancelamento/reabertura, follow-up automático | Completo | `/tasks`, `apps/web/lib/task-service.ts` |
| Dashboard (métricas reais, cards clicáveis) | Completo | `/dashboard`, `apps/web/lib/dashboard-service.ts` |
| Notificações internas (idempotentes, sino no header) | Completo | `apps/web/lib/notification-service.ts` |
| Importação CSV de leads/clientes (mapeamento, validação, rollback) | Completo | `/imports`, `apps/web/lib/import-service.ts` |
| Administração de usuários/papéis/etapas do funil | Completo | `/admin/users`, `/admin/roles`, `/admin/stages` |
| Auditoria (`AuditLog` append-only, redação automática de campos sensíveis) | Completo | `packages/db/src/audit.ts` |
| Busca e paginação (Leads) | Completo | `apps/web/lib/list-query.ts` |
| Compartilhamento de resultado de Matching (copiar/WhatsApp `wa.me`) | Completo | `apps/web/components/share-match-results.tsx` |
| Mobile (menu responsivo, tabelas com scroll) | Completo | `apps/web/components/mobile-nav.tsx` |
| Healthcheck HTTP | Completo | `GET /api/health` |
| Infraestrutura de deploy (Docker Compose, backup/restore, monitoramento) | Completo (estrutura; depende de VPS/domínio reais) | `infra/`, `docs/ops/` |
| Propostas, Contratos, Comissões, Documentos, Kanban, IA, WhatsApp/Google/e-Móvel reais | **Não iniciado** (fora do escopo do Marco 1) | Schema pronto (`Proposal`, `Contract`, `Commission*`), providers mock em `apps/worker/src/providers/` |

## 2. Inventário de testes automatizados

| Suíte | Arquivos | Testes | Observação |
|---|---|---|---|
| Vitest — `packages/shared` | 15 | 174 | lógica pura (matching, dedup, validação, RBAC, criptografia, CSV) |
| Vitest — `apps/worker` | 5 | 15 | jobs, providers mock, integração real BullMQ/Redis |
| Vitest — `apps/web` | 20 | 146 (145 + 1 skipped) | integração real com Postgres (`lib/*-service.ts`) |
| **Vitest total** | **40** | **335 (334 passed + 1 skipped)** | banco/Redis reais, não mocks |
| Playwright E2E | 11 | 86 | contra build de produção real (`next build` + `next start`) |
| **Total geral** | **51 arquivos** | **421 (420 passed + 1 skipped)** | |

Especificações E2E (`apps/web/e2e/`):
`auth-security-flows`, `g23-hardening`, `g3-service-layer-flows`,
`g30-dashboard-and-admin`, `g31-import-stepper`, `g31-share-matching`,
`g8-homologacao-lacunas`, `infra-healthcheck`, `mobile-and-operational`,
`notifications-and-daily-management`, `scope-and-access-control`.

O único teste pulado (`lib/import-load.test.ts`) é o teste de carga de
importação (G13, Sprint 5) — roda sob demanda, não no CI padrão, por ser
custoso (milhares de linhas simuladas); documentado em
`docs/import-load-test.md`.

## 3. Inventário de endpoints HTTP

| Rota | Método | Autenticação | Descrição |
|---|---|---|---|
| `/api/auth/[...nextauth]` | GET/POST | Pública | NextAuth (login/callback/sessão) |
| `/api/health` | GET | Pública | Healthcheck (verifica conexão com o banco) |
| `/(app)/imports/[id]/errors` | GET | Autenticada (`imports:view`) | Exporta erros de uma importação em CSV |

Todas as demais páginas (`/dashboard`, `/leads`, `/properties`, `/owners`,
`/visits`, `/tasks`, `/imports`, `/admin/*`, `/profile`) são rotas do App
Router protegidas pelo middleware — mutações acontecem via Server Actions
(`actions.ts` em cada diretório de rota), não endpoints REST separados.

## 4. Inventário de tabelas (schema Prisma)

41 modelos, agrupados por domínio:

**Acesso e RBAC (5):** `Role`, `Permission`, `RolePermission`, `User`, `UserSession`

**Funil e CRM (7):** `PipelineStage`, `Contact`, `ContactTag`, `ContactPreference`, `ContactFinancialInfo`, `ContactStageHistory`, `ConsentRecord`

**Imóveis (7):** `Property`, `PropertyPhoto`, `PropertyDocument`, `PropertyPriceHistory`, `PropertyStatusHistory`, `Owner`, `PropertyOwner`

**Matching (1):** `Match`

**Atividades (3):** `Visit`, `VisitEvent`, `Task`

**Comercial — schema pronto, Marco 2 (6):** `Proposal`, `ProposalVersion`, `Contract`, `Commission`, `CommissionSplit`, `FinancingChecklistItem`

**Automação/integração — schema pronto, Marco 2 (6):** `Automation`, `AutomationRun`, `AutomationLog`, `IntegrationAccount`, `GoogleAccount`, `WebhookEvent`

**Governança (6):** `AuditLog`, `AiUsageLog`, `Notification`, `ImportJob`, `ImportRow`, `OrgSetting`

12 migrations aplicadas, zero drift confirmado (`prisma migrate diff --exit-code`) na validação final deste sprint.

## 5. Inventário de permissões (RBAC)

70 permissões em 15 domínios: `usuarios`, `papeis`, `auditoria`,
`configuracoes`, `integracoes`, `leads`, `imoveis`, `proprietarios`,
`matching`, `visitas`, `tarefas`, `propostas`, `financeiro`, `relatorios`,
`automacoes`, `importacoes`.

4 papéis seedados (todos editáveis pelo administrador em `/admin/roles`):
- **Administrador** — todas as permissões (`"*"`), protegido pela regra do
  último administrador (não pode ser removido/desativado se for o único ativo).
- **Gestor** — visão de equipe (`*_view_all`), sem permissões críticas de
  usuários/papéis além de leitura.
- **Corretor** — escopo próprio (`*_view_own`), CRUD operacional do dia a dia.
- **Assistente** — leitura ampla, sem mutações críticas nem dados financeiros.

Catálogo completo em `packages/shared/src/permissions/catalog.ts`; defaults
por papel em `packages/shared/src/permissions/role-defaults.ts`.

## 6. Inventário de automações

Automação real (roda hoje, produção):

| Job | Intervalo | O que faz |
|---|---|---|
| `check-overdue-tasks` | 15 min | Cria notificação para tarefas vencidas não concluídas |
| `check-upcoming-visits` | 10 min | Cria notificação para visitas próximas |

Automação "criada implicitamente pelo sistema" (não é um job agendado, é
lógica de domínio):
- Follow-up automático — cadastrar um lead cria uma tarefa "Primeiro contato".

Automação **schema-pronta, não implementada** (Marco 2): tabelas
`Automation`/`AutomationRun`/`AutomationLog` existem para automações
configuráveis pelo usuário (gatilho → ação) — nenhuma UI ou motor de
execução genérico existe ainda; os dois jobs acima são código fixo, não
automações configuráveis.

## 7. Inventário de workers/processos

| Processo | Tecnologia | Responsabilidade |
|---|---|---|
| `apps/web` | Next.js (`next start`) | UI, Server Actions, NextAuth, `/api/health` |
| `apps/worker` | Node.js + BullMQ + Redis | Jobs agendados (tabela acima), graceful shutdown via `SIGTERM` |

Providers mock em `apps/worker/src/providers/` (nenhuma chamada externa
real): `meta.mock.ts`, `whatsapp.mock.ts`, `google.mock.ts`,
`emovel.mock.ts` — interfaces prontas para quando as integrações reais
forem autorizadas (Marco 2+), todas atrás de feature flags `false`.

## 8. Inventário de scripts operacionais

| Script | Uso |
|---|---|
| `infra/scripts/deploy.sh` | Pipeline de deploy (build → migrate → seed opcional → sobe serviços → aguarda healthcheck) |
| `infra/scripts/backup-postgres.sh` | Backup agendável via cron (`pg_dump` comprimido, retenção configurável) |
| `infra/scripts/restore-postgres.sh` | Restaura um backup (com confirmação manual obrigatória) |
| `pnpm db:generate` / `db:migrate` / `db:seed` | Scripts de workspace (`packages/db`) |
| `pnpm lint` / `typecheck` / `test` / `build` | Scripts de qualidade (workspace raiz, agregam todos os pacotes) |

Documentação de uso de cada um em `docs/ops/deploy.md`, `docs/ops/backup.md`
e `docs/ops/restore.md`.
