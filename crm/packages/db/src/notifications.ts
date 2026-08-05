import type { PrismaClient } from "@prisma/client";

export interface CreateNotificationInput {
  userId: string;
  type: string;
  title: string;
  body?: string;
  entityType?: string;
  entityId?: string;
  /** Chave lógica única — evita criar a mesma notificação duas vezes (worker, refresh, reenvio). */
  idempotencyKey: string;
}

/**
 * Cria a notificação só se a chave de idempotência ainda não existir
 * (constraint única em `idempotencyKey`). Retorna `null`, sem erro, quando já
 * existia — chamadores não precisam checar antes.
 */
export async function createNotificationIdempotent(client: PrismaClient, input: CreateNotificationInput) {
  try {
    return await client.notification.create({
      data: {
        userId: input.userId,
        type: input.type,
        title: input.title,
        body: input.body ?? null,
        entityType: input.entityType ?? null,
        entityId: input.entityId ?? null,
        idempotencyKey: input.idempotencyKey,
      },
    });
  } catch (error) {
    const code = (error as { code?: string } | null)?.code;
    if (code === "P2002") return null; // já existe — idempotência garantida pela constraint do banco
    throw error;
  }
}
