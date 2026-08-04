import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createNotificationIdempotent, prisma } from "@mabres/db";
import { countUnreadNotifications, listNotificationsForUser, markNotificationRead, notificationHref } from "./notification-service";

/** Testes de integração contra Postgres real — ver .github/workflows/ci.yml. */
describe("notification-service — integração com PostgreSQL", () => {
  let roleId: string;
  let userAId: string;
  let userBId: string;
  const notificationIds: string[] = [];

  beforeAll(async () => {
    const role = await prisma.role.upsert({
      where: { name: "TesteNotificationService" },
      update: {},
      create: { name: "TesteNotificationService" },
    });
    roleId = role.id;

    const [userA, userB] = await Promise.all([
      prisma.user.create({ data: { name: "Usuário A Notif", email: `notif-a-${Date.now()}@example.com`, roleId } }),
      prisma.user.create({ data: { name: "Usuário B Notif", email: `notif-b-${Date.now()}@example.com`, roleId } }),
    ]);
    userAId = userA.id;
    userBId = userB.id;

    const n1 = await createNotificationIdempotent(prisma, {
      userId: userAId,
      type: "tarefa_vencida",
      title: "Tarefa vencida — teste 1",
      entityType: "Task",
      entityId: "task-fake-1",
      idempotencyKey: `test:${userAId}:1:${Date.now()}`,
    });
    const n2 = await createNotificationIdempotent(prisma, {
      userId: userAId,
      type: "visita_proxima",
      title: "Visita próxima — teste 2",
      entityType: "Visit",
      entityId: "visit-fake-2",
      idempotencyKey: `test:${userAId}:2:${Date.now()}`,
    });
    const n3ForUserB = await createNotificationIdempotent(prisma, {
      userId: userBId,
      type: "tarefa_vencida",
      title: "Tarefa vencida — usuário B",
      entityType: "Task",
      entityId: "task-fake-3",
      idempotencyKey: `test:${userBId}:3:${Date.now()}`,
    });
    if (n1) notificationIds.push(n1.id);
    if (n2) notificationIds.push(n2.id);
    if (n3ForUserB) notificationIds.push(n3ForUserB.id);
  });

  afterAll(async () => {
    await prisma.notification.deleteMany({ where: { id: { in: notificationIds } } });
    await prisma.user.deleteMany({ where: { id: { in: [userAId, userBId] } } });
    await prisma.role.deleteMany({ where: { name: "TesteNotificationService" } });
    await prisma.$disconnect();
  });

  it("countUnreadNotifications conta só as não lidas do próprio usuário", async () => {
    await expect(countUnreadNotifications(prisma, userAId)).resolves.toBe(2);
    await expect(countUnreadNotifications(prisma, userBId)).resolves.toBe(1);
  });

  it("listNotificationsForUser retorna só as do próprio usuário, mais recentes primeiro", async () => {
    const list = await listNotificationsForUser(prisma, userAId);
    expect(list).toHaveLength(2);
    expect(list.every((n) => n.userId === userAId)).toBe(true);
    expect(list[0]?.createdAt.getTime()).toBeGreaterThanOrEqual(list[1]!.createdAt.getTime());
  });

  it("markNotificationRead marca como lida e retorna true quando a notificação pertence ao usuário", async () => {
    const [target] = await listNotificationsForUser(prisma, userAId);
    const ok = await markNotificationRead(prisma, userAId, target!.id);
    expect(ok).toBe(true);

    const updated = await prisma.notification.findUniqueOrThrow({ where: { id: target!.id } });
    expect(updated.readAt).not.toBeNull();

    await expect(countUnreadNotifications(prisma, userAId)).resolves.toBe(1);
  });

  it("markNotificationRead retorna false e não altera nada quando a notificação é de outro usuário", async () => {
    const [otherUsersNotification] = await listNotificationsForUser(prisma, userBId);
    const ok = await markNotificationRead(prisma, userAId, otherUsersNotification!.id);
    expect(ok).toBe(false);

    const untouched = await prisma.notification.findUniqueOrThrow({ where: { id: otherUsersNotification!.id } });
    expect(untouched.readAt).toBeNull();
  });

  it("markNotificationRead retorna false para um ID inexistente, sem lançar erro", async () => {
    await expect(markNotificationRead(prisma, userAId, "id-que-nao-existe")).resolves.toBe(false);
  });

  it("notificationHref monta o link certo por entityType, e null quando não reconhecido ou sem entityId", () => {
    expect(notificationHref({ entityType: "Task", entityId: "abc" })).toBe("/tasks/abc");
    expect(notificationHref({ entityType: "Visit", entityId: "xyz" })).toBe("/visits/xyz");
    expect(notificationHref({ entityType: "Contact", entityId: "abc" })).toBeNull();
    expect(notificationHref({ entityType: "Task", entityId: null })).toBeNull();
  });
});
