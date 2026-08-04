import type { PrismaClient } from "@mabres/db";

/**
 * G29 — Lead novo: toda vez que um lead é cadastrado, a primeira tarefa de
 * follow-up ("ligar para o lead") é criada automaticamente, para o
 * responsável pelo lead. Não é uma automação nova/configurável — é uma
 * única ação direta e fixa, marcada com `origin: "AUTOMACAO"` (valor já
 * existente no enum `TaskOrigin`) só para diferenciar no histórico que não
 * foi um corretor que criou manualmente.
 */
export async function createFollowUpTaskForNewContact(
  client: PrismaClient,
  input: { contactId: string; contactName: string; ownerUserId: string | null; createdByUserId: string },
) {
  const assignedUserId = input.ownerUserId ?? input.createdByUserId;

  return client.task.create({
    data: {
      title: `Primeiro contato — ${input.contactName}`,
      contactId: input.contactId,
      assignedUserId,
      createdByUserId: input.createdByUserId,
      taskType: "ligar",
      origin: "AUTOMACAO",
      dueAt: new Date(),
    },
  });
}
