import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { authOptions } from "@/lib/auth";
import type { PermissionKey } from "@mabres/shared";

export async function getCurrentSession() {
  return getServerSession(authOptions);
}

/**
 * Usa no topo de páginas/server actions autenticadas; redireciona se não
 * houver sessão. Também bloqueia qualquer ação enquanto `mustChangePassword`
 * estiver true — exceto a própria tela/ação de troca de senha, que passa
 * `allowMustChangePassword: true` para não entrar em loop de redirecionamento.
 */
export async function requireSession(options?: { allowMustChangePassword?: boolean }) {
  const session = await getCurrentSession();
  if (!session?.user) {
    redirect("/login");
  }
  if (session.user.mustChangePassword && !options?.allowMustChangePassword) {
    redirect("/change-password");
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

/**
 * Escopo padrão do RBAC para agenda/tarefas: corretor só vê o que é seu;
 * quem tem o `:view_all` correspondente vê a equipe inteira. Nunca confiar
 * só em esconder botão na UI — este filtro é aplicado na query do servidor.
 */
export async function getVisitScopeWhere() {
  const session = await requireSession();
  if (session.user.permissions.includes("visits:view_all")) return {};
  return { brokerUserId: session.user.id };
}

export async function getTaskScopeWhere() {
  const session = await requireSession();
  if (session.user.permissions.includes("tasks:view_all")) return {};
  return { assignedUserId: session.user.id };
}
