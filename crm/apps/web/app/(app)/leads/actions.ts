"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "@mabres/db";
import { contactCreateSchema, contactPreferenceUpdateSchema, stageChangeSchema, type DuplicateMatchReason } from "@mabres/shared";
import { requirePermission } from "@/lib/session";
import { isNextRedirectError } from "@/lib/errors";
import { getMatchesForContact } from "@/lib/matching-service";
import {
  changeContactStage,
  createContact,
  findContactDuplicates,
  StageReasonRequiredError,
  updateContactPreference,
} from "@/lib/lead-service";

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
    const duplicates = await findContactDuplicates(prisma, {
      phone: data.phone,
      whatsapp: data.whatsapp,
      email: data.email,
    });
    if (duplicates.length > 0) {
      return { status: "duplicate_warning", duplicates };
    }
  }

  const contact = await createContact(prisma, data, session.user.id);

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

  const { contactId } = parsed.data;

  try {
    await changeContactStage(prisma, parsed.data, session.user.id);
  } catch (error) {
    if (isNextRedirectError(error)) throw error;
    if (error instanceof StageReasonRequiredError) {
      redirect(`/leads/${contactId}?error=${encodeURIComponent(error.message)}`);
    }
    throw error;
  }

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

  await updateContactPreference(prisma, data, session.user.id);

  revalidatePath(`/leads/${data.contactId}`);
}

export async function recalculateMatchesForContactAction(formData: FormData) {
  await requirePermission("matches:recalculate");
  const contactId = String(formData.get("contactId") ?? "");
  await getMatchesForContact(contactId, { forceRecalculate: true });
  revalidatePath(`/leads/${contactId}`);
}
