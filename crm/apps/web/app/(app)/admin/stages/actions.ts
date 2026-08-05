"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { stageCreateSchema, stageUpdateSchema } from "@mabres/shared";
import { requirePermission } from "@/lib/session";
import { friendlyErrorMessage, isNextRedirectError } from "@/lib/errors";
import { createStage, updateStage } from "@/lib/stage-admin-service";

function readStageForm(formData: FormData) {
  return {
    name: formData.get("name"),
    order: formData.get("order"),
    requiresReasonOn: formData.get("requiresReasonOn") || "NONE",
    color: formData.get("color") || "",
  };
}

export async function createStageAction(formData: FormData) {
  const session = await requirePermission("stages:manage");

  const parsed = stageCreateSchema.safeParse(readStageForm(formData));
  if (!parsed.success) {
    redirect(`/admin/stages/new?error=${encodeURIComponent(parsed.error.issues[0]?.message ?? "Dados inválidos")}`);
  }

  try {
    await createStage(parsed.data, session.user.id);
  } catch (error) {
    if (isNextRedirectError(error)) throw error;
    redirect(`/admin/stages/new?error=${encodeURIComponent(friendlyErrorMessage(error))}`);
  }

  revalidatePath("/admin/stages");
  redirect("/admin/stages");
}

export async function updateStageAction(formData: FormData) {
  const session = await requirePermission("stages:manage");
  const id = String(formData.get("id") ?? "");

  const parsed = stageUpdateSchema.safeParse({
    ...readStageForm(formData),
    id,
    expectedUpdatedAt: formData.get("expectedUpdatedAt"),
    isActive: formData.get("isActive") === "on",
  });
  if (!parsed.success) {
    redirect(`/admin/stages/${id}?error=${encodeURIComponent(parsed.error.issues[0]?.message ?? "Dados inválidos")}`);
  }

  try {
    await updateStage(parsed.data, session.user.id);
  } catch (error) {
    if (isNextRedirectError(error)) throw error;
    redirect(`/admin/stages/${id}?error=${encodeURIComponent(friendlyErrorMessage(error))}`);
  }

  revalidatePath(`/admin/stages/${id}`);
  revalidatePath("/admin/stages");
  redirect(`/admin/stages/${id}`);
}
