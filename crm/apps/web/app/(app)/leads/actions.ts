"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma, recordAudit } from "@mabres/db";
import {
  contactCreateSchema,
  contactPreferenceUpdateSchema,
  findDuplicateMatches,
  stageChangeSchema,
  type DuplicateMatchReason,
} from "@mabres/shared";
import { requirePermission } from "@/lib/session";
import { getMatchesForContact } from "@/lib/matching-service";
import { createFollowUpTaskForNewContact } from "@/lib/lead-service";

export interface CreateContactState {
  status: "idle" | "duplicate_warning" | "error";
  duplicates?: DuplicateMatchReason[];
  message?: string;
}

export async function createContactAction(
  _prevState: CreateContactState,
  formData: FormData,
): Promise<CreateContactState> {
  const session = await requirePermission("contacts:create");

  const raw = {
    name: formData.get("name"),
    phone: formData.get("phone") || null,
    whatsapp: formData.get("whatsapp") || null,
    email: formData.get("email") || null,
    city: formData.get("city") || null,
    state: formData.get("state") || null,
    origin: formData.get("origin") || "MANUAL",
    notes: formData.get("notes") || null,
    consentGiven: formData.get("consentGiven") === "on",
    consentOrigin: formData.get("consentOrigin") || null,
  };

  const parsed = contactCreateSchema.safeParse(raw);
  if (!parsed.success) {
    return { status: "error", message: parsed.error.issues[0]?.message ?? "Dados inválidos." };
  }

  const data = parsed.data;
  const confirmed = formData.get("confirmed") === "true";

  if (!confirmed) {
    const candidates = await prisma.contact.findMany({
      where: { deletedAt: null },
      select: { id: true, phone: true, whatsapp: true, email: true, metaLeadId: true, name: true },
    });
    const duplicates = findDuplicateMatches(
      { phone: data.phone, whatsapp: data.whatsapp, email: data.email || undefined },
      candidates,
    );
    if (duplicates.length > 0) {
      return { status: "duplicate_warning", duplicates };
    }
  }

  const firstStage = await prisma.pipelineStage.findFirst({
    where: { isActive: true },
    orderBy: { order: "asc" },
  });

  const contact = await prisma.contact.create({
    data: {
      name: data.name,
      phone: data.phone || null,
      whatsapp: data.whatsapp || null,
      email: data.email || null,
      city: data.city || null,
      state: data.state || null,
      origin: data.origin,
      notes: data.notes || null,
      ownerUserId: session.user.id,
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
    await prisma.contactStageHistory.create({
      data: {
        contactId: contact.id,
        toStageId: firstStage.id,
        changedByType: "USER",
        changedByUserId: session.user.id,
        comment: "Lead cadastrado",
      },
    });
  }

  // G29 — Lead novo: cria a primeira tarefa de follow-up automaticamente.
  await createFollowUpTaskForNewContact(prisma, {
    contactId: contact.id,
    contactName: contact.name,
    ownerUserId: contact.ownerUserId,
    createdByUserId: session.user.id,
  });

  await recordAudit(prisma, {
    entityType: "Contact",
    entityId: contact.id,
    action: "create",
    actorType: "USER",
    actorUserId: session.user.id,
    after: { name: contact.name, origin: contact.origin },
  });

  revalidatePath("/leads");
  redirect(`/leads/${contact.id}`);
}

export async function changeStageAction(formData: FormData) {
  const session = await requirePermission("contacts:update");

  const contactIdRaw = String(formData.get("contactId") ?? "");

  const parsed = stageChangeSchema.safeParse({
    contactId: formData.get("contactId"),
    toStageId: formData.get("toStageId"),
    comment: formData.get("comment") || null,
    reason: formData.get("reason") || null,
  });

  if (!parsed.success) {
    redirect(`/leads/${contactIdRaw}?error=${encodeURIComponent("Dados inválidos para mudança de etapa.")}`);
  }

  const { contactId, toStageId, comment, reason } = parsed.data;

  const [contact, toStage] = await Promise.all([
    prisma.contact.findUniqueOrThrow({ where: { id: contactId } }),
    prisma.pipelineStage.findUniqueOrThrow({ where: { id: toStageId } }),
  ]);

  if (toStage.requiresReasonOn !== "NONE" && !reason) {
    const message =
      toStage.requiresReasonOn === "LOSS"
        ? "Informe o motivo da perda para mover o lead para esta etapa."
        : "Informe o motivo da pausa para mover o lead para esta etapa.";
    redirect(`/leads/${contactId}?error=${encodeURIComponent(message)}`);
  }

  await prisma.$transaction([
    prisma.contact.update({
      where: { id: contactId },
      data: {
        stageId: toStageId,
        lossReason: toStage.requiresReasonOn === "LOSS" ? reason : contact.lossReason,
        pauseReason: toStage.requiresReasonOn === "PAUSE" ? reason : contact.pauseReason,
      },
    }),
    prisma.contactStageHistory.create({
      data: {
        contactId,
        fromStageId: contact.stageId,
        toStageId,
        changedByType: "USER",
        changedByUserId: session.user.id,
        comment,
        reason,
      },
    }),
  ]);

  await recordAudit(prisma, {
    entityType: "Contact",
    entityId: contactId,
    action: "stage_change",
    actorType: "USER",
    actorUserId: session.user.id,
    before: { stageId: contact.stageId },
    after: { stageId: toStageId, reason },
  });

  revalidatePath(`/leads/${contactId}`);
  revalidatePath("/leads");
}

export async function updatePreferenceAction(formData: FormData) {
  const session = await requirePermission("contacts:update");

  const criteriaRequirements: Record<string, string> = {};
  for (const key of formData.keys()) {
    if (key.startsWith("requirement__")) {
      criteriaRequirements[key.replace("requirement__", "")] = String(formData.get(key));
    }
  }

  const parsed = contactPreferenceUpdateSchema.safeParse({
    contactId: formData.get("contactId"),
    intent: formData.get("intent") || null,
    desiredCity: formData.get("desiredCity") || null,
    desiredNeighborhoods: String(formData.get("desiredNeighborhoods") ?? "")
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean),
    propertyType: formData.get("propertyType") || null,
    minPrice: formData.get("minPrice") || null,
    maxPrice: formData.get("maxPrice") || null,
    bedrooms: formData.get("bedrooms") || null,
    suites: formData.get("suites") || null,
    parkingSpots: formData.get("parkingSpots") || null,
    needsBackyard: formData.get("needsBackyard") === "on",
    needsGourmetArea: formData.get("needsGourmetArea") === "on",
    houseFormat: formData.get("houseFormat") || null,
    condoOrOpen: formData.get("condoOrOpen") || null,
    criteriaRequirements,
  });

  if (!parsed.success) {
    const contactId = String(formData.get("contactId") ?? "");
    redirect(`/leads/${contactId}?error=${encodeURIComponent(parsed.error.issues[0]?.message ?? "Dados inválidos")}`);
  }

  const data = parsed.data;

  await prisma.contactPreference.upsert({
    where: { contactId: data.contactId },
    update: {
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
    },
    create: {
      contactId: data.contactId,
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
    },
  });

  // Contact.updatedAt precisa avançar para que os matches em cache sejam considerados obsoletos.
  await prisma.contact.update({ where: { id: data.contactId }, data: { updatedAt: new Date() } });

  await recordAudit(prisma, {
    entityType: "ContactPreference",
    entityId: data.contactId,
    action: "update",
    actorType: "USER",
    actorUserId: session.user.id,
    after: { intent: data.intent, propertyType: data.propertyType, desiredCity: data.desiredCity },
  });

  revalidatePath(`/leads/${data.contactId}`);
}

export async function recalculateMatchesForContactAction(formData: FormData) {
  await requirePermission("matches:recalculate");
  const contactId = String(formData.get("contactId") ?? "");
  await getMatchesForContact(contactId, { forceRecalculate: true });
  revalidatePath(`/leads/${contactId}`);
}
