import { prisma, recordAudit, updateOptimistically } from "@mabres/db";
import type { StageCreateInput, StageUpdateInput } from "@mabres/shared";

/** G30 (Marco 1.9, Sprint 6) — administração das etapas do funil (PipelineStage). */

async function assertOrderAvailable(order: number, excludeId?: string) {
  const existing = await prisma.pipelineStage.findUnique({ where: { order } });
  if (existing && existing.id !== excludeId) {
    throw new Error(`A ordem ${order} já está em uso pela etapa "${existing.name}". Escolha outro número.`);
  }
}

export async function createStage(data: StageCreateInput, actorUserId: string) {
  await assertOrderAvailable(data.order);

  const stage = await prisma.pipelineStage.create({
    data: {
      name: data.name,
      order: data.order,
      requiresReasonOn: data.requiresReasonOn,
      color: data.color,
    },
  });

  await recordAudit(prisma, {
    entityType: "PipelineStage",
    entityId: stage.id,
    action: "create",
    actorUserId,
    after: { name: stage.name, order: stage.order, requiresReasonOn: stage.requiresReasonOn, color: stage.color },
  });

  return stage;
}

export async function updateStage(data: StageUpdateInput, actorUserId: string) {
  const stage = await prisma.pipelineStage.findUniqueOrThrow({ where: { id: data.id } });

  if (data.order !== stage.order) {
    await assertOrderAvailable(data.order, data.id);
  }

  await updateOptimistically(
    prisma.pipelineStage,
    data.id,
    data.expectedUpdatedAt,
    { name: data.name, order: data.order, requiresReasonOn: data.requiresReasonOn, color: data.color, isActive: data.isActive },
    "Esta etapa",
  );

  await recordAudit(prisma, {
    entityType: "PipelineStage",
    entityId: data.id,
    action: "update",
    actorUserId,
    before: { name: stage.name, order: stage.order, requiresReasonOn: stage.requiresReasonOn, color: stage.color, isActive: stage.isActive },
    after: { name: data.name, order: data.order, requiresReasonOn: data.requiresReasonOn, color: data.color, isActive: data.isActive },
  });
}
