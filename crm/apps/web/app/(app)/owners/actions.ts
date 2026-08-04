"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma, recordAudit } from "@mabres/db";
import {
  encryptSensitiveField,
  findDuplicateOwnerMatches,
  ownerCreateSchema,
  type DuplicateOwnerMatchReason,
} from "@mabres/shared";
import { requirePermission } from "@/lib/session";

export interface CreateOwnerState {
  status: "idle" | "duplicate_warning" | "error";
  duplicates?: DuplicateOwnerMatchReason[];
  message?: string;
}

export async function createOwnerAction(
  _prevState: CreateOwnerState,
  formData: FormData,
): Promise<CreateOwnerState> {
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
    return { status: "error", message: parsed.error.issues[0]?.message ?? "Dados inválidos." };
  }

  const data = parsed.data;
  const confirmed = formData.get("confirmed") === "true";

  if (!confirmed) {
    const candidates = await prisma.owner.findMany({
      where: { deletedAt: null },
      select: { id: true, phone: true, email: true, document: true },
    });
    const duplicates = findDuplicateOwnerMatches(
      { phone: data.phone, email: data.email, document: data.document },
      candidates,
    );
    if (duplicates.length > 0) {
      return { status: "duplicate_warning", duplicates };
    }
  }

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
