import { createNotificationIdempotent, type PrismaClient } from "@mabres/db";

export interface OverdueTaskLike {
  id: string;
  title: string;
  assignedUserId: string;
  dueAt: Date;
}

export interface NotificationDraft {
  userId: string;
  type: "tarefa_vencida";
  title: string;
  body: string;
  entityType: "Task";
  entityId: string;
  idempotencyKey: string;
}

function isoDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

/**
 * Função pura: monta os rascunhos de notificação de tarefa vencida, um por
 * tarefa/dia (chave de idempotência `task_overdue:{taskId}:{yyyy-mm-dd}`).
 * A garantia de não duplicar vem da constraint única no banco — esta função
 * só decide o conteúdo, testável sem Postgres.
 */
export function buildOverdueTaskNotifications(overdueTasks: OverdueTaskLike[], today: Date): NotificationDraft[] {
  const day = isoDate(today);
  return overdueTasks.map((task) => ({
    taskId: task.id,
    userId: task.assignedUserId,
    type: "tarefa_vencida" as const,
    title: "Tarefa vencida",
    body: `A tarefa "${task.title}" está vencida desde ${task.dueAt.toLocaleDateString("pt-BR")}.`,
    entityType: "Task" as const,
    entityId: task.id,
    idempotencyKey: `task_overdue:${task.id}:${day}`,
  }));
}

/** Executa o job real: busca tarefas vencidas e cria notificações idempotentes (uma por tarefa/dia). */
export async function runOverdueTasksJob(prisma: PrismaClient): Promise<number> {
  const now = new Date();

  const overdueTasks = await prisma.task.findMany({
    where: { dueAt: { lt: now }, status: { in: ["PENDENTE", "EM_ANDAMENTO"] } },
    select: { id: true, title: true, assignedUserId: true, dueAt: true },
  });

  if (overdueTasks.length === 0) return 0;

  const drafts = buildOverdueTaskNotifications(
    overdueTasks.map((t) => ({ ...t, dueAt: t.dueAt as Date })),
    now,
  );

  let created = 0;
  for (const draft of drafts) {
    const result = await createNotificationIdempotent(prisma, draft);
    if (result) created += 1;
  }

  return created;
}
