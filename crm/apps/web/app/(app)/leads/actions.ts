"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma, recordAudit } from "@mabres/db";
import {
  contactCreateSchema,
  findDuplicateMatches,
  stageChangeSchema,
  type DuplicateMatchReason,
} from "@mabres/shared";
import { requirePermission } from "@/lib/session";

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
