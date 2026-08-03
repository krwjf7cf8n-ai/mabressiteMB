import type { ActorType, Prisma, PrismaClient } from "@prisma/client";

export interface RecordAuditInput {
  entityType: string;
  entityId: string;
  action: string;
  actorType?: ActorType;
  actorUserId?: string | null;
  before?: Prisma.InputJsonValue | null;
  after?: Prisma.InputJsonValue | null;
  ip?: string | null;
}

/**
 * Registra uma entrada de auditoria. Nunca inclua tokens, senhas, documentos
 * completos ou dados bancários em `before`/`after` — mascare antes de chamar.
 */
export function recordAudit(client: PrismaClient, input: RecordAuditInput) {
  return client.auditLog.create({
    data: {
      entityType: input.entityType,
      entityId: input.entityId,
      action: input.action,
      actorType: input.actorType ?? "USER",
      actorUserId: input.actorUserId ?? null,
      before: input.before ?? undefined,
      after: input.after ?? undefined,
      ip: input.ip ?? null,
    },
  });
}
