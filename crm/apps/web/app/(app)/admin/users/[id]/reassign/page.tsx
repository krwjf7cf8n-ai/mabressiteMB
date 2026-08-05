import { notFound } from "next/navigation";
import { prisma } from "@mabres/db";
import { requirePermission } from "@/lib/session";
import { countUserRecords } from "@/lib/user-admin-service";
import { reassignRecordsAction } from "../../actions";

export default async function ReassignRecordsPage({
  params,
  searchParams,
}: {
  params: { id: string };
  searchParams: { error?: string };
}) {
  await requirePermission("users:reassign_records");

  // G12 — impact/otherUsers só precisam de params.id (já conhecido), não do
  // resultado do fetch do usuário: as três rodam em paralelo.
  const [user, impact, otherUsers] = await Promise.all([
    prisma.user.findUnique({ where: { id: params.id } }),
    countUserRecords(params.id),
    prisma.user.findMany({ where: { id: { not: params.id }, isActive: true, deletedAt: null, disabledAt: null }, orderBy: { name: "asc" } }),
  ]);
  if (!user) notFound();

  return (
    <div className="max-w-xl space-y-6">
      <div>
        <h1 className="text-lg font-semibold text-slate-800">Reatribuir registros de {user.name}</h1>
        <p className="text-sm text-slate-500">
          Só leads/clientes ativos, tarefas pendentes/em andamento, visitas futuras/ativas e imóveis sob
          responsabilidade são reatribuídos — nada concluído ou cancelado é tocado, preservando o histórico.
        </p>
      </div>

      {searchParams.error && (
        <div className="rounded-md border border-red-300 bg-red-50 p-3 text-sm text-red-700">{searchParams.error}</div>
      )}

      <form action={reassignRecordsAction} className="space-y-4 rounded-lg border border-slate-200 bg-white p-6">
        <input type="hidden" name="fromUserId" value={user.id} />

        <div>
          <label className="mb-1 block text-sm font-medium text-slate-700">Novo responsável</label>
          <select name="toUserId" required className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm">
            <option value="">Selecione</option>
            {otherUsers.map((u) => (
              <option key={u.id} value={u.id}>
                {u.name}
              </option>
            ))}
          </select>
        </div>

        <div className="space-y-2 text-sm">
          <label className="flex items-center gap-2">
            <input type="checkbox" name="reassignContacts" defaultChecked={impact.activeContacts > 0} />
            Leads/clientes ativos ({impact.activeContacts})
          </label>
          <label className="flex items-center gap-2">
            <input type="checkbox" name="reassignTasks" defaultChecked={impact.pendingTasks > 0} />
            Tarefas pendentes ({impact.pendingTasks})
          </label>
          <label className="flex items-center gap-2">
            <input type="checkbox" name="reassignVisits" defaultChecked={impact.futureVisits > 0} />
            Visitas futuras/ativas ({impact.futureVisits})
          </label>
          <label className="flex items-center gap-2">
            <input type="checkbox" name="reassignProperties" defaultChecked={impact.activeProperties > 0} />
            Imóveis sob responsabilidade ({impact.activeProperties})
          </label>
        </div>

        <button type="submit" className="rounded-md bg-brand px-4 py-2 text-sm font-medium text-white hover:bg-brand-dark">
          Reatribuir selecionados
        </button>
      </form>
    </div>
  );
}
