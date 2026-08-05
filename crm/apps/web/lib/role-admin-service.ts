import { prisma, recordAudit, updateOptimistically } from "@mabres/db";
import { assertNoPrivilegeEscalation } from "@mabres/shared";

export interface CreateRoleInput {
  name: string;
  description: string | null;
  permissionKeys: string[];
}

export async function createRole(data: CreateRoleInput, actorUserId: string, actorPermissions: readonly string[]) {
  assertNoPrivilegeEscalation(actorPermissions, data.permissionKeys);

  const permissions = await prisma.permission.findMany({ where: { key: { in: data.permissionKeys } } });

  const role = await prisma.role.create({
    data: {
      name: data.name,
      description: data.description,
      isSystem: false,
      isAdminRole: false,
      permissions: { create: permissions.map((p) => ({ permissionId: p.id })) },
    },
  });

  await recordAudit(prisma, {
    entityType: "Role",
    entityId: role.id,
    action: "create",
    actorUserId,
    after: { name: role.name, permissionKeys: data.permissionKeys },
  });

  return role;
}

export interface UpdateRolePermissionsInput {
  roleId: string;
  expectedUpdatedAt: Date;
  name: string;
  description: string | null;
  permissionKeys: string[];
}

/** O papel de administrador (isAdminRole) nunca tem suas permissões editadas por aqui — protegido estruturalmente. */
export async function updateRolePermissions(input: UpdateRolePermissionsInput, actorUserId: string, actorPermissions: readonly string[]) {
  const role = await prisma.role.findUniqueOrThrow({ where: { id: input.roleId }, include: { permissions: { include: { permission: true } } } });
  if (role.isAdminRole) {
    throw new Error("O papel de administrador tem todas as permissões por definição e não pode ser editado.");
  }
  if (role.disabledAt) {
    throw new Error("Este papel está desativado.");
  }

  assertNoPrivilegeEscalation(actorPermissions, input.permissionKeys);

  const before = role.permissions.map((rp) => rp.permission.key).sort();
  const permissions = await prisma.permission.findMany({ where: { key: { in: input.permissionKeys } } });

  await prisma.$transaction(async (tx) => {
    await updateOptimistically(
      tx.role,
      input.roleId,
      input.expectedUpdatedAt,
      { name: input.name, description: input.description },
      "Este papel",
    );

    await tx.rolePermission.deleteMany({ where: { roleId: input.roleId } });
    if (permissions.length > 0) {
      await tx.rolePermission.createMany({ data: permissions.map((p) => ({ roleId: input.roleId, permissionId: p.id })) });
    }
  });

  await recordAudit(prisma, {
    entityType: "Role",
    entityId: input.roleId,
    action: "update_permissions",
    actorUserId,
    before: { name: role.name, permissionKeys: before },
    after: { name: input.name, permissionKeys: input.permissionKeys.sort() },
  });
}

export async function disableRole(roleId: string, actorUserId: string) {
  const role = await prisma.role.findUniqueOrThrow({ where: { id: roleId }, include: { users: { where: { deletedAt: null } } } });
  if (role.isAdminRole) {
    throw new Error("O papel de administrador não pode ser desativado.");
  }
  const activeUsers = role.users.filter((u) => u.isActive && !u.disabledAt);
  if (activeUsers.length > 0) {
    throw new Error(`Este papel ainda tem ${activeUsers.length} usuário(s) ativo(s) vinculado(s) — reatribua-os antes de desativar o papel.`);
  }

  await prisma.role.update({ where: { id: roleId }, data: { disabledAt: new Date() } });

  await recordAudit(prisma, { entityType: "Role", entityId: roleId, action: "disable", actorUserId });
}

export async function duplicateRole(sourceRoleId: string, newName: string, actorUserId: string, actorPermissions: readonly string[]) {
  const source = await prisma.role.findUniqueOrThrow({ where: { id: sourceRoleId }, include: { permissions: { include: { permission: true } } } });
  const permissionKeys = source.permissions.map((rp) => rp.permission.key);

  return createRole({ name: newName, description: source.description, permissionKeys }, actorUserId, actorPermissions);
}
