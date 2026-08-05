import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma, ConcurrencyConflictError } from "@mabres/db";
import { createStage, updateStage } from "./stage-admin-service";

/**
 * G30 (Marco 1.9, Sprint 6) — testes de integração contra Postgres real —
 * ver .github/workflows/ci.yml. Usa ordens bem altas (90000+) para nunca
 * colidir com as 24 etapas seedadas nem com outra suíte rodando em paralelo.
 */
describe("stage-admin-service — integração com PostgreSQL", () => {
  let actorUserId: string;
  let roleId: string;
  const createdStageIds: string[] = [];

  beforeAll(async () => {
    const role = await prisma.role.upsert({
      where: { name: "TesteStageAdminRole" },
      update: {},
      create: { name: "TesteStageAdminRole" },
    });
    roleId = role.id;

    const actor = await prisma.user.create({
      data: { name: "Ator Etapas", email: `ator-etapas-${Date.now()}@example.com`, roleId },
    });
    actorUserId = actor.id;
  });

  afterAll(async () => {
    await prisma.pipelineStage.deleteMany({ where: { id: { in: createdStageIds } } });
    // AuditLog é append-only (G17) — não é apagado no cleanup.
    await prisma.user.deleteMany({ where: { id: actorUserId } });
    await prisma.role.deleteMany({ where: { id: roleId } });
    await prisma.$disconnect();
  });

  it("createStage cria a etapa e audita", async () => {
    const stage = await createStage({ name: "Teste G30 — nova etapa", order: 90001, requiresReasonOn: "NONE", color: null }, actorUserId);
    createdStageIds.push(stage.id);

    expect(stage.name).toBe("Teste G30 — nova etapa");
    expect(stage.isActive).toBe(true);

    const log = await prisma.auditLog.findFirst({
      where: { entityType: "PipelineStage", entityId: stage.id, action: "create" },
      orderBy: { createdAt: "desc" },
    });
    expect(log).not.toBeNull();
  });

  it("createStage recusa uma ordem já usada por outra etapa", async () => {
    const first = await createStage({ name: "Teste G30 — ordem A", order: 90002, requiresReasonOn: "NONE", color: null }, actorUserId);
    createdStageIds.push(first.id);

    await expect(
      createStage({ name: "Teste G30 — ordem B", order: 90002, requiresReasonOn: "NONE", color: null }, actorUserId),
    ).rejects.toThrow(/já está em uso/);
  });

  it("updateStage altera nome/ordem/cor/exigência de motivo e audita antes/depois", async () => {
    const stage = await createStage({ name: "Teste G30 — a atualizar", order: 90003, requiresReasonOn: "NONE", color: null }, actorUserId);
    createdStageIds.push(stage.id);

    await updateStage(
      {
        id: stage.id,
        expectedUpdatedAt: stage.updatedAt,
        name: "Teste G30 — atualizada",
        order: 90004,
        requiresReasonOn: "PAUSE",
        color: "#22C55E",
        isActive: false,
      },
      actorUserId,
    );

    const updated = await prisma.pipelineStage.findUniqueOrThrow({ where: { id: stage.id } });
    expect(updated.name).toBe("Teste G30 — atualizada");
    expect(updated.order).toBe(90004);
    expect(updated.requiresReasonOn).toBe("PAUSE");
    expect(updated.color).toBe("#22C55E");
    expect(updated.isActive).toBe(false);

    const log = await prisma.auditLog.findFirst({
      where: { entityType: "PipelineStage", entityId: stage.id, action: "update" },
      orderBy: { createdAt: "desc" },
    });
    expect(log).not.toBeNull();
    expect((log?.before as { name: string } | null)?.name).toBe("Teste G30 — a atualizar");
    expect((log?.after as { name: string } | null)?.name).toBe("Teste G30 — atualizada");
  });

  it("updateStage recusa mudar para uma ordem já usada por outra etapa", async () => {
    const a = await createStage({ name: "Teste G30 — ordem C", order: 90005, requiresReasonOn: "NONE", color: null }, actorUserId);
    const b = await createStage({ name: "Teste G30 — ordem D", order: 90006, requiresReasonOn: "NONE", color: null }, actorUserId);
    createdStageIds.push(a.id, b.id);

    await expect(
      updateStage(
        { id: b.id, expectedUpdatedAt: b.updatedAt, name: b.name, order: 90005, requiresReasonOn: "NONE", color: null, isActive: true },
        actorUserId,
      ),
    ).rejects.toThrow(/já está em uso/);
  });

  it("updateStage detecta concorrência (expectedUpdatedAt desatualizado)", async () => {
    const stage = await createStage({ name: "Teste G30 — concorrência", order: 90007, requiresReasonOn: "NONE", color: null }, actorUserId);
    createdStageIds.push(stage.id);

    const staleDate = new Date(stage.updatedAt.getTime() - 60_000);
    await expect(
      updateStage(
        { id: stage.id, expectedUpdatedAt: staleDate, name: "Outro nome", order: stage.order, requiresReasonOn: "NONE", color: null, isActive: true },
        actorUserId,
      ),
    ).rejects.toThrow(ConcurrencyConflictError);
  });
});
