import Link from "next/link";
import { prisma } from "@mabres/db";
import { getCurrentSession } from "@/lib/session";
import { AdminTabs } from "../admin-tabs";

export default async function AdminRolesPage() {
  const session = await getCurrentSession();
  const canCreate = session?.user.permissions.includes("roles:create");

  const roles = await prisma.role.findMany({
    orderBy: { name: "asc" },
    include: { _count: { select: { permissions: true, users: true } } },
  });

  return (
    <div className="space-y-6">
      <AdminTabs active="roles" />
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-lg font-semibold text-slate-800">Papéis</h1>
          <p className="text-sm text-slate-500">{roles.length} papel(éis)</p>
        </div>
        {canCreate && (
          <Link href="/admin/roles/new" className="rounded-md bg-brand px-4 py-2 text-sm font-medium text-white hover:bg-brand-dark">
            Novo papel
          </Link>
        )}
      </div>

      <div className="overflow-hidden rounded-lg border border-slate-200 bg-white">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-left text-xs uppercase text-slate-500">
            <tr>
              <th className="px-4 py-2">Nome</th>
              <th className="px-4 py-2">Permissões</th>
              <th className="px-4 py-2">Usuários vinculados</th>
              <th className="px-4 py-2">Status</th>
            </tr>
          </thead>
          <tbody>
            {roles.map((role) => (
              <tr key={role.id} className="border-t border-slate-100 hover:bg-slate-50">
                <td className="px-4 py-2">
                  <Link href={`/admin/roles/${role.id}`} className="text-brand-dark hover:underline">
                    {role.name}
                  </Link>
                  {role.isAdminRole && <span className="ml-2 rounded-full bg-red-50 px-2 py-0.5 text-xs text-red-700">administrador</span>}
                  {role.isSystem && !role.isAdminRole && <span className="ml-2 rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-600">padrão</span>}
                </td>
                <td className="px-4 py-2">{role.isAdminRole ? "todas" : role._count.permissions}</td>
                <td className="px-4 py-2">{role._count.users}</td>
                <td className="px-4 py-2">{role.disabledAt ? <span className="text-red-700">Desativado</span> : <span className="text-green-700">Ativo</span>}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
