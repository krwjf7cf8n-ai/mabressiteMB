import { Prisma, prisma, recordAudit, updateOptimistically } from "@mabres/db";
import {
  assertKeepsAtLeastOneAdmin,
  assertNoPrivilegeEscalation,
  assertNotSelfRoleChange,
  generateTempPassword,
  hashPassword,
  verifyPassword,
} from "@mabres/shared";

/**
 * Conta administradores ativos, excluindo um usuário — e TRAVA essas linhas
 * (`FOR UPDATE`) até a transação chamadora terminar. É isso que impede duas
 * desativações/trocas de papel concorrentes de, cada uma vendo "ainda sobra
 * 1 admin", derrubarem os dois últimos administradores ao mesmo tempo: a
 * segunda transação espera a primeira commitar e então reconta o estado real.
 */
async function countActiveAdminsExcluding(tx: Prisma.TransactionClient, excludeUserId: string): Promise<number> {
  const rows = await tx.$queryRaw<Array<{ id: string }>>`
    SELECT u.id FROM "users" u
    JOIN "roles" r ON r.id = u."roleId"
    WHERE r."isAdminRole" = true
      AND u."isActive" = true
      AND u."deletedAt" IS NULL
      AND u."disabledAt" IS NULL
      AND u.id != ${excludeUserId}
    FOR UPDATE OF u
  `;
  return rows.length;
}

export interface CreateUserInput {
  name: string;
  email: string;
  phone: string | null;
  roleId: string;
}

/** Cria usuário com senha temporária forte, exibida uma única vez ao chamador (nunca logada/auditada em claro). */
export async function createUserWithTempPassword(data: CreateUserInput, actorUserId: string, actorPermissions: readonly string[]) {
  const role = await prisma.role.findUniqueOrThrow({
    where: { id: data.roleId },
    include: { permissions: { include: { permission: true } } },
  });
  if (role.disabledAt) throw new Error("Este papel está desativado e não pode ser atribuído.");
  assertNoPrivilegeEscalation(actorPermissions, role.permissions.map((rp) => rp.permission.key));

  const tempPassword = generateTempPassword();
  const passwordHash = await hashPassword(tempPassword);

  const user = await prisma.user.create({
    data: {
      name: data.name,
      email: data.email,
      phone: data.phone,
      roleId: data.roleId,
      passwordHash,
      mustChangePassword: true,
      createdByUserId: actorUserId,
    },
  });

  await recordAudit(prisma, {
    entityType: "User",
    entityId: user.id,
    action: "create",
    actorUserId,
    after: { name: user.name, email: user.email, roleId: user.roleId, roleName: role.name },
  });

  return { user, tempPassword };
}

/** Desativa um usuário — bloqueado se ele for o último administrador ativo. Revoga todas as sessões dele. */
export async function disableUser(targetUserId: string, reason: string, actorUserId: string) {
  const updated = await prisma.$transaction(async (tx) => {
    const target = await tx.user.findUniqueOrThrow({ where: { id: targetUserId }, include: { role: true } });

    if (target.role.isAdminRole) {
      const others = await countActiveAdminsExcluding(tx, targetUserId);
      assertKeepsAtLeastOneAdmin(others, "desativar este usuário");
    }

    const user = await tx.user.update({
      where: { id: targetUserId },
      data: { isActive: false, disabledAt: new Date(), disabledByUserId: actorUserId, disabledReason: reason },
    });

    await tx.userSession.updateMany({
      where: { userId: targetUserId, revokedAt: null },
      data: { revokedAt: new Date(), revokedByUserId: actorUserId, revokedReason: "Usuário desativado" },
    });

    return user;
  });

  await recordAudit(prisma, {
    entityType: "User",
    entityId: targetUserId,
    action: "disable",
    actorUserId,
    before: { isActive: true },
    after: { isActive: false, reason },
  });

  return updated;
}

export async function reactivateUser(targetUserId: string, actorUserId: string) {
  const updated = await prisma.user.update({
    where: { id: targetUserId },
    data: { isActive: true, disabledAt: null, disabledByUserId: null, disabledReason: null },
  });

  await recordAudit(prisma, {
    entityType: "User",
    entityId: targetUserId,
    action: "reactivate",
    actorUserId,
    after: { isActive: true },
  });

  return updated;
}

export interface ChangeUserRoleInput {
  targetUserId: string;
  newRoleId: string;
  expectedUpdatedAt: Date;
  actorUserId: string;
  actorPermissions: readonly string[];
}

/**
 * Troca o papel de um usuário. Nunca o próprio ator (`assertNotSelfRoleChange`).
 * O novo papel não pode ter permissão que o ator não possua. Se isso tirar o
 * único administrador ativo do papel de admin, é bloqueado — dentro da mesma
 * transação que trava as linhas de administrador.
 */
export async function changeUserRole(input: ChangeUserRoleInput) {
  assertNotSelfRoleChange(input.actorUserId, input.targetUserId);

  const [newRole, before] = await Promise.all([
    prisma.role.findUniqueOrThrow({ where: { id: input.newRoleId }, include: { permissions: { include: { permission: true } } } }),
    prisma.user.findUniqueOrThrow({ where: { id: input.targetUserId }, include: { role: true } }),
  ]);
  if (newRole.disabledAt) throw new Error("Este papel está desativado e não pode ser atribuído.");
  assertNoPrivilegeEscalation(input.actorPermissions, newRole.permissions.map((rp) => rp.permission.key));

  await prisma.$transaction(async (tx) => {
    if (before.role.isAdminRole && !newRole.isAdminRole) {
      const others = await countActiveAdminsExcluding(tx, input.targetUserId);
      assertKeepsAtLeastOneAdmin(others, "alterar o papel deste usuário");
    }

    await updateOptimistically(tx.user, input.targetUserId, input.expectedUpdatedAt, { roleId: input.newRoleId }, "Este usuário");
  });

  await recordAudit(prisma, {
    entityType: "User",
    entityId: input.targetUserId,
    action: "role_change",
    actorUserId: input.actorUserId,
    before: { roleId: before.roleId, roleName: before.role.name },
    after: { roleId: input.newRoleId, roleName: newRole.name },
  });
}

/** Redefine a senha de outro usuário — gera senha temporária, força troca no próximo login, revoga sessões ativas. */
export async function resetUserPassword(targetUserId: string, actorUserId: string, forceChange = true): Promise<string> {
  const tempPassword = generateTempPassword();
  const passwordHash = await hashPassword(tempPassword);

  await prisma.$transaction(async (tx) => {
    await tx.user.update({ where: { id: targetUserId }, data: { passwordHash, mustChangePassword: forceChange } });
    await tx.userSession.updateMany({
      where: { userId: targetUserId, revokedAt: null },
      data: { revokedAt: new Date(), revokedByUserId: actorUserId, revokedReason: "Senha redefinida pelo administrador" },
    });
  });

  await recordAudit(prisma, {
    entityType: "User",
    entityId: targetUserId,
    action: "password_reset_by_admin",
    actorUserId,
    after: { mustChangePassword: forceChange }, // nunca a senha em si
  });

  return tempPassword;
}

/** Usuário troca a própria senha — exige a senha atual, nunca aceita a troca sem confirmá-la. */
export async function selfChangePassword(
  userId: string,
  currentPassword: string,
  newPassword: string,
  revokeOtherSessions: boolean,
  currentSessionId?: string,
): Promise<void> {
  const user = await prisma.user.findUniqueOrThrow({ where: { id: userId } });
  if (!user.passwordHash || !(await verifyPassword(currentPassword, user.passwordHash))) {
    throw new Error("Senha atual incorreta.");
  }

  const passwordHash = await hashPassword(newPassword);
  await prisma.$transaction(async (tx) => {
    await tx.user.update({ where: { id: userId }, data: { passwordHash, mustChangePassword: false } });
    if (revokeOtherSessions) {
      await tx.userSession.updateMany({
        where: { userId, revokedAt: null, ...(currentSessionId ? { id: { not: currentSessionId } } : {}) },
        data: { revokedAt: new Date(), revokedByUserId: userId, revokedReason: "Troca de senha pelo próprio usuário" },
      });
    }
  });

  await recordAudit(prisma, { entityType: "User", entityId: userId, action: "password_change_self", actorUserId: userId });
}

export async function terminateSession(sessionId: string, targetUserId: string, actorUserId: string, reason?: string): Promise<boolean> {
  const result = await prisma.userSession.updateMany({
    where: { id: sessionId, userId: targetUserId, revokedAt: null },
    data: { revokedAt: new Date(), revokedByUserId: actorUserId, revokedReason: reason ?? "Encerrada manualmente" },
  });
  if (result.count > 0) {
    await recordAudit(prisma, { entityType: "User", entityId: targetUserId, action: "session_terminated", actorUserId, after: { sessionId } });
  }
  return result.count > 0;
}

export async function terminateAllSessions(targetUserId: string, actorUserId: string, exceptSessionId?: string): Promise<number> {
  const result = await prisma.userSession.updateMany({
    where: { userId: targetUserId, revokedAt: null, ...(exceptSessionId ? { id: { not: exceptSessionId } } : {}) },
    data: { revokedAt: new Date(), revokedByUserId: actorUserId, revokedReason: "Encerramento em lote" },
  });
  if (result.count > 0) {
    await recordAudit(prisma, {
      entityType: "User",
      entityId: targetUserId,
      action: "sessions_terminated_bulk",
      actorUserId,
      after: { count: result.count },
    });
  }
  return result.count;
}

export interface UserRecordCounts {
  activeContacts: number;
  pendingTasks: number;
  futureVisits: number;
  activeProperties: number;
}

/**
 * Conta o que fica "órfão" (ainda vinculado a este usuário) se ele for
 * desativado — mostrado antes da confirmação de desativação e na tela de
 * reatribuição. Só itens que fazem sentido reatribuir: leads/clientes
 * ativos, tarefas ainda não concluídas/canceladas, visitas futuras/ativas,
 * imóveis sob responsabilidade. Propostas não entram — o módulo ainda não
 * tem UI nesta fase, não há nada de fato para reatribuir.
 */
export async function countUserRecords(userId: string): Promise<UserRecordCounts> {
  const [activeContacts, pendingTasks, futureVisits, activeProperties] = await Promise.all([
    prisma.contact.count({ where: { ownerUserId: userId, deletedAt: null } }),
    prisma.task.count({ where: { assignedUserId: userId, status: { in: ["PENDENTE", "EM_ANDAMENTO"] } } }),
    prisma.visit.count({
      where: { brokerUserId: userId, status: { notIn: ["REALIZADA", "CANCELADA_CLIENTE", "CANCELADA_CORRETOR"] } },
    }),
    prisma.property.count({ where: { responsibleUserId: userId, deletedAt: null } }),
  ]);
  return { activeContacts, pendingTasks, futureVisits, activeProperties };
}

export interface ReassignRecordsOptions {
  fromUserId: string;
  toUserId: string;
  reassignContacts: boolean;
  reassignTasks: boolean;
  reassignVisits: boolean;
  reassignProperties: boolean;
}

export interface ReassignRecordsResult {
  contacts: number;
  tasks: number;
  visits: number;
  properties: number;
}

/**
 * Reatribui só o que faz sentido reatribuir: leads/clientes ativos, tarefas
 * ainda pendentes/em andamento, visitas futuras/ativas, imóveis sob
 * responsabilidade — nunca mexe em registros concluídos/cancelados
 * (preserva o histórico deles apontando para o usuário original). Cada
 * categoria é opcional (o admin escolhe o que reatribuir); tudo roda numa
 * transação e é auditado com a contagem por categoria.
 */
export async function reassignUserRecords(options: ReassignRecordsOptions, actorUserId: string): Promise<ReassignRecordsResult> {
  const result = await prisma.$transaction(async (tx) => {
    const [contacts, tasks, visits, properties] = await Promise.all([
      options.reassignContacts
        ? tx.contact.updateMany({ where: { ownerUserId: options.fromUserId, deletedAt: null }, data: { ownerUserId: options.toUserId } })
        : Promise.resolve({ count: 0 }),
      options.reassignTasks
        ? tx.task.updateMany({
            where: { assignedUserId: options.fromUserId, status: { in: ["PENDENTE", "EM_ANDAMENTO"] } },
            data: { assignedUserId: options.toUserId },
          })
        : Promise.resolve({ count: 0 }),
      options.reassignVisits
        ? tx.visit.updateMany({
            where: { brokerUserId: options.fromUserId, status: { notIn: ["REALIZADA", "CANCELADA_CLIENTE", "CANCELADA_CORRETOR"] } },
            data: { brokerUserId: options.toUserId },
          })
        : Promise.resolve({ count: 0 }),
      options.reassignProperties
        ? tx.property.updateMany({ where: { responsibleUserId: options.fromUserId, deletedAt: null }, data: { responsibleUserId: options.toUserId } })
        : Promise.resolve({ count: 0 }),
    ]);
    return { contacts: contacts.count, tasks: tasks.count, visits: visits.count, properties: properties.count };
  });

  await recordAudit(prisma, {
    entityType: "User",
    entityId: options.fromUserId,
    action: "records_reassigned",
    actorUserId,
    after: { toUserId: options.toUserId, ...result },
  });

  return result;
}
