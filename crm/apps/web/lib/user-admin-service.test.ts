import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { prisma } from "@mabres/db";
import { LastAdminError, PrivilegeEscalationError, SelfRoleChangeError, verifyPassword } from "@mabres/shared";
import {
  changeUserRole,
  countUserRecords,
  createUserWithTempPassword,
  disableUser,
  reactivateUser,
  reassignUserRecords,
  resetUserPassword,
  selfChangePassword,
  terminateAllSessions,
  terminateSession,
} from "./user-admin-service";

/**
 * Testes de integração contra Postgres real — ver .github/workflows/ci.yml.
 * A regra do "último administrador" é GLOBAL (soma todo usuário ativo em
 * qualquer papel com isAdminRole=true, não só o papel de teste) — por isso,
 * antes de testar esse bloqueio, os administradores reais do seed (ex.:
 * Matheus/Brenda) precisam ficar temporariamente inativos, senão o sistema
 * sempre "vê" outros administradores e o bloqueio nunca dispararia neste
 * ambiente de teste. Restaurados em afterAll.
 */
describe("user-admin-service — integração com PostgreSQL", () => {
  let adminRoleId: string;
  let limitedRoleId: string;
  let limitedRolePermissionKeys: string[];
  const createdUserIds: string[] = [];
  const createdRoleIds: string[] = [];
  let neutralizedExternalAdminIds: string[] = [];

  beforeAll(async () => {
    const externalAdmins = await prisma.user.findMany({
      where: { role: { isAdminRole: true }, isActive: true, deletedAt: null },
      select: { id: true },
    });
    neutralizedExternalAdminIds = externalAdmins.map((u) => u.id);
    if (neutralizedExternalAdminIds.length > 0) {
      await prisma.user.updateMany({ where: { id: { in: neutralizedExternalAdminIds } }, data: { isActive: false } });
    }
  });

  beforeEach(async () => {
    const contactsView = await prisma.permission.upsert({
      where: { key: "contacts:view_own" },
      update: {},
      create: { key: "contacts:view_own", description: "teste" },
    });
    const criticalPerm = await prisma.permission.upsert({
      where: { key: "users:create" },
      update: {},
      create: { key: "users:create", description: "teste" },
    });

    // Papel "admin" de teste precisa ter permissões de verdade (como o Administrador real tem "*"),
    // senão qualquer ator "escala" trivialmente para um papel sem nenhuma permissão de fato.
    const adminRole = await prisma.role.upsert({
      where: { name: "TesteUserAdminRole" },
      update: {},
      create: {
        name: "TesteUserAdminRole",
        isAdminRole: true,
        permissions: { create: [{ permissionId: contactsView.id }, { permissionId: criticalPerm.id }] },
      },
    });
    adminRoleId = adminRole.id;

    const limitedRole = await prisma.role.upsert({
      where: { name: "TesteLimitedRole" },
      update: {},
      create: { name: "TesteLimitedRole", isAdminRole: false, permissions: { create: [{ permissionId: contactsView.id }] } },
    });
    limitedRoleId = limitedRole.id;
    limitedRolePermissionKeys = ["contacts:view_own"];
  });

  /** Cada teste começa sem nenhum usuário-admin ativo "sobrando" de um teste anterior. */
  afterEach(async () => {
    if (createdUserIds.length > 0) {
      await prisma.user.updateMany({ where: { id: { in: createdUserIds } }, data: { isActive: false } });
    }
  });

  afterAll(async () => {
    if (neutralizedExternalAdminIds.length > 0) {
      await prisma.user.updateMany({ where: { id: { in: neutralizedExternalAdminIds } }, data: { isActive: true } });
    }
    await prisma.userSession.deleteMany({ where: { userId: { in: createdUserIds } } });
    // AuditLog é append-only (G17) — não é apagado no cleanup.
    await prisma.user.deleteMany({ where: { id: { in: createdUserIds } } });
    await prisma.role.deleteMany({ where: { id: { in: createdRoleIds } } });
    await prisma.role.deleteMany({ where: { name: { in: ["TesteUserAdminRole", "TesteLimitedRole"] } } });
    await prisma.$disconnect();
  });

  async function makeAdminUser(name: string) {
    const user = await prisma.user.create({ data: { name, email: `${name.toLowerCase()}-${Date.now()}-${Math.random()}@example.com`, roleId: adminRoleId } });
    createdUserIds.push(user.id);
    return user;
  }

  const allPermissionKeys = () => prisma.permission.findMany().then((rows) => rows.map((r) => r.key));

  it("createUserWithTempPassword cria usuário com senha temporária e força troca no próximo login", async () => {
    const actor = await makeAdminUser("Admin Criador");
    const actorPerms = await allPermissionKeys();

    const { user, tempPassword } = await createUserWithTempPassword(
      { name: "Novo Corretor", email: `novo-${Date.now()}@example.com`, phone: null, roleId: limitedRoleId },
      actor.id,
      actorPerms,
    );
    createdUserIds.push(user.id);

    expect(user.mustChangePassword).toBe(true);
    expect(user.createdByUserId).toBe(actor.id);
    expect(await verifyPassword(tempPassword, user.passwordHash!)).toBe(true);

    const audit = await prisma.auditLog.findFirst({ where: { entityType: "User", entityId: user.id, action: "create" } });
    expect(audit).not.toBeNull();
    expect(JSON.stringify(audit?.after)).not.toContain(tempPassword); // nunca audita a senha em claro
  });

  it("createUserWithTempPassword bloqueia elevação de privilégio: ator sem todas as permissões do papel alvo", async () => {
    const actor = await makeAdminUser("Admin Limitado");
    await expect(
      createUserWithTempPassword(
        { name: "Tentativa", email: `tentativa-${Date.now()}@example.com`, phone: null, roleId: adminRoleId },
        actor.id,
        limitedRolePermissionKeys, // ator só tem contacts:view_own, papel alvo é admin (isAdminRole)
      ),
    ).rejects.toThrow(PrivilegeEscalationError);
  });

  it("disableUser desativa, revoga sessões ativas, preserva o registro", async () => {
    const admin = await makeAdminUser("Admin Que Desativa");
    const target = await makeAdminUser("Alvo Comum");
    await prisma.user.update({ where: { id: target.id }, data: { roleId: limitedRoleId } });
    const session = await prisma.userSession.create({ data: { userId: target.id } });

    await disableUser(target.id, "Saiu da empresa", admin.id);

    const reloaded = await prisma.user.findUniqueOrThrow({ where: { id: target.id } });
    expect(reloaded.isActive).toBe(false);
    expect(reloaded.disabledByUserId).toBe(admin.id);
    expect(reloaded.disabledReason).toBe("Saiu da empresa");

    const reloadedSession = await prisma.userSession.findUniqueOrThrow({ where: { id: session.id } });
    expect(reloadedSession.revokedAt).not.toBeNull();
  });

  it("disableUser bloqueia desativar o último administrador ativo", async () => {
    const onlyAdmin = await makeAdminUser("Único Admin");
    await expect(disableUser(onlyAdmin.id, "teste", onlyAdmin.id)).rejects.toThrow(LastAdminError);

    const reloaded = await prisma.user.findUniqueOrThrow({ where: { id: onlyAdmin.id } });
    expect(reloaded.isActive).toBe(true); // nada foi alterado
  });

  it("disableUser permite quando existe outro administrador ativo", async () => {
    const admin1 = await makeAdminUser("Admin Um");
    const admin2 = await makeAdminUser("Admin Dois");

    await disableUser(admin1.id, "teste", admin2.id);
    const reloaded = await prisma.user.findUniqueOrThrow({ where: { id: admin1.id } });
    expect(reloaded.isActive).toBe(false);
  });

  it("reactivateUser limpa os campos de desativação", async () => {
    const admin = await makeAdminUser("Admin Reativador");
    const target = await makeAdminUser("Alvo Reativado");
    await prisma.user.update({ where: { id: target.id }, data: { roleId: limitedRoleId } });
    await disableUser(target.id, "teste", admin.id);

    await reactivateUser(target.id, admin.id);
    const reloaded = await prisma.user.findUniqueOrThrow({ where: { id: target.id } });
    expect(reloaded.isActive).toBe(true);
    expect(reloaded.disabledAt).toBeNull();
  });

  it("changeUserRole bloqueia o ator alterar o próprio papel", async () => {
    const admin = await makeAdminUser("Admin Auto");
    await expect(
      changeUserRole({ targetUserId: admin.id, newRoleId: limitedRoleId, expectedUpdatedAt: admin.updatedAt, actorUserId: admin.id, actorPermissions: [] }),
    ).rejects.toThrow(SelfRoleChangeError);
  });

  it("changeUserRole bloqueia elevação de privilégio", async () => {
    const actor = await makeAdminUser("Ator Limitado Role");
    const target = await makeAdminUser("Alvo Role");
    await prisma.user.update({ where: { id: target.id }, data: { roleId: limitedRoleId } });
    const reloadedTarget = await prisma.user.findUniqueOrThrow({ where: { id: target.id } });

    await expect(
      changeUserRole({
        targetUserId: target.id,
        newRoleId: adminRoleId,
        expectedUpdatedAt: reloadedTarget.updatedAt,
        actorUserId: actor.id,
        actorPermissions: limitedRolePermissionKeys,
      }),
    ).rejects.toThrow(PrivilegeEscalationError);
  });

  it("changeUserRole bloqueia tirar o último administrador do papel de admin", async () => {
    // Ator NÃO é admin — só precisa ter as permissões do papel alvo (não-admin) para passar a checagem de escalação.
    const onlyAdmin = await makeAdminUser("Único Admin Troca");
    const actor = await prisma.user.create({
      data: { name: "Ator Não-Admin", email: `ator-nao-admin-${Date.now()}@example.com`, roleId: limitedRoleId },
    });
    createdUserIds.push(actor.id);

    await expect(
      changeUserRole({
        targetUserId: onlyAdmin.id,
        newRoleId: limitedRoleId,
        expectedUpdatedAt: onlyAdmin.updatedAt,
        actorUserId: actor.id,
        actorPermissions: limitedRolePermissionKeys,
      }),
    ).rejects.toThrow(LastAdminError);
  });

  it("changeUserRole detecta concorrência (expectedUpdatedAt desatualizado é rejeitado)", async () => {
    const actor = await makeAdminUser("Ator Concorrencia");
    const target = await makeAdminUser("Alvo Concorrencia");
    await prisma.user.update({ where: { id: target.id }, data: { roleId: limitedRoleId } });
    const stale = await prisma.user.findUniqueOrThrow({ where: { id: target.id } });

    // outra requisição altera o usuário nesse meio tempo
    await prisma.user.update({ where: { id: target.id }, data: { phone: "11999999999" } });

    const actorPerms = await allPermissionKeys();
    await expect(
      changeUserRole({ targetUserId: target.id, newRoleId: adminRoleId, expectedUpdatedAt: stale.updatedAt, actorUserId: actor.id, actorPermissions: actorPerms }),
    ).rejects.toThrow(/alterado por outra pessoa/);
  });

  it("resetUserPassword gera nova senha, força troca e revoga sessões ativas", async () => {
    const admin = await makeAdminUser("Admin Reset");
    const target = await makeAdminUser("Alvo Reset");
    const session = await prisma.userSession.create({ data: { userId: target.id } });

    const tempPassword = await resetUserPassword(target.id, admin.id);
    const reloaded = await prisma.user.findUniqueOrThrow({ where: { id: target.id } });
    expect(reloaded.mustChangePassword).toBe(true);
    expect(await verifyPassword(tempPassword, reloaded.passwordHash!)).toBe(true);

    const reloadedSession = await prisma.userSession.findUniqueOrThrow({ where: { id: session.id } });
    expect(reloadedSession.revokedAt).not.toBeNull();
  });

  it("selfChangePassword exige a senha atual correta", async () => {
    const { hashPassword } = await import("@mabres/shared");
    const user = await makeAdminUser("Usuário Troca Senha");
    await prisma.user.update({ where: { id: user.id }, data: { passwordHash: await hashPassword("SenhaAntiga123") } });

    await expect(selfChangePassword(user.id, "SenhaErrada", "SenhaNova12345", false)).rejects.toThrow("Senha atual incorreta");

    await selfChangePassword(user.id, "SenhaAntiga123", "SenhaNova12345", false);
    const reloaded = await prisma.user.findUniqueOrThrow({ where: { id: user.id } });
    expect(await verifyPassword("SenhaNova12345", reloaded.passwordHash!)).toBe(true);
    expect(reloaded.mustChangePassword).toBe(false);
  });

  it("terminateSession encerra só a sessão indicada; terminateAllSessions encerra as demais exceto a atual", async () => {
    const admin = await makeAdminUser("Admin Sessões");
    const target = await makeAdminUser("Alvo Sessões");
    const s1 = await prisma.userSession.create({ data: { userId: target.id } });
    const s2 = await prisma.userSession.create({ data: { userId: target.id } });
    const s3 = await prisma.userSession.create({ data: { userId: target.id } });

    await terminateSession(s1.id, target.id, admin.id);
    const reloadedS1 = await prisma.userSession.findUniqueOrThrow({ where: { id: s1.id } });
    expect(reloadedS1.revokedAt).not.toBeNull();
    const reloadedS2 = await prisma.userSession.findUniqueOrThrow({ where: { id: s2.id } });
    expect(reloadedS2.revokedAt).toBeNull();

    const count = await terminateAllSessions(target.id, admin.id, s2.id);
    expect(count).toBe(1); // só s3, já que s1 já estava revogada e s2 foi excetuada
    const reloadedS2b = await prisma.userSession.findUniqueOrThrow({ where: { id: s2.id } });
    expect(reloadedS2b.revokedAt).toBeNull();
    const reloadedS3 = await prisma.userSession.findUniqueOrThrow({ where: { id: s3.id } });
    expect(reloadedS3.revokedAt).not.toBeNull();
  });

  it("concorrência real: duas desativações simultâneas nos dois últimos administradores nunca zeram os administradores", async () => {
    const admin1 = await makeAdminUser("Admin Concorrente 1");
    const admin2 = await makeAdminUser("Admin Concorrente 2");

    const results = await Promise.allSettled([
      disableUser(admin1.id, "concorrência", admin2.id),
      disableUser(admin2.id, "concorrência", admin1.id),
    ]);

    const succeeded = results.filter((r) => r.status === "fulfilled");
    const failed = results.filter((r) => r.status === "rejected");
    expect(succeeded).toHaveLength(1);
    expect(failed).toHaveLength(1);

    const stillActiveAdmins = await prisma.user.count({
      where: { roleId: adminRoleId, isActive: true, id: { in: [admin1.id, admin2.id] } },
    });
    expect(stillActiveAdmins).toBe(1); // nunca zero
  });

  it("reassignUserRecords move só o que está ativo/pendente, preserva concluídos e audita", async () => {
    const fromUser = await makeAdminUser("De Quem Reatribui");
    const toUser = await makeAdminUser("Para Quem Reatribui");

    const contact = await prisma.contact.create({ data: { name: "Lead Reatribuir", ownerUserId: fromUser.id } });
    const property = await prisma.property.create({
      data: { internalCode: `TEST-REASSIGN-${Date.now()}`, propertyType: "Apartamento", status: "ativo", responsibleUserId: fromUser.id },
    });
    const pendingTask = await prisma.task.create({
      data: { title: "Tarefa pendente", assignedUserId: fromUser.id, createdByUserId: fromUser.id, taskType: "outro", status: "PENDENTE" },
    });
    const completedTask = await prisma.task.create({
      data: { title: "Tarefa concluída", assignedUserId: fromUser.id, createdByUserId: fromUser.id, taskType: "outro", status: "CONCLUIDA" },
    });

    const before = await countUserRecords(fromUser.id);
    expect(before.activeContacts).toBe(1);
    expect(before.pendingTasks).toBe(1);
    expect(before.activeProperties).toBe(1);

    const result = await reassignUserRecords(
      { fromUserId: fromUser.id, toUserId: toUser.id, reassignContacts: true, reassignTasks: true, reassignVisits: false, reassignProperties: true },
      fromUser.id,
    );
    expect(result).toEqual({ contacts: 1, tasks: 1, visits: 0, properties: 1 });

    const [reloadedContact, reloadedProperty, reloadedPendingTask, reloadedCompletedTask] = await Promise.all([
      prisma.contact.findUniqueOrThrow({ where: { id: contact.id } }),
      prisma.property.findUniqueOrThrow({ where: { id: property.id } }),
      prisma.task.findUniqueOrThrow({ where: { id: pendingTask.id } }),
      prisma.task.findUniqueOrThrow({ where: { id: completedTask.id } }),
    ]);
    expect(reloadedContact.ownerUserId).toBe(toUser.id);
    expect(reloadedProperty.responsibleUserId).toBe(toUser.id);
    expect(reloadedPendingTask.assignedUserId).toBe(toUser.id);
    expect(reloadedCompletedTask.assignedUserId).toBe(fromUser.id); // concluída preserva o histórico, não é reatribuída

    const audit = await prisma.auditLog.findFirst({ where: { entityType: "User", entityId: fromUser.id, action: "records_reassigned" } });
    expect(audit).not.toBeNull();
    expect((audit?.after as { contacts: number })?.contacts).toBe(1);

    await prisma.task.deleteMany({ where: { id: { in: [pendingTask.id, completedTask.id] } } });
    await prisma.contact.delete({ where: { id: contact.id } });
    await prisma.property.delete({ where: { id: property.id } });
  });
});
