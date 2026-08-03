"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma, recordAudit } from "@mabres/db";
import { encryptSensitiveField, ownerCreateSchema } from "@mabres/shared";
import { requirePermission } from "@/lib/session";

export async function createOwnerAction(formData: FormData) {
  const session = await requirePermission("owners:create");

  const parsed = ownerCreateSchema.safeParse({
    name: formData.get("name"),
    phone: formData.get("phone") || null,
    email: formData.get("email") || null,
    document: formData.get("document") || null,
    agreedCommissionPct: formData.get("agreedCommissionPct") || null,
    adAuthorization: formData.get("adAuthorization") === "on",
    intermediationContract: formData.get("intermediationContract") === "on",
    bankData: formData.get("bankData") || null,
  });

  if (!parsed.success) {
    redirect(`/owners/new?error=${encodeURIComponent(parsed.error.issues[0]?.message ?? "Dados inválidos")}`);
  }

  const data = parsed.data;

  const owner = await prisma.owner.create({
    data: {
      name: data.name,
      phone: data.phone || null,
      email: data.email || null,
      document: data.document || null,
      agreedCommissionPct: data.agreedCommissionPct ?? null,
      adAuthorization: data.adAuthorization,
      intermediationContract: data.intermediationContract,
      // Nunca gravar dados bancários em texto plano — sempre cifrados (AES-256-GCM).
      bankDataEncrypted: data.bankData ? encryptSensitiveField(data.bankData) : null,
    },
  });

  await recordAudit(prisma, {
    entityType: "Owner",
    entityId: owner.id,
    action: "create",
    actorType: "USER",
    actorUserId: session.user.id,
    after: { name: owner.name, hasBankData: Boolean(data.bankData) },
  });

  revalidatePath("/owners");
  redirect(`/owners`);
}
