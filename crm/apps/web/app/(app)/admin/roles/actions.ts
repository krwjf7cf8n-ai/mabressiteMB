"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { ConcurrencyConflictError } from "@mabres/db";
import { PrivilegeEscalationError, roleCreateSchema, roleUpdateSchema } from "@mabres/shared";
import { requirePermission } from "@/lib/session";
import { createRole, disableRole, duplicateRole, updateRolePermissions } from "@/lib/role-admin-service";

function readPermissionKeys(formData: FormData): string[] {
  return formData.getAll("permissionKeys").map(String);
}

function friendlyErrorMessage(error: unknown): string {
  if (error instanceof PrivilegeEscalationError) return error.message;
  if (error instanceof ConcurrencyConflictError) return error.message;
  if (error instanceof Error) return error.message;
  return "Ocorreu um erro inesperado.";
}

export async function createRoleAction(formData: FormData) {
  const session = await requirePermission("roles:create");

  const parsed = roleCreateSchema.safeParse({
    name: formData.get("name"),
    description: formData.get("description") || null,
    permissionKeys: readPermissionKeys(formData),
  });
  if (!parsed.success) {
    redirect(`/admin/roles/new?error=${encodeURIComponent(parsed.error.issues[0]?.message ?? "Dados inválidos")}`);
  }

  try {
    const role = await createRole({ ...parsed.data, description: parsed.data.description ?? null }, session.user.id, session.user.permissions);
    revalidatePath("/admin/roles");
    redirect(`/admin/roles/${role.id}`);
  } catch (error) {
    if (error && typeof error === "object" && "digest" in error) throw error;
    redirect(`/admin/roles/new?error=${encodeURIComponent(friendlyErrorMessage(error))}`);
  }
}

export async function updateRoleAction(formData: FormData) {
  const session = await requirePermission("roles:update");
  const id = String(formData.get("id") ?? "");

  const parsed = roleUpdateSchema.safeParse({
    id,
    expectedUpdatedAt: formData.get("expectedUpdatedAt"),
    name: formData.get("name"),
    description: formData.get("description") || null,
    permissionKeys: readPermissionKeys(formData),
  });
  if (!parsed.success) {
    redirect(`/admin/roles/${id}?error=${encodeURIComponent(parsed.error.issues[0]?.message ?? "Dados inválidos")}`);
  }

  try {
    await updateRolePermissions(
      { roleId: parsed.data.id, expectedUpdatedAt: parsed.data.expectedUpdatedAt, name: parsed.data.name, description: parsed.data.description ?? null, permissionKeys: parsed.data.permissionKeys },
      session.user.id,
      session.user.permissions,
    );
  } catch (error) {
    if (error && typeof error === "object" && "digest" in error) throw error;
    redirect(`/admin/roles/${id}?error=${encodeURIComponent(friendlyErrorMessage(error))}`);
  }

  revalidatePath(`/admin/roles/${id}`);
  revalidatePath("/admin/roles");
  redirect(`/admin/roles/${id}`);
}

export async function disableRoleAction(formData: FormData) {
  const session = await requirePermission("roles:disable");
  const id = String(formData.get("id") ?? "");

  try {
    await disableRole(id, session.user.id);
  } catch (error) {
    if (error && typeof error === "object" && "digest" in error) throw error;
    redirect(`/admin/roles/${id}?error=${encodeURIComponent(friendlyErrorMessage(error))}`);
  }

  revalidatePath(`/admin/roles/${id}`);
  revalidatePath("/admin/roles");
  redirect(`/admin/roles/${id}`);
}

export async function duplicateRoleAction(formData: FormData) {
  const session = await requirePermission("roles:create");
  const id = String(formData.get("id") ?? "");
  const newName = String(formData.get("newName") ?? "").trim();

  if (!newName) {
    redirect(`/admin/roles/${id}?error=${encodeURIComponent("Informe o nome do novo papel")}`);
  }

  try {
    const copy = await duplicateRole(id, newName, session.user.id, session.user.permissions);
    revalidatePath("/admin/roles");
    redirect(`/admin/roles/${copy.id}`);
  } catch (error) {
    if (error && typeof error === "object" && "digest" in error) throw error;
    redirect(`/admin/roles/${id}?error=${encodeURIComponent(friendlyErrorMessage(error))}`);
  }
}
