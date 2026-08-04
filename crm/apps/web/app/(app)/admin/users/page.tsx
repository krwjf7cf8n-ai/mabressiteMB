import Link from "next/link";
import { prisma } from "@mabres/db";
import { formatDateTimeSaoPaulo } from "@mabres/shared";
import { getCurrentSession } from "@/lib/session";

export default async function AdminUsersPage({
  searchParams,
}: {
  searchParams: { q?: string; roleId?: string; status?: string };
}) {
  const session = await getCurrentSession();
  const canCreate = session?.user.permissions.includes("users:create");

  const where = {
    ...(searchParams.q
      ? {
          OR: [
            { name: { contains: searchParams.q, mode: "insensitive" as const } },
            { email: { contains: searchParams.q, mode: "insensitive" as const } },
          ],
        }
      : {}),
    ...(searchParams.roleId ? { roleId: searchParams.roleId } : {}),
    ...(searchParams.status === "ativo" ? { isActive: true, disabledAt: null } : {}),
    ...(searchParams.status === "inativo" ? { OR: [{ isActive: false }, { disabledAt: { not: null } }] } : {}),
  };

  const [users, roles] = await Promise.all([
    prisma.user.findMany({ where, include: { role: true }, orderBy: { name: "asc" }, take: 200 }),
    prisma.role.findMany({ orderBy: { name: "asc" } }),
  ]);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-lg font-semibold text-slate-800">Usuários</h1>
          <p className="text-sm text-slate-500">{users.length} usuário(s)</p>
        </div>
        {canCreate && (
          <Link href="/admin/users/new" className="rounded-md bg-brand px-4 py-2 text-sm font-medium text-white hover:bg-brand-dark">
            Novo usuário
          </Link>
        )}
      </div>

      <form className="grid grid-cols-2 gap-3 rounded-lg border border-slate-200 bg-white p-4 sm:grid-cols-4">
        <input name="q" defaultValue={searchParams.q} placeholder="Nome ou e-mail" className="rounded-md border border-slate-300 px-3 py-2 text-sm" />
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
      </form>

      <div className="overflow-hidden rounded-lg border border-slate-200 bg-white">
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
                  Nenhum usuário encontrado.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
