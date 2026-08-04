"use server";

import { redirect } from "next/navigation";
import { requireSession } from "@/lib/session";
import { selfChangePassword } from "@/lib/user-admin-service";

export async function forcedChangePasswordAction(formData: FormData) {
  const session = await requireSession({ allowMustChangePassword: true });
  const currentPassword = String(formData.get("currentPassword") ?? "");
  const newPassword = String(formData.get("newPassword") ?? "");
  const confirmPassword = String(formData.get("confirmPassword") ?? "");

  if (newPassword !== confirmPassword) {
    redirect(`/change-password?error=${encodeURIComponent("As senhas não coincidem.")}`);
  }

  try {
    // mantém a sessão atual válida — só revoga as outras, nunca a que está fazendo a troca agora.
    await selfChangePassword(session.user.id, currentPassword, newPassword, true, session.user.sessionId);
  } catch (error) {
    if (error && typeof error === "object" && "digest" in error) throw error;
    const message = error instanceof Error ? error.message : "Não foi possível trocar a senha.";
    redirect(`/change-password?error=${encodeURIComponent(message)}`);
  }

  redirect("/dashboard");
}
