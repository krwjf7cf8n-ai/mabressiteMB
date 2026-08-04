"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { ConcurrencyConflictError, prisma } from "@mabres/db";
import {
  LastAdminError,
  PrivilegeEscalationError,
  reassignRecordsSchema,
  selfProfileUpdateSchema,
  SelfRoleChangeError,
  userCreateSchema,
  userDisableSchema,
  userUpdateSchema,
} from "@mabres/shared";
import { requirePermission, requireSession } from "@/lib/session";
import {
  changeUserRole,
  createUserWithTempPassword,
  disableUser,
  reactivateUser,
  reassignUserRecords,
  resetUserPassword,
  selfChangePassword,
  terminateAllSessions,
  terminateSession,
} from "@/lib/user-admin-service";

function friendlyErrorMessage(error: unknown): string {
  if (error instanceof PrivilegeEscalationError) return error.message;
  if (error instanceof SelfRoleChangeError) return error.message;
  if (error instanceof LastAdminError) return error.message;
  if (error instanceof ConcurrencyConflictError) return error.message;
  if (error && typeof error === "object" && "code" in error && (error as { code?: string }).code === "P2002") {
    return "Já existe um usuário cadastrado com este e-mail.";
  }
  if (error instanceof Error) return error.message;
  return "Ocorreu um erro inesperado.";
}

export async function createUserAction(formData: FormData) {
  const session = await requirePermission("users:create");

  const parsed = userCreateSchema.safeParse({
    name: formData.get("name"),
    email: formData.get("email"),
    phone: formData.get("phone") || null,
    roleId: formData.get("roleId"),
  });
  if (!parsed.success) {
    redirect(`/admin/users/new?error=${encodeURIComponent(parsed.error.issues[0]?.message ?? "Dados inválidos")}`);
  }

  try {
    const { user, tempPassword } = await createUserWithTempPassword(
      { ...parsed.data, phone: parsed.data.phone ?? null },
      session.user.id,
      session.user.permissions,
    );
    revalidatePath("/admin/users");
    redirect(`/admin/users/${user.id}?tempPassword=${encodeURIComponent(tempPassword)}`);
  } catch (error) {
    if (error && typeof error === "object" && "digest" in error) throw error; // deixa passar o redirect() acima
    redirect(`/admin/users/new?error=${encodeURIComponent(friendlyErrorMessage(error))}`);
  }
}

export async function updateUserAction(formData: FormData) {
  await requirePermission("users:update");
  const id = String(formData.get("id") ?? "");

  const parsed = userUpdateSchema.safeParse({
    id,
    name: formData.get("name"),
    phone: formData.get("phone") || null,
  });
  if (!parsed.success) {
    redirect(`/admin/users/${id}?error=${encodeURIComponent(parsed.error.issues[0]?.message ?? "Dados inválidos")}`);
  }

  await prisma.user.update({ where: { id: parsed.data.id }, data: { name: parsed.data.name, phone: parsed.data.phone } });

  revalidatePath(`/admin/users/${id}`);
  revalidatePath("/admin/users");
  redirect(`/admin/users/${id}`);
}

export async function disableUserAction(formData: FormData) {
  const session = await requirePermission("users:disable");
  const id = String(formData.get("id") ?? "");

  const parsed = userDisableSchema.safeParse({ id, reason: formData.get("reason") });
  if (!parsed.success) {
    redirect(`/admin/users/${id}?error=${encodeURIComponent(parsed.error.issues[0]?.message ?? "Informe o motivo")}`);
  }

  try {
    await disableUser(parsed.data.id, parsed.data.reason, session.user.id);
  } catch (error) {
    if (error && typeof error === "object" && "digest" in error) throw error;
    redirect(`/admin/users/${id}?error=${encodeURIComponent(friendlyErrorMessage(error))}`);
  }

  revalidatePath(`/admin/users/${id}`);
  revalidatePath("/admin/users");
  redirect(`/admin/users/${id}`);
}

export async function reactivateUserAction(formData: FormData) {
  const session = await requirePermission("users:reactivate");
  const id = String(formData.get("id") ?? "");

  await reactivateUser(id, session.user.id);

  revalidatePath(`/admin/users/${id}`);
  revalidatePath("/admin/users");
  redirect(`/admin/users/${id}`);
}

export async function resetPasswordAction(formData: FormData) {
  const session = await requirePermission("users:reset_password");
  const id = String(formData.get("id") ?? "");

  const tempPassword = await resetUserPassword(id, session.user.id);

  revalidatePath(`/admin/users/${id}`);
  redirect(`/admin/users/${id}?tempPassword=${encodeURIComponent(tempPassword)}`);
}

export async function changeRoleAction(formData: FormData) {
  const session = await requirePermission("roles:assign");
  const id = String(formData.get("id") ?? "");
  const roleId = String(formData.get("roleId") ?? "");
  const expectedUpdatedAt = new Date(String(formData.get("expectedUpdatedAt") ?? ""));

  try {
    await changeUserRole({
      targetUserId: id,
      newRoleId: roleId,
      expectedUpdatedAt,
      actorUserId: session.user.id,
      actorPermissions: session.user.permissions,
    });
  } catch (error) {
    if (error && typeof error === "object" && "digest" in error) throw error;
    redirect(`/admin/users/${id}?error=${encodeURIComponent(friendlyErrorMessage(error))}`);
  }

  revalidatePath(`/admin/users/${id}`);
  revalidatePath("/admin/users");
  redirect(`/admin/users/${id}`);
}

/** Autoatendimento — nunca altera papel/permissões/status, só nome e telefone. */
export async function selfProfileUpdateAction(formData: FormData) {
  const session = await requireSession();

  const parsed = selfProfileUpdateSchema.safeParse({
    name: formData.get("name"),
    phone: formData.get("phone") || null,
  });
  if (!parsed.success) {
    redirect(`/profile?error=${encodeURIComponent(parsed.error.issues[0]?.message ?? "Dados inválidos")}`);
  }

  await prisma.user.update({ where: { id: session.user.id }, data: { name: parsed.data.name, phone: parsed.data.phone } });

  revalidatePath("/profile");
  redirect("/profile");
}

export async function selfChangePasswordFromProfileAction(formData: FormData) {
  const session = await requireSession();
  const currentPassword = String(formData.get("currentPassword") ?? "");
  const newPassword = String(formData.get("newPassword") ?? "");
  const revokeOtherSessions = formData.get("revokeOtherSessions") === "on";

  try {
    await selfChangePassword(session.user.id, currentPassword, newPassword, revokeOtherSessions, session.user.sessionId);
  } catch (error) {
    redirect(`/profile?error=${encodeURIComponent(friendlyErrorMessage(error))}`);
  }

  redirect("/profile?passwordChanged=1");
}

export async function terminateSessionAction(formData: FormData) {
  const session = await requirePermission("users:terminate_sessions");
  const userId = String(formData.get("userId") ?? "");
  const sessionId = String(formData.get("sessionId") ?? "");

  await terminateSession(sessionId, userId, session.user.id);

  revalidatePath(`/admin/users/${userId}`);
  redirect(`/admin/users/${userId}`);
}

export async function terminateAllSessionsAction(formData: FormData) {
  const session = await requirePermission("users:terminate_sessions");
  const userId = String(formData.get("userId") ?? "");

  await terminateAllSessions(userId, session.user.id);

  revalidatePath(`/admin/users/${userId}`);
  redirect(`/admin/users/${userId}`);
}

export async function reassignRecordsAction(formData: FormData) {
  const session = await requirePermission("users:reassign_records");

  const parsed = reassignRecordsSchema.safeParse({
    fromUserId: formData.get("fromUserId"),
    toUserId: formData.get("toUserId"),
    reassignContacts: formData.get("reassignContacts") === "on",
    reassignTasks: formData.get("reassignTasks") === "on",
    reassignVisits: formData.get("reassignVisits") === "on",
    reassignProperties: formData.get("reassignProperties") === "on",
  });
  if (!parsed.success) {
    const fromUserId = String(formData.get("fromUserId") ?? "");
    redirect(`/admin/users/${fromUserId}/reassign?error=${encodeURIComponent(parsed.error.issues[0]?.message ?? "Dados inválidos")}`);
  }

  if (parsed.data.fromUserId === parsed.data.toUserId) {
    redirect(`/admin/users/${parsed.data.fromUserId}/reassign?error=${encodeURIComponent("Selecione um responsável diferente do usuário original")}`);
  }

  const result = await reassignUserRecords(parsed.data, session.user.id);

  revalidatePath(`/admin/users/${parsed.data.fromUserId}`);
  revalidatePath("/leads");
  revalidatePath("/tasks");
  revalidatePath("/visits");
  revalidatePath("/properties");
  redirect(
    `/admin/users/${parsed.data.fromUserId}?warning=${encodeURIComponent(
      `Reatribuído: ${result.contacts} lead(s), ${result.tasks} tarefa(s), ${result.visits} visita(s), ${result.properties} imóve(is).`,
    )}`,
  );
}
