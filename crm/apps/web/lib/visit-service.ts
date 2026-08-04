import { createNotificationIdempotent, prisma, recordAudit, updateOptimistically, type PrismaClient } from "@mabres/db";
import {
  findVisitConflicts,
  type VisitConflictCandidate,
  type VisitConflictReason,
  type VisitCreateInput,
  type VisitOutcomeInput,
  type VisitRescheduleInput,
  type VisitStatusChangeInput,
} from "@mabres/shared";

const MIN_INTERVAL_MINUTES = 15; // intervalo mínimo configurável entre visitas do mesmo corretor/cliente/imóvel

/** Busca visitas candidatas a conflito num raio de +-1 dia do horário pretendido (suficiente e barato). */
export async function checkVisitConflicts(
  candidate: VisitConflictCandidate,
  windowStart: Date,
  windowEnd: Date,
): Promise<VisitConflictReason[]> {
  const nearby = await prisma.visit.findMany({
    where: {
      scheduledAt: { gte: windowStart, lte: windowEnd },
      status: { in: ["AGUARDANDO_CONFIRMACAO", "CONFIRMADA", "REAGENDADA"] },
      OR: [{ brokerUserId: candidate.brokerUserId }, { contactId: candidate.contactId }, { propertyId: candidate.propertyId }],
    },
    select: {
      id: true,
      contactId: true,
      propertyId: true,
      brokerUserId: true,
      scheduledAt: true,
      durationMinutes: true,
      status: true,
    },
  });

  return findVisitConflicts(candidate, nearby, MIN_INTERVAL_MINUTES);
}

export function conflictWindow(scheduledAt: Date) {
  return {
    start: new Date(scheduledAt.getTime() - 24 * 60 * 60_000),
    end: new Date(scheduledAt.getTime() + 24 * 60 * 60_000),
  };
}

/**
 * Cria a tarefa automática de confirmação/preparação relacionada a uma visita,
 * de forma idempotente (não cria duas tarefas do mesmo tipo para a mesma visita).
 * Roda FORA da transação de criação da visita — uma falha aqui nunca invalida
 * a visita já criada (só fica registrada em log).
 */
export async function ensureAutomaticVisitTask(input: {
  visitId: string;
  contactId: string;
  propertyId: string;
  assignedUserId: string;
  createdByUserId: string;
  taskType: "confirmar_visita" | "retornar_apos_visita";
  title: string;
  dueAt: Date;
}): Promise<{ created: boolean }> {
  const existing = await prisma.task.findFirst({
    where: { visitId: input.visitId, taskType: input.taskType, origin: "VISITA" },
    select: { id: true, status: true },
  });

  if (existing) return { created: false };

  await prisma.task.create({
    data: {
      title: input.title,
      contactId: input.contactId,
      propertyId: input.propertyId,
      visitId: input.visitId,
      assignedUserId: input.assignedUserId,
      createdByUserId: input.createdByUserId,
      taskType: input.taskType,
      origin: "VISITA",
      dueAt: input.dueAt,
      priority: "MEDIA",
    },
  });

  return { created: true };
}

/** Ao reagendar: atualiza (não duplica) tarefas automáticas futuras ainda pendentes; não toca em concluídas. */
export async function rescheduleAutomaticVisitTasks(visitId: string, newDueAt: Date) {
  await prisma.task.updateMany({
    where: { visitId, origin: "VISITA", status: { in: ["PENDENTE", "EM_ANDAMENTO"] } },
    data: { dueAt: newDueAt },
  });
}

/** Ao cancelar: cancela só tarefas automáticas futuras (origem VISITA) ainda pendentes; preserva tarefas manuais. */
export async function cancelAutomaticVisitTasks(visitId: string, reason: string) {
  await prisma.task.updateMany({
    where: { visitId, origin: "VISITA", status: { in: ["PENDENTE", "EM_ANDAMENTO"] } },
    data: { status: "CANCELADA", cancellationReason: `Visita cancelada: ${reason}` },
  });
}

/**
 * Cria a visita (+ VisitEvent CREATED e, se houver conflito confirmado,
 * CONFLICT_OVERRIDDEN) e registra a auditoria. Em seguida tenta criar a
 * tarefa automática de confirmação — fora da escrita principal: uma falha
 * aqui nunca deve invalidar a visita já criada, só fica registrada em log.
 */
export async function createVisit(
  client: PrismaClient,
  data: VisitCreateInput,
  conflicts: VisitConflictReason[],
  contactName: string,
  actorUserId: string,
) {
  const visit = await client.$transaction(async (tx) => {
    const created = await tx.visit.create({
      data: {
        contactId: data.contactId,
        propertyId: data.propertyId,
        brokerUserId: data.brokerUserId,
        scheduledAt: data.scheduledAt,
        durationMinutes: data.durationMinutes,
        modality: data.modality,
        meetingPoint: data.meetingPoint || null,
        internalNotes: data.internalNotes || null,
        clientInstructions: data.clientInstructions || null,
        createdByUserId: actorUserId,
        scheduleConflictNote:
          conflicts.length > 0 ? `${data.conflictJustification} (conflitos: ${conflicts.length})` : null,
      },
    });

    await tx.visitEvent.create({
      data: {
        visitId: created.id,
        eventType: "CREATED",
        newData: {
          contactId: data.contactId,
          propertyId: data.propertyId,
          brokerUserId: data.brokerUserId,
          scheduledAt: data.scheduledAt.toISOString(),
          durationMinutes: data.durationMinutes,
          status: "AGUARDANDO_CONFIRMACAO",
        },
        createdByUserId: actorUserId,
      },
    });

    if (conflicts.length > 0) {
      await tx.visitEvent.create({
        data: {
          visitId: created.id,
          eventType: "CONFLICT_OVERRIDDEN",
          newData: { conflicts: conflicts.map((c) => ({ ...c })) },
          reason: data.conflictJustification,
          createdByUserId: actorUserId,
        },
      });
    }

    return created;
  });

  await recordAudit(client, {
    entityType: "Visit",
    entityId: visit.id,
    action: "create",
    actorType: "USER",
    actorUserId,
    after: { contactId: data.contactId, propertyId: data.propertyId, scheduledAt: data.scheduledAt },
  });

  if (data.createConfirmationTask) {
    try {
      await ensureAutomaticVisitTask({
        visitId: visit.id,
        contactId: data.contactId,
        propertyId: data.propertyId,
        assignedUserId: data.brokerUserId,
        createdByUserId: actorUserId,
        taskType: "confirmar_visita",
        title: `Confirmar visita de ${contactName}`,
        dueAt: data.scheduledAt,
      });
    } catch (error) {
      console.error(`[visits] falha ao criar tarefa automática de confirmação para a visita ${visit.id}`, error);
    }
  }

  return visit;
}

/**
 * Reagenda a visita de forma otimista (ver `updateOptimistically`), registra
 * o evento, a auditoria e a notificação, e tenta atualizar as tarefas
 * automáticas pendentes para o novo horário. `ConcurrencyConflictError`
 * propaga para quem chamar decidir a resposta (ex.: redirect com `?error=`).
 */
export async function rescheduleVisit(
  client: PrismaClient,
  data: VisitRescheduleInput,
  current: { scheduledAt: Date; durationMinutes: number; status: string; brokerUserId: string },
  conflicts: VisitConflictReason[],
  actorUserId: string,
) {
  await client.$transaction(async (tx) => {
    await updateOptimistically(
      tx.visit,
      data.id,
      data.expectedUpdatedAt,
      {
        scheduledAt: data.scheduledAt,
        durationMinutes: data.durationMinutes,
        status: "REAGENDADA",
        rescheduleReason: data.reason,
        clientConfirmed: false,
        ownerConfirmed: false,
      },
      "Esta visita",
    );

    await tx.visitEvent.create({
      data: {
        visitId: data.id,
        eventType: "RESCHEDULED",
        previousData: {
          scheduledAt: current.scheduledAt.toISOString(),
          durationMinutes: current.durationMinutes,
          status: current.status,
        },
        newData: {
          scheduledAt: data.scheduledAt.toISOString(),
          durationMinutes: data.durationMinutes,
          status: "REAGENDADA",
        },
        reason: data.reason,
        createdByUserId: actorUserId,
      },
    });

    if (conflicts.length > 0) {
      await tx.visitEvent.create({
        data: {
          visitId: data.id,
          eventType: "CONFLICT_OVERRIDDEN",
          newData: { conflicts: conflicts.map((c) => ({ ...c })) },
          reason: data.conflictJustification,
          createdByUserId: actorUserId,
        },
      });
    }
  });

  await recordAudit(client, {
    entityType: "Visit",
    entityId: data.id,
    action: "reschedule",
    actorType: "USER",
    actorUserId,
    before: { scheduledAt: current.scheduledAt },
    after: { scheduledAt: data.scheduledAt, reason: data.reason },
  });

  await createNotificationIdempotent(client, {
    userId: current.brokerUserId,
    type: "visita_reagendada",
    title: "Visita reagendada",
    body: `A visita de ${current.scheduledAt.toLocaleString("pt-BR")} foi remarcada para ${data.scheduledAt.toLocaleString("pt-BR")}.`,
    entityType: "Visit",
    entityId: data.id,
    idempotencyKey: `visit_rescheduled:${data.id}:${data.scheduledAt.toISOString()}`,
  });

  try {
    await rescheduleAutomaticVisitTasks(data.id, data.scheduledAt);
  } catch (error) {
    console.error(`[visits] falha ao atualizar tarefas automáticas no reagendamento da visita ${data.id}`, error);
  }
}

/**
 * Muda o status da visita de forma otimista, registra o evento (tipo
 * derivado de `allowException`/cancelamento) e a auditoria. Em cancelamentos,
 * tenta cancelar as tarefas automáticas pendentes da visita.
 */
export async function changeVisitStatus(
  client: PrismaClient,
  data: VisitStatusChangeInput,
  current: { status: string; cancellationReason: string | null; clientConfirmed: boolean },
  actorUserId: string,
) {
  const isCancellation = data.toStatus === "CANCELADA_CLIENTE" || data.toStatus === "CANCELADA_CORRETOR";
  const eventType = data.allowException ? "CORRECTED_BY_ADMIN" : isCancellation ? "CANCELLED" : "STATUS_CHANGED";

  await client.$transaction(async (tx) => {
    await updateOptimistically(
      tx.visit,
      data.id,
      data.expectedUpdatedAt,
      {
        status: data.toStatus,
        cancellationReason: isCancellation ? data.reason : current.cancellationReason,
        clientConfirmed: data.toStatus === "CONFIRMADA" ? true : current.clientConfirmed,
      },
      "Esta visita",
    );

    await tx.visitEvent.create({
      data: {
        visitId: data.id,
        eventType,
        previousData: { status: current.status },
        newData: { status: data.toStatus },
        reason: data.reason,
        createdByUserId: actorUserId,
      },
    });
  });

  await recordAudit(client, {
    entityType: "Visit",
    entityId: data.id,
    action: data.allowException ? "status_override" : "status_change",
    actorType: "USER",
    actorUserId,
    before: { status: current.status },
    after: { status: data.toStatus, reason: data.reason },
  });

  if (isCancellation) {
    try {
      await cancelAutomaticVisitTasks(data.id, data.reason ?? "");
    } catch (error) {
      console.error(`[visits] falha ao cancelar tarefas automáticas da visita ${data.id}`, error);
    }
  }
}

/**
 * Registra o resultado (outcome) da visita realizada, de forma otimista, e
 * a auditoria. Opcionalmente tenta criar a tarefa automática de retorno.
 */
export async function recordVisitOutcome(
  client: PrismaClient,
  data: VisitOutcomeInput,
  current: { status: string; contactId: string; propertyId: string; brokerUserId: string },
  actorUserId: string,
) {
  await client.$transaction(async (tx) => {
    await updateOptimistically(
      tx.visit,
      data.id,
      data.expectedUpdatedAt,
      {
        status: "REALIZADA",
        interestLevel: data.interestLevel,
        positivePoints: data.positivePoints,
        objections: data.objections,
        rejectionReason: data.rejectionReason,
        intendsToPropose: data.intendsToPropose,
        needsFinancingReview: data.needsFinancingReview,
        wantsToSeeOtherProperties: data.wantsToSeeOtherProperties,
        recommendedReturnAt: data.recommendedReturnAt,
        outcomeNotes: data.outcomeNotes,
        nextAction: data.nextAction,
      },
      "Esta visita",
    );

    await tx.visitEvent.create({
      data: {
        visitId: data.id,
        eventType: "RESULT_RECORDED",
        previousData: { status: current.status },
        newData: {
          status: "REALIZADA",
          interestLevel: data.interestLevel,
          intendsToPropose: data.intendsToPropose,
          needsFinancingReview: data.needsFinancingReview,
          wantsToSeeOtherProperties: data.wantsToSeeOtherProperties,
          recommendedReturnAt: data.recommendedReturnAt?.toISOString() ?? null,
        },
        createdByUserId: actorUserId,
      },
    });
  });

  await recordAudit(client, {
    entityType: "Visit",
    entityId: data.id,
    action: "outcome_recorded",
    actorType: "USER",
    actorUserId,
    after: { interestLevel: data.interestLevel, intendsToPropose: data.intendsToPropose },
  });

  if (data.createFollowUpTask) {
    try {
      const returnAt = data.recommendedReturnAt ?? new Date(Date.now() + 2 * 24 * 60 * 60_000);
      await ensureAutomaticVisitTask({
        visitId: data.id,
        contactId: current.contactId,
        propertyId: current.propertyId,
        assignedUserId: current.brokerUserId,
        createdByUserId: actorUserId,
        taskType: "retornar_apos_visita",
        title: "Retornar com o cliente após a visita",
        dueAt: returnAt,
      });
    } catch (error) {
      console.error(`[visits] falha ao criar tarefa de retorno para a visita ${data.id}`, error);
    }
  }
}

/** Reatribui o corretor responsável pela visita, de forma otimista, e notifica o novo responsável. */
export async function reassignVisit(
  client: PrismaClient,
  id: string,
  expectedUpdatedAt: Date,
  current: { brokerUserId: string; scheduledAt: Date },
  newBrokerUserId: string,
  actorUserId: string,
) {
  await client.$transaction(async (tx) => {
    await updateOptimistically(tx.visit, id, expectedUpdatedAt, { brokerUserId: newBrokerUserId }, "Esta visita");

    await tx.visitEvent.create({
      data: {
        visitId: id,
        eventType: "ASSIGNEE_CHANGED",
        previousData: { brokerUserId: current.brokerUserId },
        newData: { brokerUserId: newBrokerUserId },
        reason: "Reatribuição de corretor",
        createdByUserId: actorUserId,
      },
    });
  });

  await recordAudit(client, {
    entityType: "Visit",
    entityId: id,
    action: "reassign",
    actorType: "USER",
    actorUserId,
    before: { brokerUserId: current.brokerUserId },
    after: { brokerUserId: newBrokerUserId },
  });

  await createNotificationIdempotent(client, {
    userId: newBrokerUserId,
    type: "responsavel_alterado",
    title: "Visita atribuída a você",
    body: `Você agora é o corretor responsável pela visita de ${current.scheduledAt.toLocaleString("pt-BR")}.`,
    entityType: "Visit",
    entityId: id,
    idempotencyKey: `visit_reassigned:${id}:${newBrokerUserId}:${Date.now()}`,
  });
}
