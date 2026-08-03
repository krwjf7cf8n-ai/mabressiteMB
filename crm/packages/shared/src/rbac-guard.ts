/**
 * Regras de segurança do RBAC que não dependem do banco — testáveis puras.
 * A parte que precisa de transação/lock (proteção do último administrador)
 * vive em `apps/web/lib/user-admin-service.ts`; aqui só a decisão em si.
 */

export class PrivilegeEscalationError extends Error {
  constructor(disallowed: string[]) {
    super(`Você não pode conceder permissões que não possui: ${disallowed.join(", ")}`);
    this.name = "PrivilegeEscalationError";
  }
}

/**
 * "Nunca conceder acima do próprio nível": todo permissionKey de um papel
 * novo/editado, ou atribuído a um usuário, precisa já estar entre as
 * permissões do ator que está fazendo a operação. Aplica-se a criar papel,
 * editar permissões de papel e atribuir papel a usuário.
 */
export function assertNoPrivilegeEscalation(actorPermissions: readonly string[], targetPermissions: readonly string[]): void {
  const actorSet = new Set(actorPermissions);
  const disallowed = targetPermissions.filter((p) => !actorSet.has(p));
  if (disallowed.length > 0) {
    throw new PrivilegeEscalationError(disallowed);
  }
}

export class SelfRoleChangeError extends Error {
  constructor() {
    super("Você não pode alterar o próprio papel.");
    this.name = "SelfRoleChangeError";
  }
}

/** Ninguém troca o próprio papel — nem para cima, nem para baixo. Evita rebaixamento acidental e auto-promoção. */
export function assertNotSelfRoleChange(actorUserId: string, targetUserId: string): void {
  if (actorUserId === targetUserId) {
    throw new SelfRoleChangeError();
  }
}

export class LastAdminError extends Error {
  constructor(action: string) {
    super(`Não é possível ${action}: a organização ficaria sem nenhum administrador ativo.`);
    this.name = "LastAdminError";
  }
}

/**
 * Decisão pura: dado quantos administradores ativos restariam depois da
 * operação, ela é permitida? (a contagem/lock de linha é feita pelo
 * chamador dentro de uma transação — ver user-admin-service.ts).
 */
export function assertKeepsAtLeastOneAdmin(remainingActiveAdminCount: number, action: string): void {
  if (remainingActiveAdminCount < 1) {
    throw new LastAdminError(action);
  }
}
