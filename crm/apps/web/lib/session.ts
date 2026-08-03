import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { authOptions } from "@/lib/auth";
import type { PermissionKey } from "@mabres/shared";

export async function getCurrentSession() {
  return getServerSession(authOptions);
}

/** Usa no topo de páginas/server actions autenticadas; redireciona se não houver sessão. */
export async function requireSession() {
  const session = await getCurrentSession();
  if (!session?.user) {
    redirect("/login");
  }
  return session;
}

/**
 * Garante que o usuário logado possui a permissão informada.
 * Lança erro (a chamar em server actions) — nunca confie somente na UI.
 */
export async function requirePermission(permission: PermissionKey) {
  const session = await requireSession();
  if (!session.user.permissions.includes(permission)) {
    throw new Error(`Acesso negado: permissão "${permission}" é necessária.`);
  }
  return session;
}

export function hasPermission(permissions: string[], permission: PermissionKey) {
  return permissions.includes(permission);
}
