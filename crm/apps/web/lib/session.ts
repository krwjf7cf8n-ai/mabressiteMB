import { cache } from "react";
import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { authOptions } from "@/lib/auth";
import type { PermissionKey } from "@mabres/shared";

/**
 * `React.cache()` dedupe a resolução da sessão dentro de uma mesma
 * requisição — o layout e cada página que chamam `getCurrentSession`/
 * `requireSession` (direta ou indiretamente, via `getContactScopeWhere` e
 * afins) acabam gerando só uma consulta real de sessão por request, não
 * uma por chamada. Mesmo comportamento, só sem reconsultar.
 */
export const getCurrentSession = cache(async () => {
  return getServerSession(authOptions);
});

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
/**
 * Mesmo princípio de escopo do `getVisitScopeWhere`/`getTaskScopeWhere`,
 * aplicado a leads/clientes: quem só tem `contacts:view_own` só pode ver os
 * contatos dos quais é responsável (`ownerUserId`); quem tem
 * `contacts:view_all` vê todos. Aplicado tanto na listagem quanto no detalhe
 * — nunca confiar só em esconder o registro na lista.
 */
export async function getContactScopeWhere() {
  const session = await requireSession();
  if (session.user.permissions.includes("contacts:view_all")) return {};
  return { ownerUserId: session.user.id };
}

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
