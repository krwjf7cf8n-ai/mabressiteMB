import { notFound } from "next/navigation";
import Link from "next/link";
import { prisma } from "@mabres/db";
import { formatDateTimeSaoPaulo } from "@mabres/shared";
import { getCurrentSession } from "@/lib/session";
import { countUserRecords } from "@/lib/user-admin-service";
import { changeRoleAction, disableUserAction, reactivateUserAction, resetPasswordAction, updateUserAction } from "../actions";

export default async function UserDetailPage({
  params,
  searchParams,
}: {
  params: { id: string };
  searchParams: { error?: string; tempPassword?: string };
}) {
  const session = await getCurrentSession();
  const user = await prisma.user.findUnique({
    where: { id: params.id },
    include: { role: true, createdBy: true, disabledBy: true },
  });

  if (!user) notFound();

  const isDisabled = !user.isActive || user.disabledAt;
  const canUpdate = session?.user.permissions.includes("users:update");
  const canDisable = session?.user.permissions.includes("users:disable") && !isDisabled;
  const canReactivate = session?.user.permissions.includes("users:reactivate") && isDisabled;
  const canResetPassword = session?.user.permissions.includes("users:reset_password");
  const canAssignRole = session?.user.permissions.includes("roles:assign");
  const isSelf = session?.user.id === user.id;

  const [impact, allRoles, adminLogs] = await Promise.all([
    isDisabled ? null : countUserRecords(user.id),
    canAssignRole ? prisma.role.findMany({ where: { disabledAt: null }, include: { permissions: { include: { permission: true } } }, orderBy: { name: "asc" } }) : [],
    prisma.auditLog.findMany({ where: { entityType: "User", entityId: user.id }, orderBy: { createdAt: "desc" }, take: 30, include: { actorUser: true } }),
  ]);

  const actorPermissionSet = new Set(session?.user.permissions ?? []);
  const assignableRoles = allRoles.filter((r) => r.permissions.every((rp) => actorPermissionSet.has(rp.permission.key)));

  return (
    <div className="grid gap-6 lg:grid-cols-3">
      <div className="lg:col-span-2 space-y-6">
        <div>
          <h1 className="text-lg font-semibold text-slate-800">{user.name}</h1>
          <p className="text-sm text-slate-500">
            {user.email} · {user.role.name}{user.role.isAdminRole ? " (administrador)" : ""} · status {isDisabled ? "Inativo" : "Ativo"}
          </p>
        </div>

        {searchParams.error && (
          <div className="rounded-md border border-red-300 bg-red-50 p-3 text-sm text-red-700">{searchParams.error}</div>
        )}

        {searchParams.tempPassword && (
          <div className="rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-800">
            Senha temporária gerada: <code className="rounded bg-white px-2 py-0.5 font-mono">{searchParams.tempPassword}</code>
            <br />
            Copie agora — ela não será exibida novamente. O usuário precisará trocá-la no primeiro login.
          </div>
        )}

        {isDisabled && user.disabledReason && (
          <div className="rounded-md border border-slate-300 bg-slate-50 p-3 text-sm text-slate-600">
            Desativado em {formatDateTimeSaoPaulo(user.disabledAt)} por {user.disabledBy?.name ?? "—"}. Motivo: {user.disabledReason}
          </div>
        )}

        {canUpdate && (
          <section className="rounded-lg border border-slate-200 bg-white p-4">
            <h2 className="mb-3 text-sm font-semibold text-slate-700">Dados básicos</h2>
            <form action={updateUserAction} className="space-y-3">
              <input type="hidden" name="id" value={user.id} />
              <div>
                <label className="mb-1 block text-xs font-medium text-slate-700">Nome</label>
                <input name="name" defaultValue={user.name} required className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm" />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-slate-700">Telefone</label>
                <input name="phone" defaultValue={user.phone ?? ""} className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm" />
              </div>
              <button type="submit" className="rounded-md bg-brand px-4 py-2 text-sm font-medium text-white hover:bg-brand-dark">
                Salvar
              </button>
            </form>
          </section>
        )}

        {canAssignRole && !isSelf && (
          <section className="rounded-lg border border-slate-200 bg-white p-4">
            <h2 className="mb-3 text-sm font-semibold text-slate-700">Papel</h2>
            <form action={changeRoleAction} className="flex items-center gap-2">
              <input type="hidden" name="id" value={user.id} />
              <input type="hidden" name="expectedUpdatedAt" value={user.updatedAt.toISOString()} />
              <select name="roleId" defaultValue={user.roleId} className="rounded-md border border-slate-300 px-3 py-2 text-sm">
                {assignableRoles.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.name}
                    {r.isAdminRole ? " (administrador)" : ""}
                  </option>
                ))}
              </select>
              <button type="submit" className="rounded-md border border-slate-300 px-3 py-1.5 text-sm hover:bg-slate-50">
                Alterar papel
              </button>
            </form>
            <p className="mt-1 text-xs text-slate-500">
              Só aparecem papéis cujas permissões você já possui — evita conceder acima do seu próprio nível.
            </p>
          </section>
        )}
        {isSelf && (
          <p className="rounded-md border border-slate-200 bg-slate-50 p-3 text-xs text-slate-500">
            Você não pode alterar o próprio papel.
          </p>
        )}

        {canDisable && (
          <section className="rounded-lg border border-slate-200 bg-white p-4">
            <h2 className="mb-3 text-sm font-semibold text-slate-700">Desativar usuário</h2>
            {impact && (
              <div className="mb-3 text-xs text-slate-500">
                Ao desativar, estes registros continuam vinculados a {user.name} até serem reatribuídos manualmente:
                <ul className="mt-1 list-disc pl-4">
                  <li>{impact.activeContacts} lead(s)/cliente(s) ativo(s)</li>
                  <li>{impact.pendingTasks} tarefa(s) pendente(s)</li>
                  <li>{impact.futureVisits} visita(s) futura(s)/ativa(s)</li>
                  <li>{impact.activeProperties} imóve(is) sob responsabilidade</li>
                </ul>
              </div>
            )}
            <form action={disableUserAction} className="flex items-center gap-2">
              <input type="hidden" name="id" value={user.id} />
              <input name="reason" required placeholder="Motivo da desativação" className="flex-1 rounded-md border border-slate-300 px-3 py-2 text-sm" />
              <button type="submit" className="rounded-md border border-red-300 px-3 py-1.5 text-sm text-red-700 hover:bg-red-50">
                Desativar
              </button>
            </form>
          </section>
        )}

        {canReactivate && (
          <form action={reactivateUserAction}>
            <input type="hidden" name="id" value={user.id} />
            <button type="submit" className="rounded-md border border-green-300 px-3 py-1.5 text-sm text-green-700 hover:bg-green-50">
              Reativar usuário
            </button>
          </form>
        )}

        {canResetPassword && (
          <section className="rounded-lg border border-slate-200 bg-white p-4">
            <h2 className="mb-3 text-sm font-semibold text-slate-700">Redefinir senha</h2>
            <form action={resetPasswordAction}>
              <input type="hidden" name="id" value={user.id} />
              <button type="submit" className="rounded-md border border-slate-300 px-3 py-1.5 text-sm hover:bg-slate-50">
                Gerar nova senha temporária
              </button>
            </form>
            <p className="mt-1 text-xs text-slate-500">Revoga todas as sessões ativas e força troca no próximo login.</p>
          </section>
        )}

        <section className="rounded-lg border border-slate-200 bg-white p-4">
          <h2 className="mb-3 text-sm font-semibold text-slate-700">Histórico administrativo</h2>
          <ul className="space-y-2 text-sm">
            {adminLogs.map((log) => (
              <li key={log.id} className="border-b border-slate-100 pb-2 last:border-0">
                <span className="font-medium text-slate-700">{log.action}</span>
                <span className="ml-2 text-slate-400">
                  {log.actorUser?.name ?? "sistema"} · {formatDateTimeSaoPaulo(log.createdAt)}
                </span>
              </li>
            ))}
            {adminLogs.length === 0 && <li className="text-slate-500">Sem histórico.</li>}
          </ul>
        </section>
      </div>

      <aside className="space-y-4">
        <section className="rounded-lg border border-slate-200 bg-white p-4 text-sm">
          <h2 className="mb-2 font-semibold text-slate-700">Dados</h2>
          <dl className="space-y-1 text-slate-600">
            <div>
              <dt className="inline font-medium">Criado em: </dt>
              <dd className="inline">{formatDateTimeSaoPaulo(user.createdAt)}</dd>
            </div>
            <div>
              <dt className="inline font-medium">Criado por: </dt>
              <dd className="inline">{user.createdBy?.name ?? "—"}</dd>
            </div>
            <div>
              <dt className="inline font-medium">Último login: </dt>
              <dd className="inline">{user.lastLoginAt ? formatDateTimeSaoPaulo(user.lastLoginAt) : "—"}</dd>
            </div>
            <div>
              <dt className="inline font-medium">Troca de senha obrigatória: </dt>
              <dd className="inline">{user.mustChangePassword ? "Sim" : "Não"}</dd>
            </div>
          </dl>
        </section>

        {isDisabled && (
          <Link href={`/admin/users/${user.id}/reassign`} className="block rounded-lg border border-slate-200 bg-white p-4 text-sm text-brand-dark hover:underline">
            Reatribuir registros deste usuário →
          </Link>
        )}
      </aside>
    </div>
  );
}
