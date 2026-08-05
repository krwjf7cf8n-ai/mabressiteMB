import type { PrismaClient } from "@mabres/db";

/**
 * Camada de apresentação de notificações (G28). A criação continua
 * exclusivamente pelo mecanismo já existente (`createNotificationIdempotent`,
 * usado pelo worker e pelas actions de Visitas/Tarefas) — este arquivo só lê
 * e marca como lida, sempre restrito ao próprio usuário.
 */

export const NOTIFICATION_LIST_LIMIT = 20;

export async function countUnreadNotifications(client: PrismaClient, userId: string): Promise<number> {
  return client.notification.count({ where: { userId, readAt: null } });
}

export async function listNotificationsForUser(client: PrismaClient, userId: string, limit = NOTIFICATION_LIST_LIMIT) {
  return client.notification.findMany({
    where: { userId },
    orderBy: { createdAt: "desc" },
    take: limit,
  });
}

/**
 * Marca como lida só se a notificação pertencer ao usuário — o filtro por
 * `userId` no `updateMany` garante isso atomicamente (0 linhas afetadas se a
 * notificação for de outro usuário ou não existir, sem vazar qual dos dois).
 */
export async function markNotificationRead(client: PrismaClient, userId: string, notificationId: string): Promise<boolean> {
  const result = await client.notification.updateMany({
    where: { id: notificationId, userId, readAt: null },
    data: { readAt: new Date() },
  });
  return result.count > 0;
}

export function notificationHref(notification: { entityType: string | null; entityId: string | null }): string | null {
  if (!notification.entityId) return null;
  if (notification.entityType === "Task") return `/tasks/${notification.entityId}`;
  if (notification.entityType === "Visit") return `/visits/${notification.entityId}`;
  return null;
}
