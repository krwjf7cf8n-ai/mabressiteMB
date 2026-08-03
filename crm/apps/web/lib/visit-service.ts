import { prisma } from "@mabres/db";
import { findVisitConflicts, type VisitConflictCandidate, type VisitConflictReason } from "@mabres/shared";

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
