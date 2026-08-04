"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { ConcurrencyConflictError, prisma } from "@mabres/db";
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
  changeVisitStatus,
  checkVisitConflicts,
  conflictWindow,
  createVisit,
  recordVisitOutcome,
  reassignVisit,
  rescheduleVisit,
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

  const visit = await createVisit(prisma, data, conflicts, contact.name, session.user.id);

  revalidatePath("/visits");
  redirect(`/visits/${visit.id}`);
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
    await rescheduleVisit(prisma, data, current, conflicts, session.user.id);
  } catch (error) {
    if (error instanceof ConcurrencyConflictError) {
      redirect(`/visits/${id}?error=${encodeURIComponent(error.message)}`);
    }
    throw error;
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

  try {
    await changeVisitStatus(prisma, data, current, session.user.id);
  } catch (error) {
    if (error instanceof ConcurrencyConflictError) {
      redirect(`/visits/${id}?error=${encodeURIComponent(error.message)}`);
    }
    throw error;
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
    await recordVisitOutcome(prisma, data, current, session.user.id);
  } catch (error) {
    if (error instanceof ConcurrencyConflictError) {
      redirect(`/visits/${id}?error=${encodeURIComponent(error.message)}`);
    }
    throw error;
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
    await reassignVisit(prisma, id, data.expectedUpdatedAt, current, data.brokerUserId, session.user.id);
  } catch (error) {
    if (error instanceof ConcurrencyConflictError) {
      redirect(`/visits/${id}?error=${encodeURIComponent(error.message)}`);
    }
    throw error;
  }

  revalidatePath(`/visits/${id}`);
  revalidatePath("/visits");
}
