"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { ConcurrencyConflictError, createNotificationIdempotent, prisma, recordAudit, updateOptimistically, type Prisma } from "@mabres/db";
import {
  canTransitionVisit,
  visitCreateSchema,
  visitOutcomeSchema,
  visitReassignSchema,
  visitRescheduleSchema,
  visitStatusChangeSchema,
  type VisitConflictReason,
} from "@mabres/shared";
import { requirePermission, requireSession } from "@/lib/session";
import {
  cancelAutomaticVisitTasks,
  checkVisitConflicts,
  conflictWindow,
  ensureAutomaticVisitTask,
  rescheduleAutomaticVisitTasks,
} from "@/lib/visit-service";

const CANCELLATION_STATUSES = new Set([
  "CANCELADA_CLIENTE",
  "CANCELADA_CORRETOR",
  "CLIENTE_NAO_COMPARECEU",
  "PROPRIETARIO_INDISPONIVEL",
]);

export interface CreateVisitState {
  status: "idle" | "conflict_warning" | "inactive_property" | "error";
  conflicts?: VisitConflictReason[];
  message?: string;
}

export async function createVisitAction(
  _prevState: CreateVisitState,
  formData: FormData,
): Promise<CreateVisitState> {
  const session = await requirePermission("visits:create");

  const parsed = visitCreateSchema.safeParse({
    contactId: formData.get("contactId"),
    propertyId: formData.get("propertyId"),
    brokerUserId: formData.get("brokerUserId"),
    scheduledAt: formData.get("scheduledAt"),
    durationMinutes: formData.get("durationMinutes") || 45,
    modality: formData.get("modality") || "PRESENCIAL",
    meetingPoint: formData.get("meetingPoint") || null,
    internalNotes: formData.get("internalNotes") || null,
    clientInstructions: formData.get("clientInstructions") || null,
    confirmConflict: formData.get("confirmConflict") === "true",
    conflictJustification: formData.get("conflictJustification") || null,
    createConfirmationTask: formData.get("createConfirmationTask") !== "off",
  });

  if (!parsed.success) {
    return { status: "error", message: parsed.error.issues[0]?.message ?? "Dados inválidos." };
  }

  const data = parsed.data;

  const [contact, property] = await Promise.all([
    prisma.contact.findFirst({ where: { id: data.contactId, deletedAt: null } }),
    prisma.property.findFirst({ where: { id: data.propertyId, deletedAt: null } }),
  ]);

  if (!contact) return { status: "error", message: "Cliente não encontrado ou excluído." };
  if (!property) return { status: "error", message: "Imóvel não encontrado ou excluído." };

  if (property.status !== "ativo") {
    const hasOverride = session.user.permissions.includes("visits:override_conflict");
    if (!hasOverride || !data.confirmConflict || !data.conflictJustification) {
      return { status: "inactive_property", message: `Imóvel está com status "${property.status}", não "ativo".` };
    }
  }

  // Conflito usa intervalo semiaberto [início, fim) — ver findVisitConflicts em packages/shared.
  const window = conflictWindow(data.scheduledAt);
  const conflicts = await checkVisitConflicts(
    {
      contactId: data.contactId,
      propertyId: data.propertyId,
      brokerUserId: data.brokerUserId,
      scheduledAt: data.scheduledAt,
      durationMinutes: data.durationMinutes,
      status: "AGUARDANDO_CONFIRMACAO",
    },
    window.start,
    window.end,
  );

  if (conflicts.length > 0 && !data.confirmConflict) {
    return { status: "conflict_warning", conflicts };
  }

  if (conflicts.length > 0 && data.confirmConflict) {
    const hasOverride = session.user.permissions.includes("visits:override_conflict");
    if (!hasOverride) {
      return { status: "error", message: "Você não tem permissão para confirmar uma visita com conflito de agenda." };
    }
    if (!data.conflictJustification) {
      return { status: "error", message: "Informe a justificativa para confirmar a visita mesmo com conflito." };
    }
  }

  const visit = await prisma.$transaction(async (tx) => {
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
        createdByUserId: session.user.id,
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
        createdByUserId: session.user.id,
      },
    });

    if (conflicts.length > 0) {
      await tx.visitEvent.create({
        data: {
          visitId: created.id,
          eventType: "CONFLICT_OVERRIDDEN",
          newData: { conflicts: conflicts.map((c) => ({ ...c })) },
          reason: data.conflictJustification,
          createdByUserId: session.user.id,
        },
      });
    }

    return created;
  });

  await recordAudit(prisma, {
    entityType: "Visit",
    entityId: visit.id,
    action: "create",
    actorType: "USER",
    actorUserId: session.user.id,
    after: { contactId: data.contactId, propertyId: data.propertyId, scheduledAt: data.scheduledAt },
  });

  // Fora da transação: falha aqui nunca deve apagar/invalidar a visita já criada.
  if (data.createConfirmationTask) {
    try {
      await ensureAutomaticVisitTask({
        visitId: visit.id,
        contactId: data.contactId,
        propertyId: data.propertyId,
        assignedUserId: data.brokerUserId,
        createdByUserId: session.user.id,
        taskType: "confirmar_visita",
        title: `Confirmar visita de ${contact.name}`,
        dueAt: data.scheduledAt,
      });
    } catch (error) {
      console.error(`[visits] falha ao criar tarefa automática de confirmação para a visita ${visit.id}`, error);
    }
  }

  revalidatePath("/visits");
  redirect(`/visits/${visit.id}`);
}

/**
 * Atualiza a visita de forma otimista: só aplica se `updatedAt` no banco
 * ainda for igual ao lido pela tela (`expectedUpdatedAt`). Se outra
 * requisição já alterou a visita nesse meio tempo, `count` vem 0 e lança
 * `ConcurrencyConflictError` — nunca sobrescreve silenciosamente.
 */
async function updateVisitOptimistically(
  tx: Prisma.TransactionClient,
  id: string,
  expectedUpdatedAt: Date,
  data: Prisma.VisitUncheckedUpdateManyInput,
) {
  await updateOptimistically(tx.visit, id, expectedUpdatedAt, data, "Esta visita");
}

export async function rescheduleVisitAction(formData: FormData) {
  const session = await requirePermission("visits:update");

  const id = String(formData.get("id") ?? "");
  const parsed = visitRescheduleSchema.safeParse({
    id,
    expectedUpdatedAt: formData.get("expectedUpdatedAt"),
    scheduledAt: formData.get("scheduledAt"),
    durationMinutes: formData.get("durationMinutes") || 45,
    reason: formData.get("reason"),
    confirmConflict: formData.get("confirmConflict") === "true",
    conflictJustification: formData.get("conflictJustification") || null,
  });

  if (!parsed.success) {
    redirect(`/visits/${id}?error=${encodeURIComponent(parsed.error.issues[0]?.message ?? "Dados inválidos")}`);
  }

  const data = parsed.data;
  const current = await prisma.visit.findUniqueOrThrow({ where: { id: data.id } });

  if (!canTransitionVisit(current.status, "REAGENDADA")) {
    redirect(`/visits/${id}?error=${encodeURIComponent(`Não é possível reagendar uma visita com status "${current.status}".`)}`);
  }

  const window = conflictWindow(data.scheduledAt);
  const conflicts = await checkVisitConflicts(
    {
      id: current.id,
      contactId: current.contactId,
      propertyId: current.propertyId,
      brokerUserId: current.brokerUserId,
      scheduledAt: data.scheduledAt,
      durationMinutes: data.durationMinutes,
      status: current.status as never,
    },
    window.start,
    window.end,
  );

  if (conflicts.length > 0 && !data.confirmConflict) {
    redirect(
      `/visits/${id}?error=${encodeURIComponent(`Conflito de agenda detectado (${conflicts.length}). Marque "confirmar mesmo com conflito" para prosseguir.`)}`,
    );
  }

  if (conflicts.length > 0 && !session.user.permissions.includes("visits:override_conflict")) {
    redirect(`/visits/${id}?error=${encodeURIComponent("Você não tem permissão para confirmar reagendamento com conflito.")}`);
  }

  try {
    await prisma.$transaction(async (tx) => {
      await updateVisitOptimistically(tx, data.id, data.expectedUpdatedAt, {
        scheduledAt: data.scheduledAt,
        durationMinutes: data.durationMinutes,
        status: "REAGENDADA",
        rescheduleReason: data.reason,
        clientConfirmed: false,
        ownerConfirmed: false,
      });

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
          createdByUserId: session.user.id,
        },
      });

      if (conflicts.length > 0) {
        await tx.visitEvent.create({
          data: {
            visitId: data.id,
            eventType: "CONFLICT_OVERRIDDEN",
            newData: { conflicts: conflicts.map((c) => ({ ...c })) },
            reason: data.conflictJustification,
            createdByUserId: session.user.id,
          },
        });
      }
    });
  } catch (error) {
    if (error instanceof ConcurrencyConflictError) {
      redirect(`/visits/${id}?error=${encodeURIComponent(error.message)}`);
    }
    throw error;
  }

  await recordAudit(prisma, {
    entityType: "Visit",
    entityId: data.id,
    action: "reschedule",
    actorType: "USER",
    actorUserId: session.user.id,
    before: { scheduledAt: current.scheduledAt },
    after: { scheduledAt: data.scheduledAt, reason: data.reason },
  });

  await createNotificationIdempotent(prisma, {
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

  revalidatePath(`/visits/${data.id}`);
  revalidatePath("/visits");
}

export async function changeVisitStatusAction(formData: FormData) {
  const session = await requireSession();

  const id = String(formData.get("id") ?? "");
  const parsed = visitStatusChangeSchema.safeParse({
    id,
    expectedUpdatedAt: formData.get("expectedUpdatedAt"),
    toStatus: formData.get("toStatus"),
    reason: formData.get("reason") || null,
    allowException: formData.get("allowException") === "true",
  });

  if (!parsed.success) {
    redirect(`/visits/${id}?error=${encodeURIComponent(parsed.error.issues[0]?.message ?? "Dados inválidos")}`);
  }

  const data = parsed.data;
  const current = await prisma.visit.findUniqueOrThrow({ where: { id: data.id } });

  const requiredPermission = data.toStatus === "CANCELADA_CLIENTE" || data.toStatus === "CANCELADA_CORRETOR" ? "visits:cancel" : "visits:update";
  if (!session.user.permissions.includes(requiredPermission)) {
    redirect(`/visits/${id}?error=${encodeURIComponent("Você não tem permissão para essa ação.")}`);
  }

  if (data.allowException && !session.user.permissions.includes("visits:override_conflict")) {
    redirect(`/visits/${id}?error=${encodeURIComponent("Você não tem permissão para correções excepcionais de status.")}`);
  }

  if (!canTransitionVisit(current.status, data.toStatus, { allowException: data.allowException })) {
    redirect(
      `/visits/${id}?error=${encodeURIComponent(`Transição de "${current.status}" para "${data.toStatus}" não é permitida.`)}`,
    );
  }

  if (CANCELLATION_STATUSES.has(data.toStatus) && !data.reason) {
    redirect(`/visits/${id}?error=${encodeURIComponent("Informe o motivo para essa mudança de status.")}`);
  }

  if (data.allowException && !data.reason) {
    redirect(`/visits/${id}?error=${encodeURIComponent("Correção excepcional exige justificativa.")}`);
  }

  const isCancellation = data.toStatus === "CANCELADA_CLIENTE" || data.toStatus === "CANCELADA_CORRETOR";
  const eventType = data.allowException ? "CORRECTED_BY_ADMIN" : isCancellation ? "CANCELLED" : "STATUS_CHANGED";

  try {
    await prisma.$transaction(async (tx) => {
      await updateVisitOptimistically(tx, data.id, data.expectedUpdatedAt, {
        status: data.toStatus,
        cancellationReason: isCancellation ? data.reason : current.cancellationReason,
        clientConfirmed: data.toStatus === "CONFIRMADA" ? true : current.clientConfirmed,
      });

      await tx.visitEvent.create({
        data: {
          visitId: data.id,
          eventType,
          previousData: { status: current.status },
          newData: { status: data.toStatus },
          reason: data.reason,
          createdByUserId: session.user.id,
        },
      });
    });
  } catch (error) {
    if (error instanceof ConcurrencyConflictError) {
      redirect(`/visits/${id}?error=${encodeURIComponent(error.message)}`);
    }
    throw error;
  }

  await recordAudit(prisma, {
    entityType: "Visit",
    entityId: data.id,
    action: data.allowException ? "status_override" : "status_change",
    actorType: "USER",
    actorUserId: session.user.id,
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

  revalidatePath(`/visits/${data.id}`);
  revalidatePath("/visits");
}

export async function completeVisitOutcomeAction(formData: FormData) {
  const session = await requirePermission("visits:update");
  const id = String(formData.get("id") ?? "");

  const parsed = visitOutcomeSchema.safeParse({
    id,
    expectedUpdatedAt: formData.get("expectedUpdatedAt"),
    interestLevel: formData.get("interestLevel") || null,
    positivePoints: formData.get("positivePoints") || null,
    objections: formData.get("objections") || null,
    rejectionReason: formData.get("rejectionReason") || null,
    intendsToPropose: formData.get("intendsToPropose") === "on",
    needsFinancingReview: formData.get("needsFinancingReview") === "on",
    wantsToSeeOtherProperties: formData.get("wantsToSeeOtherProperties") === "on",
    recommendedReturnAt: formData.get("recommendedReturnAt") || null,
    outcomeNotes: formData.get("outcomeNotes") || null,
    clientRating: formData.get("clientRating") || null,
    nextAction: formData.get("nextAction") || null,
    createFollowUpTask: formData.get("createFollowUpTask") === "on",
  });

  if (!parsed.success) {
    redirect(`/visits/${id}?error=${encodeURIComponent(parsed.error.issues[0]?.message ?? "Dados inválidos")}`);
  }

  const data = parsed.data;
  const current = await prisma.visit.findUniqueOrThrow({ where: { id: data.id } });

  if (!canTransitionVisit(current.status, "REALIZADA")) {
    redirect(`/visits/${id}?error=${encodeURIComponent(`Não é possível marcar como realizada a partir de "${current.status}".`)}`);
  }

  try {
    await prisma.$transaction(async (tx) => {
      await updateVisitOptimistically(tx, data.id, data.expectedUpdatedAt, {
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
      });

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
          createdByUserId: session.user.id,
        },
      });
    });
  } catch (error) {
    if (error instanceof ConcurrencyConflictError) {
      redirect(`/visits/${id}?error=${encodeURIComponent(error.message)}`);
    }
    throw error;
  }

  await recordAudit(prisma, {
    entityType: "Visit",
    entityId: data.id,
    action: "outcome_recorded",
    actorType: "USER",
    actorUserId: session.user.id,
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
        createdByUserId: session.user.id,
        taskType: "retornar_apos_visita",
        title: "Retornar com o cliente após a visita",
        dueAt: returnAt,
      });
    } catch (error) {
      console.error(`[visits] falha ao criar tarefa de retorno para a visita ${data.id}`, error);
    }
  }

  revalidatePath(`/visits/${data.id}`);
  revalidatePath("/visits");
}

export async function reassignVisitAction(formData: FormData) {
  const session = await requirePermission("visits:reassign");
  const id = String(formData.get("id") ?? "");

  const parsed = visitReassignSchema.safeParse({
    id,
    expectedUpdatedAt: formData.get("expectedUpdatedAt"),
    brokerUserId: formData.get("brokerUserId"),
  });

  if (!parsed.success) {
    redirect(`/visits/${id}?error=${encodeURIComponent("Dados inválidos")}`);
  }

  const data = parsed.data;
  const current = await prisma.visit.findUniqueOrThrow({ where: { id } });
  if (data.brokerUserId === current.brokerUserId) {
    redirect(`/visits/${id}`);
  }

  try {
    await prisma.$transaction(async (tx) => {
      await updateVisitOptimistically(tx, id, data.expectedUpdatedAt, { brokerUserId: data.brokerUserId });

      await tx.visitEvent.create({
        data: {
          visitId: id,
          eventType: "ASSIGNEE_CHANGED",
          previousData: { brokerUserId: current.brokerUserId },
          newData: { brokerUserId: data.brokerUserId },
          reason: "Reatribuição de corretor",
          createdByUserId: session.user.id,
        },
      });
    });
  } catch (error) {
    if (error instanceof ConcurrencyConflictError) {
      redirect(`/visits/${id}?error=${encodeURIComponent(error.message)}`);
    }
    throw error;
  }

  await recordAudit(prisma, {
    entityType: "Visit",
    entityId: id,
    action: "reassign",
    actorType: "USER",
    actorUserId: session.user.id,
    before: { brokerUserId: current.brokerUserId },
    after: { brokerUserId: data.brokerUserId },
  });

  await createNotificationIdempotent(prisma, {
    userId: data.brokerUserId,
    type: "responsavel_alterado",
    title: "Visita atribuída a você",
    body: `Você agora é o corretor responsável pela visita de ${current.scheduledAt.toLocaleString("pt-BR")}.`,
    entityType: "Visit",
    entityId: id,
    idempotencyKey: `visit_reassigned:${id}:${data.brokerUserId}:${Date.now()}`,
  });

  revalidatePath(`/visits/${id}`);
  revalidatePath("/visits");
}
