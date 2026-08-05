import { notFound } from "next/navigation";
import Link from "next/link";
import { prisma } from "@mabres/db";
import { PERMISSIONS, PERMISSION_DOMAIN_LABELS, type PermissionDomain } from "@mabres/shared";
import { getCurrentSession } from "@/lib/session";
import { disableRoleAction, duplicateRoleAction, updateRoleAction } from "../actions";

const RISK_STYLES: Record<string, string> = {
  baixo: "bg-slate-100 text-slate-600",
  medio: "bg-blue-50 text-blue-700",
  alto: "bg-amber-50 text-amber-700",
  critico: "bg-red-50 text-red-700",
};

export default async function RoleDetailPage({
  params,
  searchParams,
}: {
  params: { id: string };
  searchParams: { error?: string };
}) {
  const session = await getCurrentSession();
  const role = await prisma.role.findUnique({
    where: { id: params.id },
    include: { permissions: { include: { permission: true } }, users: { orderBy: { name: "asc" } } },
  });

  if (!role) notFound();

  const currentPermissionKeys = new Set(role.permissions.map((rp) => rp.permission.key));
  const actorPermissions = new Set(session?.user.permissions ?? []);
  const canUpdate = session?.user.permissions.includes("roles:update") && !role.isAdminRole && !role.disabledAt;
  const canDisable = session?.user.permissions.includes("roles:disable") && !role.isAdminRole && !role.disabledAt;
  const canDuplicate = session?.user.permissions.includes("roles:create");

  const domains = Array.from(new Set(PERMISSIONS.map((p) => p.domain))) as PermissionDomain[];

  return (
    <div className="max-w-3xl space-y-6">
      <div>
        <h1 className="text-lg font-semibold text-slate-800">
          {role.name}
          {role.isAdminRole && <span className="ml-2 rounded-full bg-red-50 px-2 py-0.5 text-xs text-red-700">administrador</span>}
        </h1>
        <p className="text-sm text-slate-500">
          {role.isAdminRole ? "Todas as permissões — não editável nesta interface." : `${role.permissions.length} permissão(ões)`} ·{" "}
          {role.users.length} usuário(s) vinculado(s) · status {role.disabledAt ? "Desativado" : "Ativo"}
        </p>
      </div>

      {searchParams.error && (
        <div className="rounded-md border border-red-300 bg-red-50 p-3 text-sm text-red-700">{searchParams.error}</div>
      )}

      <section className="rounded-lg border border-slate-200 bg-white p-4">
        <h2 className="mb-3 text-sm font-semibold text-slate-700">Usuários vinculados</h2>
        <ul className="space-y-1 text-sm">
          {role.users.map((u) => (
            <li key={u.id}>
              <Link href={`/admin/users/${u.id}`} className="text-brand-dark hover:underline">
                {u.name}
              </Link>{" "}
              — {u.isActive && !u.disabledAt ? "ativo" : "inativo"}
            </li>
          ))}
          {role.users.length === 0 && <li className="text-slate-500">Nenhum.</li>}
        </ul>
      </section>

      {canDuplicate && (
        <section className="rounded-lg border border-slate-200 bg-white p-4">
          <h2 className="mb-3 text-sm font-semibold text-slate-700">Duplicar papel</h2>
          <form action={duplicateRoleAction} className="flex items-center gap-2">
            <input type="hidden" name="id" value={role.id} />
            <input name="newName" required placeholder="Nome do novo papel" className="flex-1 rounded-md border border-slate-300 px-3 py-2 text-sm" />
            <button type="submit" className="rounded-md border border-slate-300 px-3 py-1.5 text-sm hover:bg-slate-50">
              Duplicar
            </button>
          </form>
          <p className="mt-1 text-xs text-slate-500">Cria um papel novo com a mesma lista de permissões — só se você já possuir todas elas.</p>
        </section>
      )}

      {canDisable && (
        <form action={disableRoleAction}>
          <input type="hidden" name="id" value={role.id} />
          <button type="submit" className="rounded-md border border-red-300 px-3 py-1.5 text-sm text-red-700 hover:bg-red-50">
            Desativar papel
          </button>
        </form>
      )}
      {!role.isAdminRole && !role.disabledAt && role.users.length > 0 && !canDisable && (
        <p className="text-xs text-slate-500">Papéis com usuários ativos vinculados não podem ser desativados até a reatribuição.</p>
      )}

      <form action={updateRoleAction} className="space-y-6">
        <input type="hidden" name="id" value={role.id} />
        <input type="hidden" name="expectedUpdatedAt" value={role.updatedAt.toISOString()} />

        <div className="rounded-lg border border-slate-200 bg-white p-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label className="mb-1 block text-sm font-medium text-slate-700">Nome</label>
              <input name="name" defaultValue={role.name} required disabled={!canUpdate} className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm disabled:bg-slate-50" />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-slate-700">Descrição</label>
              <input name="description" defaultValue={role.description ?? ""} disabled={!canUpdate} className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm disabled:bg-slate-50" />
            </div>
          </div>
        </div>

        {domains.map((domain) => (
          <fieldset key={domain} className="rounded-lg border border-slate-200 bg-white p-4">
            <legend className="px-1 text-sm font-semibold text-slate-700">{PERMISSION_DOMAIN_LABELS[domain]}</legend>
            <div className="mt-2 grid gap-2 sm:grid-cols-2">
              {PERMISSIONS.filter((p) => p.domain === domain).map((perm) => {
                const checked = role.isAdminRole || currentPermissionKeys.has(perm.key);
                const disabled = !canUpdate || (!actorPermissions.has(perm.key) && !checked);
                return (
                  <label key={perm.key} className={`flex items-start gap-2 text-sm ${disabled && !checked ? "opacity-40" : ""}`}>
                    <input
                      type="checkbox"
                      name="permissionKeys"
                      value={perm.key}
                      defaultChecked={checked}
                      disabled={disabled}
                      className="mt-1"
                    />
                    <span>
                      {perm.description}
                      <span className={`ml-2 rounded-full px-2 py-0.5 text-xs ${RISK_STYLES[perm.risk]}`}>{perm.risk}</span>
                      <br />
                      <code className="text-xs text-slate-400">{perm.key}</code>
                    </span>
                  </label>
                );
              })}
            </div>
          </fieldset>
        ))}

        {canUpdate && (
          <button type="submit" className="rounded-md bg-brand px-4 py-2 text-sm font-medium text-white hover:bg-brand-dark">
            Salvar permissões
          </button>
        )}
      </form>
    </div>
  );
}
