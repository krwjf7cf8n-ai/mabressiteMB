import { recordAudit, type PrismaClient } from "@mabres/db";
import {
  findDuplicateMatches,
  type ContactCreateInput,
  type ContactPreferenceUpdateInput,
  type DuplicateMatchReason,
  type StageChangeInput,
} from "@mabres/shared";

/** Lançado quando a etapa de destino exige motivo (perda/pausa) e nenhum foi informado. */
export class StageReasonRequiredError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "StageReasonRequiredError";
  }
}

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

/** Busca contatos não excluídos com telefone/whatsapp/e-mail iguais/próximos aos informados. */
export async function findContactDuplicates(
  client: PrismaClient,
  input: { phone?: string | null; whatsapp?: string | null; email?: string | null },
): Promise<DuplicateMatchReason[]> {
  const candidates = await client.contact.findMany({
    where: { deletedAt: null },
    select: { id: true, phone: true, whatsapp: true, email: true, metaLeadId: true, name: true },
  });

  return findDuplicateMatches(
    { phone: input.phone, whatsapp: input.whatsapp, email: input.email || undefined },
    candidates,
  );
}

/** Cria o lead, sua entrada na etapa inicial ativa do funil, a tarefa de follow-up e o registro de auditoria. */
export async function createContact(client: PrismaClient, data: ContactCreateInput, actorUserId: string) {
  const firstStage = await client.pipelineStage.findFirst({
    where: { isActive: true },
    orderBy: { order: "asc" },
  });

  const contact = await client.contact.create({
    data: {
      name: data.name,
      phone: data.phone || null,
      whatsapp: data.whatsapp || null,
      email: data.email || null,
      city: data.city || null,
      state: data.state || null,
      origin: data.origin,
      notes: data.notes || null,
      ownerUserId: actorUserId,
      stageId: firstStage?.id,
      consents: data.consentGiven
        ? {
            create: {
              purpose: "comunicacao_geral",
              origin: data.consentOrigin || "cadastro_manual",
              granted: true,
            },
          }
        : undefined,
    },
  });

  if (firstStage) {
    await client.contactStageHistory.create({
      data: {
        contactId: contact.id,
        toStageId: firstStage.id,
        changedByType: "USER",
        changedByUserId: actorUserId,
        comment: "Lead cadastrado",
      },
    });
  }

  await createFollowUpTaskForNewContact(client, {
    contactId: contact.id,
    contactName: contact.name,
    ownerUserId: contact.ownerUserId,
    createdByUserId: actorUserId,
  });

  await recordAudit(client, {
    entityType: "Contact",
    entityId: contact.id,
    action: "create",
    actorType: "USER",
    actorUserId,
    after: { name: contact.name, origin: contact.origin },
  });

  return contact;
}

/**
 * Move o lead para outra etapa do funil. Etapas que exigem motivo (perda/pausa)
 * lançam `StageReasonRequiredError` quando nenhum motivo é informado — quem
 * chama decide como comunicar isso ao usuário (ex.: redirect com `?error=`).
 */
export async function changeContactStage(client: PrismaClient, data: StageChangeInput, actorUserId: string) {
  const [contact, toStage] = await Promise.all([
    client.contact.findUniqueOrThrow({ where: { id: data.contactId } }),
    client.pipelineStage.findUniqueOrThrow({ where: { id: data.toStageId } }),
  ]);

  if (toStage.requiresReasonOn !== "NONE" && !data.reason) {
    const message =
      toStage.requiresReasonOn === "LOSS"
        ? "Informe o motivo da perda para mover o lead para esta etapa."
        : "Informe o motivo da pausa para mover o lead para esta etapa.";
    throw new StageReasonRequiredError(message);
  }

  await client.$transaction([
    client.contact.update({
      where: { id: data.contactId },
      data: {
        stageId: data.toStageId,
        lossReason: toStage.requiresReasonOn === "LOSS" ? data.reason : contact.lossReason,
        pauseReason: toStage.requiresReasonOn === "PAUSE" ? data.reason : contact.pauseReason,
      },
    }),
    client.contactStageHistory.create({
      data: {
        contactId: data.contactId,
        fromStageId: contact.stageId,
        toStageId: data.toStageId,
        changedByType: "USER",
        changedByUserId: actorUserId,
        comment: data.comment,
        reason: data.reason,
      },
    }),
  ]);

  await recordAudit(client, {
    entityType: "Contact",
    entityId: data.contactId,
    action: "stage_change",
    actorType: "USER",
    actorUserId,
    before: { stageId: contact.stageId },
    after: { stageId: data.toStageId, reason: data.reason },
  });
}

/**
 * Cria/atualiza as preferências de busca do lead. Também avança
 * `Contact.updatedAt` para que os matches em cache sejam considerados
 * obsoletos e recalculados na próxima consulta.
 */
export async function updateContactPreference(
  client: PrismaClient,
  data: ContactPreferenceUpdateInput,
  actorUserId: string,
) {
  const preferenceData = {
    intent: data.intent,
    desiredCity: data.desiredCity || null,
    desiredNeighborhoods: data.desiredNeighborhoods,
    propertyType: data.propertyType || null,
    minPrice: data.minPrice ?? null,
    maxPrice: data.maxPrice ?? null,
    bedrooms: data.bedrooms ?? null,
    suites: data.suites ?? null,
    parkingSpots: data.parkingSpots ?? null,
    needsBackyard: data.needsBackyard,
    needsGourmetArea: data.needsGourmetArea,
    houseFormat: data.houseFormat || null,
    condoOrOpen: data.condoOrOpen || null,
    criteriaRequirements: data.criteriaRequirements,
  };

  await client.contactPreference.upsert({
    where: { contactId: data.contactId },
    update: preferenceData,
    create: { contactId: data.contactId, ...preferenceData },
  });

  await client.contact.update({ where: { id: data.contactId }, data: { updatedAt: new Date() } });

  await recordAudit(client, {
    entityType: "ContactPreference",
    entityId: data.contactId,
    action: "update",
    actorType: "USER",
    actorUserId,
    after: { intent: data.intent, propertyType: data.propertyType, desiredCity: data.desiredCity },
  });
}
