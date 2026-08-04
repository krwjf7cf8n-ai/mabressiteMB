"use server";

import { prisma } from "@mabres/db";
import { requireSession } from "@/lib/session";
import { listNotificationsForUser, markNotificationRead } from "@/lib/notification-service";

export interface NotificationListItem {
  id: string;
  type: string;
  title: string;
  body: string | null;
  entityType: string | null;
  entityId: string | null;
  readAt: string | null;
  createdAt: string;
}

/** Chamada pelo sino de notificações (client component) ao abrir o dropdown. */
export async function listMyNotificationsAction(): Promise<NotificationListItem[]> {
  const session = await requireSession();
  const notifications = await listNotificationsForUser(prisma, session.user.id);
  return notifications.map((n) => ({
    id: n.id,
    type: n.type,
    title: n.title,
    body: n.body,
    entityType: n.entityType,
    entityId: n.entityId,
    readAt: n.readAt?.toISOString() ?? null,
    createdAt: n.createdAt.toISOString(),
  }));
}

/** Chamada ao clicar numa notificação (marcar como lida antes/durante a navegação). */
export async function markNotificationReadAction(notificationId: string): Promise<{ ok: boolean }> {
  const session = await requireSession();
  const ok = await markNotificationRead(prisma, session.user.id, notificationId);
  return { ok };
}
