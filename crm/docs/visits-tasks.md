# Visitas e Tarefas (Fase 1.3)

## Princípio geral

Visitas e tarefas são módulos relacionados, mas independentes:

- `Task.visitId` é opcional — uma tarefa não precisa de visita.
- `Visit` nunca depende da existência de uma `Task` para ser consultada, editada
  ou ter seu status mudado — todas as queries e regras de domínio de `Visit`
  operam sem tocar em `Task`.
- Criação de tarefas/lembretes automáticos relacionados a uma visita roda
  **fora** da transação que cria/atualiza a visita (`apps/web/lib/visit-service.ts`,
  chamado em `try/catch` nos server actions). Se a criação da tarefa falhar, a
  visita já persistida não é revertida — só fica registrado um erro no log do
  servidor.
- Mudanças que precisam permanecer consistentes entre si (ex.: `Visit` +
  `VisitEvent`, transições de status, reagendamento, correção excepcional)
  rodam dentro de `prisma.$transaction` em `apps/web/app/(app)/visits/actions.ts`.
- Nenhuma integração externa (Google Calendar, WhatsApp, SMS, e-mail,
  assinatura eletrônica) está ativa — só providers mock (`apps/worker/src/providers`)
  e notificações internas (`Notification`).

## Linha do tempo de visitas (`VisitEvent`) — append-only

`VisitStatusHistory` foi substituída por `VisitEvent`: uma tabela genérica de
eventos, não amarrada a "status anterior/status novo". Cada linha registra
`eventType`, `previousData`/`newData` (JSON livre — o que fizer sentido para
aquele tipo de evento), `reason`, `createdByUserId`, `source` e `createdAt`.

Tipos de evento: `CREATED`, `STATUS_CHANGED`, `RESCHEDULED`,
`ASSIGNEE_CHANGED`, `CLIENT_CHANGED`, `PROPERTY_CHANGED`,
`CONFLICT_OVERRIDDEN`, `RESULT_RECORDED`, `CANCELLED`, `CORRECTED_BY_ADMIN`.

**Append-only de verdade, não só por convenção**: `packages/db/src/index.ts`
registra um middleware `prisma.$use` que intercepta qualquer `update`,
`updateMany`, `delete`, `deleteMany` ou `upsert` no model `VisitEvent` e
lança erro antes de chegar ao banco. A única forma de "apagar" eventos é via
cascade delete da `Visit` pai (ex.: rotina de limpeza de dados de teste).
Coberto por teste de integração em `apps/web/lib/visit-service.test.ts`
("VisitEvent é append-only") e verificado manualmente via E2E.

A interface (`apps/web/app/(app)/visits/[id]/page.tsx`) renderiza a linha do
tempo com um diff genérico campo a campo (`apps/web/lib/audit-diff.ts`,
`describeJsonDiff`) — não depende de `previousData`/`newData` terem um
formato fixo por tipo de evento.

`Visit` propriamente dita **não guarda mais nenhum dado histórico redundante**
(sem `previousScheduledAt`, `previousBrokerUserId` etc.) — o registro só
representa o estado atual; qualquer "o que era antes" vive exclusivamente em
`VisitEvent`.

## Concorrência otimista

Toda mutação de `Visit` (mudança de status, reagendamento, registro de
resultado, reatribuição de corretor) exige um campo `expectedUpdatedAt`
enviado pelo formulário (populado com `visit.updatedAt` no momento em que a
página foi renderizada) e usa `updateMany({ where: { id, updatedAt:
expectedUpdatedAt }, ... })` dentro da transação. Se `count === 0`, outra
escrita já alterou o registro nesse meio tempo — o helper
`updateVisitOptimistically` (em `apps/web/app/(app)/visits/actions.ts`) lança
`ConcurrencyConflictError` (`packages/db/src/concurrency.ts`), a transação é
revertida e o usuário é redirecionado de volta com a mensagem "Esta visita
foi alterada por outra pessoa nesse meio tempo. Recarregue a página e tente
novamente." — nunca sobrescreve silenciosamente.

Verificado tanto por teste de integração (`visit-service.test.ts`, simulando
diretamente `updateMany` com versão obsoleta vs. atual) quanto por E2E real:
duas submissões concorrentes na mesma visita, a segunda com
`expectedUpdatedAt` desatualizado, recebe o erro e nada é sobrescrito; ao
recarregar a página e tentar de novo, a ação é aceita normalmente.

`Visit.updatedAt` acumula portanto dois papéis: timestamp de auditoria padrão
e marcador de versão para controle de concorrência otimista — documentado
como comentário no schema Prisma.

## Intervalos de horário: `[início, fim)` e fuso horário

Toda data/hora é persistida em UTC no banco (`DateTime` do Prisma/Postgres) e
só convertida para `America/Sao_Paulo` na camada de apresentação
(`formatDateTimeSaoPaulo`, `packages/shared`). Nenhuma lógica de domínio
compara ou soma horários em fuso local.

`findVisitConflicts` (`packages/shared/src/visit-domain.ts`) trata cada
visita como o intervalo semiaberto `[scheduledAt, scheduledAt +
durationMinutes)`: a comparação de sobreposição é `aStart < bEnd && bStart <
aEnd`, então uma visita que termina exatamente às 15h **não** conflita com
outra que começa às 15h — mas 1 minuto de sobreposição já conflita. Coberto
por teste dedicado em `packages/shared/src/visit-domain.test.ts`.

## Máquina de estados da visita

Implementada em `packages/shared/src/visit-domain.ts` (`canTransitionVisit`),
não escondida na interface — os server actions em `apps/web/app/(app)/visits/actions.ts`
chamam a mesma função antes de qualquer mudança de status.

```
AGUARDANDO_CONFIRMACAO → CONFIRMADA, REAGENDADA, CANCELADA_CLIENTE,
                          CANCELADA_CORRETOR, PROPRIETARIO_INDISPONIVEL

CONFIRMADA              → REALIZADA, REAGENDADA, CANCELADA_CLIENTE,
                          CANCELADA_CORRETOR, CLIENTE_NAO_COMPARECEU,
                          PROPRIETARIO_INDISPONIVEL

REAGENDADA               → CONFIRMADA, AGUARDANDO_CONFIRMACAO,
                          CANCELADA_CLIENTE, CANCELADA_CORRETOR

CLIENTE_NAO_COMPARECEU   → REAGENDADA, CANCELADA_CORRETOR
PROPRIETARIO_INDISPONIVEL → REAGENDADA, CANCELADA_CORRETOR

REALIZADA, CANCELADA_CLIENTE, CANCELADA_CORRETOR → (terminais — sem transição livre)
```

**Correção excepcional**: sair de um estado terminal só é permitido com
`allowException: true`, que por sua vez só é aceito pelo server action quando
o usuário tem a permissão `visits:override_conflict` **e** preenche uma
justificativa obrigatória. Toda correção excepcional gera `AuditLog` com ação
`status_override` (distinta de `status_change` normal).

## Conflitos de agenda

`packages/shared/src/visit-domain.ts` (`findVisitConflicts`) compara a visita
candidata contra visitas existentes num raio de 24h antes/depois
(`apps/web/lib/visit-service.ts`), verificando sobreposição de horário
(início + `durationMinutes`) para o mesmo corretor, cliente ou imóvel, com um
intervalo mínimo de 15 minutos de margem. Só considera conflitantes visitas em
status ativo (`AGUARDANDO_CONFIRMACAO`, `CONFIRMADA`, `REAGENDADA`) —
canceladas e realizadas nunca bloqueiam.

Conflito **não bloqueia automaticamente**: gera aviso na tela de
agendamento/reagendamento. Confirmar mesmo com conflito exige a permissão
`visits:override_conflict` **e** uma justificativa de texto obrigatória,
registrada em `Visit.scheduleConflictNote` e como `AuditLog` (`schedule_conflict_confirmed`).

Mesma regra vale para imóvel inativo: agendar visita em imóvel que não está
com status `"ativo"` exige a mesma permissão + justificativa.

## Preparação para confirmação eletrônica futura (não implementada)

`Visit` **não** tem campos como `signed`, `token` ou `hash` — de propósito.
A visita já tem tudo que uma extensão futura precisaria: identificador estável
(`id`), relacionamento claro com `Contact`, `Property`, `User` (corretor) e
histórico completo de alterações (`VisitEvent`). Quando confirmação
eletrônica, QR Code, assinatura ou trilha de evidências forem implementados,
devem ser uma entidade própria (ex.: `VisitConfirmation`) relacionada a
`Visit` por `visitId`, não campos soltos na tabela de visitas.

## Tarefas automáticas geradas por visitas

Implementadas como serviços de domínio explícitos
(`apps/web/lib/visit-service.ts`), **não** pelo construtor de automações geral
— preparadas para migração posterior ao módulo de automações (Fase futura).

- **Ao criar visita** (opcional, checkbox no formulário): cria tarefa
  `confirmar_visita` com `origin = VISITA`, idempotente por
  `(visitId, taskType, origin)` — `ensureAutomaticVisitTask` verifica
  existência antes de criar.
- **Ao marcar como realizada**: opcionalmente cria tarefa `retornar_apos_visita`,
  mesma idempotência.
- **Ao reagendar**: `rescheduleAutomaticVisitTasks` atualiza o `dueAt` das
  tarefas automáticas (`origin = VISITA`) ainda pendentes/em andamento — nunca
  mexe em tarefas já concluídas ou canceladas, nunca duplica.
- **Ao cancelar**: `cancelAutomaticVisitTasks` cancela só as tarefas
  automáticas pendentes daquela visita, preservando qualquer tarefa manual
  relacionada.

## Idempotência

- Tarefas automáticas: chave lógica `(visitId, taskType, origin=VISITA)`,
  checada antes do `create` (`ensureAutomaticVisitTask`).
- Notificações: `Notification.idempotencyKey` é `@unique` no banco —
  `createNotificationIdempotent` (`packages/db/src/notifications.ts`) tenta
  criar e trata a violação de constraint (`P2002`) como "já existe", sem
  duplicar. Chaves usadas: `task_overdue:{taskId}:{yyyy-mm-dd}` (uma por
  tarefa/dia), `visit_upcoming:{visitId}` (uma por visita), `visit_rescheduled:{visitId}:{novoHorarioISO}`,
  `visit_reassigned:...`, `task_reassigned:...`.
- A garantia central é a constraint única do Postgres, não só verificação em
  memória — protege contra corrida entre requisições concorrentes e reenvio
  de formulário.

## Notificações internas

`apps/worker` roda dois jobs agendados (BullMQ):

- `check-overdue-tasks` (a cada 15 min): tarefas vencidas, uma notificação por
  tarefa/dia.
- `check-upcoming-visits` (a cada 10 min): visitas ativas nos próximos 60 min,
  uma notificação por visita (não repete a cada execução do job, graças à
  chave de idempotência estável `visit_upcoming:{visitId}`).

Reagendamento e mudança de responsável (visita ou tarefa) notificam o
corretor/responsável no momento da ação (dentro do server action), não via
job periódico — são eventos, não algo para "descobrir" depois.

## Permissões (aplicadas no servidor)

| Recurso | Permissões |
|---|---|
| Visitas | `visits:view` (próprias), `visits:view_all` (equipe), `visits:create`, `visits:update`, `visits:cancel`, `visits:reassign`, `visits:override_conflict` |
| Tarefas | `tasks:view` (próprias), `tasks:view_all` (equipe), `tasks:create`, `tasks:update`, `tasks:complete`, `tasks:cancel`, `tasks:reassign` |

Escopo padrão (`apps/web/lib/session.ts`): sem `visits:view_all`/`tasks:view_all`,
toda consulta é filtrada por `brokerUserId`/`assignedUserId` do usuário logado
— aplicado na query do servidor, nunca só escondido na UI. Concluir uma
tarefa atribuída a outro usuário exige `tasks:view_all`.

## Auditoria

Toda mutação relevante grava `AuditLog` (`entityType`, `action`, ator,
antes/depois): criação, atualização, cancelamento, reagendamento (com data
anterior), mudança de status, resultado da visita, mudança de responsável,
conflito confirmado, correção excepcional, conclusão e cancelamento de
tarefa. Nenhum dado sensível (documentos completos, dados bancários) é
gravado nos logs.

### Linha do tempo de tarefas (via `AuditLog`, sem tabela nova)

Diferente de `Visit`, `Task` não ganhou uma tabela de eventos própria — o
histórico é reconstruído a partir do `AuditLog` já existente
(`entityType = "Task"`), que **permite reconstrução completa da linha do
tempo**: status antes/depois, responsável antes/depois, prazo antes/depois,
conclusão, reabertura, cancelamento (com motivo), origem e ator, todos com
timestamp. `apps/web/app/(app)/tasks/[id]/page.tsx` renderiza cada entrada
com um rótulo em PT-BR (`TASK_AUDIT_ACTION_LABELS`) e o mesmo diff genérico
`describeJsonDiff` usado na timeline de visitas — verificado via E2E real
(criar → concluir → reabrir tarefa, conferindo que cada transição aparece
com before/after legível). Não ficou como dívida técnica: o `AuditLog`
atende ao requisito sem precisar de um `TaskEvent` separado.

## Exclusão

Não há exclusão física de `Visit` nem `Task` nesta fase — só os status
`CANCELADA*`/`CANCELADA`. Uma visita `REALIZADA` não tem botão de exclusão em
lugar nenhum da interface.

## Limitações conhecidas

- Não há visão de calendário com arraste (drag-and-drop) — a agenda é lista
  cronológica com filtros de período (hoje/semana/próximas/todas), suficiente
  para o volume do MVP.
- Tipos de tarefa continuam como lista fixa (`TASK_TYPE_OPTIONS` em
  `packages/shared/src/validators.ts`), não uma tabela configurável — mesma
  decisão já tomada para `TaskStatus`/`VisitStatus` na Fase 1.
- `recurrenceRule` existe no schema mas não é executado (recorrência
  preparada, não implementada).
- `Task.proposalId` existe no schema, sem relação obrigatória — preparado
  para a fase de Propostas.
- Conflito de agenda é calculado num raio fixo de ±24h em torno do horário
  candidato — suficiente para o volume atual; se o volume de visitas por
  corretor crescer muito, revisar para uma janela dinâmica ou índice
  especializado.

## Impacto de performance

Checagem de conflito faz uma query indexada (`brokerUserId+scheduledAt`,
`contactId+scheduledAt`, `propertyId+scheduledAt`) num raio de 48h — barato
mesmo com milhares de visitas na base, porque o filtro por data limita
drasticamente o conjunto antes da comparação em memória. Dashboard e listas
usam `count()`/`findMany()` com os mesmos índices; nenhuma consulta faz table
scan completo.
