import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { prisma } from "@mabres/db";
import { PrivilegeEscalationError } from "@mabres/shared";
import { createRole, disableRole, duplicateRole, updateRolePermissions } from "./role-admin-service";

/** Testes de integração contra Postgres real — ver .github/workflows/ci.yml. */
describe("role-admin-service — integração com PostgreSQL", () => {
  let actorUserId: string;
  let adminRoleId: string;
  const createdRoleIds: string[] = [];
  const createdUserIds: string[] = [];

  beforeEach(async () => {
    const [contactsView, tasksView] = await Promise.all([
      prisma.permission.upsert({ where: { key: "contacts:view_own" }, update: {}, create: { key: "contacts:view_own", description: "teste" } }),
      prisma.permission.upsert({ where: { key: "tasks:view" }, update: {}, create: { key: "tasks:view", description: "teste" } }),
    ]);

    const adminRole = await prisma.role.upsert({
      where: { name: "TesteRoleAdminRole" },
      update: {},
      create: {
        name: "TesteRoleAdminRole",
        isAdminRole: true,
        permissions: { create: [{ permissionId: contactsView.id }, { permissionId: tasksView.id }] },
      },
    });
    adminRoleId = adminRole.id;

    const actor = await prisma.user.create({ data: { name: "Ator Papéis", email: `ator-papeis-${Date.now()}-${Math.random()}@example.com`, roleId: adminRoleId } });
    actorUserId = actor.id;
    createdUserIds.push(actor.id);
  });

  afterAll(async () => {
    await prisma.auditLog.deleteMany({ where: { entityType: { in: ["Role"] }, entityId: { in: createdRoleIds } } });
    await prisma.auditLog.deleteMany({ where: { entityType: "User", entityId: { in: createdUserIds } } });
    await prisma.user.deleteMany({ where: { id: { in: createdUserIds } } });
    await prisma.role.deleteMany({ where: { id: { in: createdRoleIds } } });
    await prisma.role.deleteMany({ where: { name: "TesteRoleAdminRole" } });
    await prisma.$disconnect();
  });

  it("createRole cria papel com as permissões pedidas e audita", async () => {
    const role = await createRole({ name: `Papel Teste ${Date.now()}`, description: "teste", permissionKeys: ["contacts:view_own"] }, actorUserId, [
      "contacts:view_own",
      "tasks:view",
    ]);
    createdRoleIds.push(role.id);

    const withPerms = await prisma.role.findUniqueOrThrow({ where: { id: role.id }, include: { permissions: { include: { permission: true } } } });
    expect(withPerms.permissions.map((p) => p.permission.key)).toEqual(["contacts:view_own"]);
    expect(withPerms.isSystem).toBe(false);
    expect(withPerms.isAdminRole).toBe(false);

    const audit = await prisma.auditLog.findFirst({ where: { entityType: "Role", entityId: role.id, action: "create" } });
    expect(audit).not.toBeNull();
  });

  it("createRole bloqueia elevação de privilégio", async () => {
    await expect(
      createRole({ name: `Papel Escalado ${Date.now()}`, description: null, permissionKeys: ["contacts:view_own", "roles:assign"] }, actorUserId, [
        "contacts:view_own",
      ]),
    ).rejects.toThrow(PrivilegeEscalationError);
  });

  it("updateRolePermissions substitui o conjunto de permissões e audita antes/depois", async () => {
    const role = await createRole({ name: `Papel Editável ${Date.now()}`, description: null, permissionKeys: ["contacts:view_own"] }, actorUserId, [
      "contacts:view_own",
      "tasks:view",
    ]);
    createdRoleIds.push(role.id);

    await updateRolePermissions(
      { roleId: role.id, expectedUpdatedAt: role.updatedAt, name: role.name, description: "atualizado", permissionKeys: ["tasks:view"] },
      actorUserId,
      ["contacts:view_own", "tasks:view"],
    );

    const reloaded = await prisma.role.findUniqueOrThrow({ where: { id: role.id }, include: { permissions: { include: { permission: true } } } });
    expect(reloaded.permissions.map((p) => p.permission.key)).toEqual(["tasks:view"]);

    const audit = await prisma.auditLog.findFirst({ where: { entityType: "Role", entityId: role.id, action: "update_permissions" } });
    expect((audit?.before as { permissionKeys: string[] })?.permissionKeys).toEqual(["contacts:view_own"]);
    expect((audit?.after as { permissionKeys: string[] })?.permissionKeys).toEqual(["tasks:view"]);
  });

  it("updateRolePermissions bloqueia elevação de privilégio", async () => {
    const role = await createRole({ name: `Papel Editável 2 ${Date.now()}`, description: null, permissionKeys: [] }, actorUserId, ["contacts:view_own"]);
    createdRoleIds.push(role.id);

    await expect(
      updateRolePermissions({ roleId: role.id, expectedUpdatedAt: role.updatedAt, name: role.name, description: null, permissionKeys: ["roles:assign"] }, actorUserId, [
        "contacts:view_own",
      ]),
    ).rejects.toThrow(PrivilegeEscalationError);
  });

  it("updateRolePermissions nunca edita o papel de administrador (isAdminRole)", async () => {
    const adminRole = await prisma.role.findUniqueOrThrow({ where: { id: adminRoleId } });
    await expect(
      updateRolePermissions(
        { roleId: adminRoleId, expectedUpdatedAt: adminRole.updatedAt, name: adminRole.name, description: null, permissionKeys: [] },
        actorUserId,
        ["contacts:view_own", "tasks:view"],
      ),
    ).rejects.toThrow(/não pode ser editado/);
  });

  it("updateRolePermissions detecta concorrência (expectedUpdatedAt desatualizado)", async () => {
    const role = await createRole({ name: `Papel Concorrência ${Date.now()}`, description: null, permissionKeys: [] }, actorUserId, ["contacts:view_own"]);
    createdRoleIds.push(role.id);

    // outra requisição altera o papel nesse meio tempo
    await prisma.role.update({ where: { id: role.id }, data: { description: "alterado por outra pessoa" } });

    await expect(
      updateRolePermissions({ roleId: role.id, expectedUpdatedAt: role.updatedAt, name: role.name, description: "minha alteração", permissionKeys: [] }, actorUserId, [
        "contacts:view_own",
      ]),
    ).rejects.toThrow(/alterado por outra pessoa/);
  });

  it("disableRole bloqueia quando há usuários ativos vinculados", async () => {
    const role = await createRole({ name: `Papel Com Usuário ${Date.now()}`, description: null, permissionKeys: [] }, actorUserId, ["contacts:view_own"]);
    createdRoleIds.push(role.id);
    const linkedUser = await prisma.user.create({ data: { name: "Vinculado", email: `vinculado-${Date.now()}@example.com`, roleId: role.id } });
    createdUserIds.push(linkedUser.id);

    await expect(disableRole(role.id, actorUserId)).rejects.toThrow(/usuário\(s\) ativo\(s\)/);
  });

  it("disableRole funciona quando não há usuários ativos vinculados", async () => {
    const role = await createRole({ name: `Papel Vazio ${Date.now()}`, description: null, permissionKeys: [] }, actorUserId, ["contacts:view_own"]);
    createdRoleIds.push(role.id);

    await disableRole(role.id, actorUserId);
    const reloaded = await prisma.role.findUniqueOrThrow({ where: { id: role.id } });
    expect(reloaded.disabledAt).not.toBeNull();
  });

  it("disableRole nunca desativa o papel de administrador", async () => {
    await expect(disableRole(adminRoleId, actorUserId)).rejects.toThrow(/não pode ser desativado/);
  });

  it("duplicateRole copia o conjunto de permissões do papel de origem", async () => {
    const source = await createRole({ name: `Papel Origem ${Date.now()}`, description: null, permissionKeys: ["contacts:view_own", "tasks:view"] }, actorUserId, [
      "contacts:view_own",
      "tasks:view",
    ]);
    createdRoleIds.push(source.id);

    const copy = await duplicateRole(source.id, `Papel Copiado ${Date.now()}`, actorUserId, ["contacts:view_own", "tasks:view"]);
    createdRoleIds.push(copy.id);

    const copyWithPerms = await prisma.role.findUniqueOrThrow({ where: { id: copy.id }, include: { permissions: { include: { permission: true } } } });
    expect(copyWithPerms.permissions.map((p) => p.permission.key).sort()).toEqual(["contacts:view_own", "tasks:view"]);
  });

  it("duplicateRole bloqueia quando o ator não tem todas as permissões do papel de origem", async () => {
    const source = await createRole({ name: `Papel Origem Restrito ${Date.now()}`, description: null, permissionKeys: ["contacts:view_own", "tasks:view"] }, actorUserId, [
      "contacts:view_own",
      "tasks:view",
    ]);
    createdRoleIds.push(source.id);

    await expect(duplicateRole(source.id, `Cópia Não Autorizada ${Date.now()}`, actorUserId, ["contacts:view_own"])).rejects.toThrow(PrivilegeEscalationError);
  });
});
