import Link from "next/link";
import { prisma } from "@mabres/db";
import { formatDateTimeSaoPaulo } from "@mabres/shared";
import { requirePermission } from "@/lib/session";
import { AdminTabs } from "../admin-tabs";
import { Pagination } from "@/components/ui/pagination";
import { DEFAULT_PAGE_SIZE, parsePageParam, parseSearchTerm } from "@/lib/list-query";

export default async function AdminUsersPage({
  searchParams,
}: {
  searchParams: { q?: string; roleId?: string; status?: string; page?: string };
}) {
  const session = await requirePermission("users:view");
  const canCreate = session.user.permissions.includes("users:create");
  const q = parseSearchTerm(searchParams.q);
  const page = parsePageParam(searchParams.page);

  // AND explícito (em vez de espalhar vários filtros num único objeto): dois
  // filtros diferentes (busca por texto e status "inativo") usam a mesma
  // chave OR — espalhados no mesmo nível, o segundo sobrescreveria o
  // primeiro e a busca combinada com o filtro de status silenciosamente
  // ignoraria o termo buscado.
  const where = {
    AND: [
      q
        ? {
            OR: [
              { name: { contains: q, mode: "insensitive" as const } },
              { email: { contains: q, mode: "insensitive" as const } },
              { role: { name: { contains: q, mode: "insensitive" as const } } },
            ],
          }
        : {},
      searchParams.roleId ? { roleId: searchParams.roleId } : {},
      searchParams.status === "ativo" ? { isActive: true, disabledAt: null } : {},
      searchParams.status === "inativo" ? { OR: [{ isActive: false }, { disabledAt: { not: null } }] } : {},
    ],
  };

  const [total, users, roles] = await Promise.all([
    prisma.user.count({ where }),
    prisma.user.findMany({
      where,
      include: { role: true },
      orderBy: { name: "asc" },
      skip: (page - 1) * DEFAULT_PAGE_SIZE,
      take: DEFAULT_PAGE_SIZE,
    }),
    prisma.role.findMany({ orderBy: { name: "asc" } }),
  ]);

  const buildHref = (targetPage: number) => {
    const params = new URLSearchParams();
    if (q) params.set("q", q);
    if (searchParams.roleId) params.set("roleId", searchParams.roleId);
    if (searchParams.status) params.set("status", searchParams.status);
    if (targetPage > 1) params.set("page", String(targetPage));
    const qs = params.toString();
    return qs ? `/admin/users?${qs}` : "/admin/users";
  };

  return (
    <div className="space-y-6">
      <AdminTabs active="users" />
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-lg font-semibold text-slate-800">Usuários</h1>
          <p className="text-sm text-slate-500">{total} usuário(s){q ? ` para "${q}"` : ""}</p>
        </div>
        {canCreate && (
          <Link href="/admin/users/new" className="rounded-md bg-brand px-4 py-2 text-sm font-medium text-white hover:bg-brand-dark">
            Novo usuário
          </Link>
        )}
      </div>

      <form className="grid grid-cols-2 gap-3 rounded-lg border border-slate-200 bg-white p-4 sm:grid-cols-4">
        <input name="q" defaultValue={q} placeholder="Nome, e-mail ou papel" maxLength={100} className="rounded-md border border-slate-300 px-3 py-2 text-sm" />
        <select name="roleId" defaultValue={searchParams.roleId ?? ""} className="rounded-md border border-slate-300 px-3 py-2 text-sm">
          <option value="">Todos os papéis</option>
          {roles.map((r) => (
            <option key={r.id} value={r.id}>
              {r.name}
            </option>
          ))}
        </select>
        <select name="status" defaultValue={searchParams.status ?? ""} className="rounded-md border border-slate-300 px-3 py-2 text-sm">
          <option value="">Todos os status</option>
          <option value="ativo">Ativo</option>
          <option value="inativo">Inativo</option>
        </select>
        <button type="submit" className="rounded-md border border-slate-300 px-3 py-2 text-sm hover:bg-slate-50">
          Filtrar
        </button>
        {(q || searchParams.roleId || searchParams.status) && (
          <Link href="/admin/users" className="col-span-2 text-sm text-slate-500 underline hover:text-slate-700 sm:col-span-4">
            Limpar busca e filtros
          </Link>
        )}
      </form>

      <div className="overflow-hidden rounded-lg border border-slate-200 bg-white">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-left text-xs uppercase text-slate-500">
              <tr>
                <th className="px-4 py-2">Nome</th>
                <th className="px-4 py-2">E-mail</th>
                <th className="px-4 py-2">Papel</th>
                <th className="px-4 py-2">Status</th>
                <th className="px-4 py-2">Último login</th>
              </tr>
            </thead>
            <tbody>
              {users.map((user) => {
                const isDisabled = !user.isActive || user.disabledAt;
                return (
                  <tr key={user.id} className="border-t border-slate-100 hover:bg-slate-50">
                    <td className="px-4 py-2">
                      <Link href={`/admin/users/${user.id}`} className="text-brand-dark hover:underline">
                        {user.name}
                      </Link>
                    </td>
                    <td className="px-4 py-2">{user.email}</td>
                    <td className="px-4 py-2">{user.role.name}</td>
                    <td className="px-4 py-2">
                      <span className={isDisabled ? "text-red-700" : "text-green-700"}>{isDisabled ? "Inativo" : "Ativo"}</span>
                    </td>
                    <td className="px-4 py-2">{user.lastLoginAt ? formatDateTimeSaoPaulo(user.lastLoginAt) : "—"}</td>
                  </tr>
                );
              })}
              {users.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-4 py-6 text-center text-slate-500">
                    {q ? `Nenhum usuário encontrado para "${q}".` : "Nenhum usuário encontrado."}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      <Pagination page={page} pageSize={DEFAULT_PAGE_SIZE} total={total} buildHref={buildHref} />
    </div>
  );
}
