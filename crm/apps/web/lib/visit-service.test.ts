import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createNotificationIdempotent, prisma } from "@mabres/db";
import {
  cancelAutomaticVisitTasks,
  checkVisitConflicts,
  conflictWindow,
  ensureAutomaticVisitTask,
  rescheduleAutomaticVisitTasks,
} from "./visit-service";

/** Testes de integração contra Postgres real — ver .github/workflows/ci.yml. */
describe("visit-service — integração com PostgreSQL", () => {
  let roleId: string;
  let brokerAId: string;
  let brokerBId: string;
  let contactId: string;
  let propertyId: string;
  let visitId: string;
  let manualTaskId: string;
  let completedAutoTaskId: string;

  beforeAll(async () => {
    const role = await prisma.role.upsert({
      where: { name: "TesteVisitService" },
      update: {},
      create: { name: "TesteVisitService" },
    });
    roleId = role.id;

    const [brokerA, brokerB] = await Promise.all([
      prisma.user.create({ data: { name: "Corretor A", email: `broker-a-${Date.now()}@example.com`, roleId } }),
      prisma.user.create({ data: { name: "Corretor B", email: `broker-b-${Date.now()}@example.com`, roleId } }),
    ]);
    brokerAId = brokerA.id;
    brokerBId = brokerB.id;

    const property = await prisma.property.create({
      data: { internalCode: `TEST-VS-${Date.now()}`, purpose: "VENDA", propertyType: "Apartamento", status: "ativo" },
    });
    propertyId = property.id;

    const contact = await prisma.contact.create({ data: { name: "Cliente Teste Visit Service", ownerUserId: brokerAId } });
    contactId = contact.id;

    const visit = await prisma.visit.create({
      data: {
        contactId,
        propertyId,
        brokerUserId: brokerAId,
        createdByUserId: brokerAId,
        scheduledAt: new Date("2026-06-10T14:00:00Z"),
        status: "AGUARDANDO_CONFIRMACAO",
      },
    });
    visitId = visit.id;
  });

  afterAll(async () => {
    await prisma.task.deleteMany({ where: { visitId } });
    await prisma.notification.deleteMany({ where: { entityId: visitId } });
    // VisitEvent é append-only (bloqueado por middleware) — apagado via cascade ao remover a Visit.
    await prisma.visit.deleteMany({ where: { OR: [{ id: visitId }, { brokerUserId: brokerBId }] } });
    await prisma.contact.delete({ where: { id: contactId } }).catch(() => undefined);
    await prisma.property.delete({ where: { id: propertyId } }).catch(() => undefined);
    await prisma.user.deleteMany({ where: { id: { in: [brokerAId, brokerBId] } } });
    await prisma.role.delete({ where: { id: roleId } }).catch(() => undefined);
    await prisma.$disconnect();
  });

  it("ensureAutomaticVisitTask é idempotente — segunda chamada não cria uma segunda tarefa", async () => {
    const first = await ensureAutomaticVisitTask({
      visitId,
      contactId,
      propertyId,
      assignedUserId: brokerAId,
      createdByUserId: brokerAId,
      taskType: "confirmar_visita",
      title: "Confirmar visita",
      dueAt: new Date(),
    });
    const second = await ensureAutomaticVisitTask({
      visitId,
      contactId,
      propertyId,
      assignedUserId: brokerAId,
      createdByUserId: brokerAId,
      taskType: "confirmar_visita",
      title: "Confirmar visita (duplicata)",
      dueAt: new Date(),
    });

    expect(first.created).toBe(true);
    expect(second.created).toBe(false);

    const tasks = await prisma.task.findMany({ where: { visitId, taskType: "confirmar_visita" } });
    expect(tasks).toHaveLength(1);
  });

  it("rescheduleAutomaticVisitTasks atualiza dueAt só de tarefas automáticas pendentes, não de concluídas", async () => {
    const pending = await prisma.task.findFirstOrThrow({ where: { visitId, taskType: "confirmar_visita" } });

    const manualTask = await prisma.task.create({
      data: {
        title: "Tarefa manual não relacionada à automação",
        visitId,
        assignedUserId: brokerAId,
        createdByUserId: brokerAId,
        taskType: "outro",
        origin: "MANUAL",
        dueAt: new Date("2026-01-01T00:00:00Z"),
      },
    });

    const completedAutoTask = await prisma.task.create({
      data: {
        title: "Tarefa automática já concluída",
        visitId,
        assignedUserId: brokerAId,
        createdByUserId: brokerAId,
        taskType: "confirmar_visita",
        origin: "VISITA",
        status: "CONCLUIDA",
        dueAt: new Date("2026-01-01T00:00:00Z"),
      },
    });

    manualTaskId = manualTask.id;
    completedAutoTaskId = completedAutoTask.id;

    const newDueAt = new Date("2026-07-01T10:00:00Z");
    await rescheduleAutomaticVisitTasks(visitId, newDueAt);

    const [reloadedPending, reloadedManual, reloadedCompleted] = await Promise.all([
      prisma.task.findUniqueOrThrow({ where: { id: pending.id } }),
      prisma.task.findUniqueOrThrow({ where: { id: manualTask.id } }),
      prisma.task.findUniqueOrThrow({ where: { id: completedAutoTask.id } }),
    ]);

    expect(reloadedPending.dueAt?.toISOString()).toBe(newDueAt.toISOString());
    expect(reloadedManual.dueAt?.toISOString()).toBe(new Date("2026-01-01T00:00:00Z").toISOString());
    expect(reloadedCompleted.dueAt?.toISOString()).toBe(new Date("2026-01-01T00:00:00Z").toISOString());
  });

  it("cancelAutomaticVisitTasks cancela só tarefas automáticas pendentes, preserva tarefas manuais", async () => {
    await cancelAutomaticVisitTasks(visitId, "Cliente desistiu");

    const [pendingAutoTask, manualTask, completedTask] = await Promise.all([
      prisma.task.findFirstOrThrow({
        where: { visitId, origin: "VISITA", taskType: "confirmar_visita", id: { not: completedAutoTaskId } },
      }),
      prisma.task.findUniqueOrThrow({ where: { id: manualTaskId } }),
      prisma.task.findUniqueOrThrow({ where: { id: completedAutoTaskId } }),
    ]);

    expect(pendingAutoTask.status).toBe("CANCELADA");
    expect(pendingAutoTask.cancellationReason).toContain("Cliente desistiu");
    expect(manualTask.status).not.toBe("CANCELADA");
    expect(completedTask.status).toBe("CONCLUIDA"); // não mexe em tarefa já concluída
  });

  it("checkVisitConflicts detecta conflito real de corretor consultando o Postgres", async () => {
    const window = conflictWindow(new Date("2026-06-10T14:00:00Z"));
    const conflicts = await checkVisitConflicts(
      {
        contactId,
        propertyId,
        brokerUserId: brokerAId,
        scheduledAt: new Date("2026-06-10T14:15:00Z"), // sobrepõe a visita criada no beforeAll
        durationMinutes: 45,
        status: "AGUARDANDO_CONFIRMACAO",
      },
      window.start,
      window.end,
    );
    expect(conflicts.some((c) => c.type === "corretor")).toBe(true);
  });

  // G15 (achado #T5, Auditoria 6): nome antigo ("isolamento entre corretores")
  // sugeria cobertura de controle de acesso, mas este teste só verifica a
  // semântica de uma cláusula WHERE do Prisma — tautologicamente verdadeiro,
  // não exercita nenhum código de autorização da aplicação. O controle de
  // acesso real (getVisitScopeWhere / página de detalhe da visita) é coberto
  // por e2e/scope-and-access-control.spec.ts (S4).
  it("consulta filtrada por brokerUserId retorna só as visitas daquele corretor (semântica do WHERE, não é teste de autorização)", async () => {
    await prisma.visit.create({
      data: {
        contactId,
        propertyId,
        brokerUserId: brokerBId,
        createdByUserId: brokerBId,
        scheduledAt: new Date("2026-08-01T10:00:00Z"),
        status: "AGUARDANDO_CONFIRMACAO",
      },
    });

    const scopedToA = await prisma.visit.findMany({ where: { brokerUserId: brokerAId, contactId } });
    const scopedToB = await prisma.visit.findMany({ where: { brokerUserId: brokerBId, contactId } });

    expect(scopedToA.every((v) => v.brokerUserId === brokerAId)).toBe(true);
    expect(scopedToB.every((v) => v.brokerUserId === brokerBId)).toBe(true);
    expect(scopedToA.some((v) => v.brokerUserId === brokerBId)).toBe(false);
  });

  it("createNotificationIdempotent nunca duplica pela mesma chave de idempotência", async () => {
    const key = `test_idem:${visitId}`;
    const first = await createNotificationIdempotent(prisma, {
      userId: brokerAId,
      type: "visita_proxima",
      title: "Visita próxima",
      idempotencyKey: key,
    });
    const second = await createNotificationIdempotent(prisma, {
      userId: brokerAId,
      type: "visita_proxima",
      title: "Visita próxima (tentativa duplicada)",
      idempotencyKey: key,
    });

    expect(first).not.toBeNull();
    expect(second).toBeNull();

    const stored = await prisma.notification.findMany({ where: { idempotencyKey: key } });
    expect(stored).toHaveLength(1);
  });

  it("VisitEvent é append-only: update e delete são bloqueados pelo middleware do Prisma Client", async () => {
    const event = await prisma.visitEvent.create({
      data: { visitId, eventType: "CREATED", newData: { status: "AGUARDANDO_CONFIRMACAO" } },
    });

    await expect(
      prisma.visitEvent.update({ where: { id: event.id }, data: { reason: "tentativa de editar" } }),
    ).rejects.toThrow(/append-only/);

    await expect(prisma.visitEvent.delete({ where: { id: event.id } })).rejects.toThrow(/append-only/);

    const stillThere = await prisma.visitEvent.findUnique({ where: { id: event.id } });
    expect(stillThere).not.toBeNull();
    expect(stillThere?.reason).toBeNull();
  });

  it("concorrência otimista: updateMany filtrado por updatedAt esperado não afeta linhas quando outra escrita já mudou o registro", async () => {
    const visit = await prisma.visit.findUniqueOrThrow({ where: { id: visitId } });
    const staleExpectedUpdatedAt = visit.updatedAt;

    // simula outra requisição alterando a visita nesse meio tempo
    await prisma.visit.update({ where: { id: visitId }, data: { internalNotes: "alterado por outra requisição" } });

    const attemptWithStaleVersion = await prisma.visit.updateMany({
      where: { id: visitId, updatedAt: staleExpectedUpdatedAt },
      data: { internalNotes: "minha alteração, baseada em dado desatualizado" },
    });
    expect(attemptWithStaleVersion.count).toBe(0); // ninguém sobrescreve silenciosamente

    const reloaded = await prisma.visit.findUniqueOrThrow({ where: { id: visitId } });
    expect(reloaded.internalNotes).toBe("alterado por outra requisição");

    const attemptWithFreshVersion = await prisma.visit.updateMany({
      where: { id: visitId, updatedAt: reloaded.updatedAt },
      data: { internalNotes: "minha alteração, agora com a versão certa" },
    });
    expect(attemptWithFreshVersion.count).toBe(1);
  });
});
