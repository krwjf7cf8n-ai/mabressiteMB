import type { PrismaClient } from "@mabres/db";

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
}

/**
 * Função pura: a partir das tarefas vencidas e do conjunto de tarefas que já
 * geraram notificação, decide quais notificações novas devem ser criadas.
 * Mantida separada da consulta ao banco para ser testável sem Postgres/Redis.
 */
export function buildOverdueTaskNotifications(
  overdueTasks: OverdueTaskLike[],
  alreadyNotifiedTaskIds: ReadonlySet<string>,
): Array<NotificationDraft & { taskId: string }> {
  return overdueTasks
    .filter((task) => !alreadyNotifiedTaskIds.has(task.id))
    .map((task) => ({
      taskId: task.id,
      userId: task.assignedUserId,
      type: "tarefa_vencida" as const,
      title: "Tarefa vencida",
      body: `A tarefa "${task.title}" está vencida desde ${task.dueAt.toLocaleDateString("pt-BR")}.`,
    }));
}

/** Executa o job real contra o banco: busca tarefas vencidas e cria notificações que ainda não existem. */
export async function runOverdueTasksJob(prisma: PrismaClient): Promise<number> {
  const now = new Date();

  const overdueTasks = await prisma.task.findMany({
    where: { dueAt: { lt: now }, status: { in: ["PENDENTE", "EM_ANDAMENTO"] } },
    select: { id: true, title: true, assignedUserId: true, dueAt: true },
  });

  if (overdueTasks.length === 0) return 0;

  const existingNotifications = await prisma.notification.findMany({
    where: {
      type: "tarefa_vencida",
      userId: { in: overdueTasks.map((t) => t.assignedUserId) },
      createdAt: { gte: new Date(now.getTime() - 24 * 60 * 60 * 1000) },
    },
    select: { body: true },
  });

  const alreadyNotifiedTaskIds = new Set(
    overdueTasks.filter((t) => existingNotifications.some((n) => n.body.includes(t.title))).map((t) => t.id),
  );

  const drafts = buildOverdueTaskNotifications(
    overdueTasks.map((t) => ({ ...t, dueAt: t.dueAt as Date })),
    alreadyNotifiedTaskIds,
  );

  if (drafts.length === 0) return 0;

  await prisma.notification.createMany({
    data: drafts.map(({ taskId: _taskId, ...draft }) => draft),
  });

  return drafts.length;
}
