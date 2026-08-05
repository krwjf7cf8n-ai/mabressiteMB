import Link from "next/link";
import { prisma } from "@mabres/db";
import { requirePermission } from "@/lib/session";
import { AdminTabs } from "../admin-tabs";

const REASON_LABELS: Record<string, string> = {
  NONE: "—",
  LOSS: "Motivo obrigatório (perda)",
  PAUSE: "Motivo obrigatório (pausa)",
};

export default async function AdminStagesPage() {
  const session = await requirePermission("stages:view");
  const canManage = session.user.permissions.includes("stages:manage");

  const stages = await prisma.pipelineStage.findMany({
    orderBy: { order: "asc" },
    include: { _count: { select: { contacts: true } } },
  });

  return (
    <div className="space-y-6">
      <AdminTabs active="stages" />
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-lg font-semibold text-slate-800">Etapas do funil</h1>
          <p className="text-sm text-slate-500">{stages.length} etapa(s)</p>
        </div>
        {canManage && (
          <Link href="/admin/stages/new" className="rounded-md bg-brand px-4 py-2 text-sm font-medium text-white hover:bg-brand-dark">
            Nova etapa
          </Link>
        )}
      </div>

      <div className="overflow-hidden rounded-lg border border-slate-200 bg-white">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-left text-xs uppercase text-slate-500">
              <tr>
                <th className="px-4 py-2">Ordem</th>
                <th className="px-4 py-2">Nome</th>
                <th className="px-4 py-2">Leads/clientes nesta etapa</th>
                <th className="px-4 py-2">Exige motivo</th>
                <th className="px-4 py-2">Status</th>
              </tr>
            </thead>
            <tbody>
              {stages.map((stage) => (
                <tr key={stage.id} className="border-t border-slate-100 hover:bg-slate-50">
                  <td className="px-4 py-2 text-slate-500">{stage.order}</td>
                  <td className="px-4 py-2">
                    <Link href={`/admin/stages/${stage.id}`} className="flex items-center gap-2 text-brand-dark hover:underline">
                      {stage.color && (
                        <span
                          aria-hidden="true"
                          className="inline-block h-2.5 w-2.5 rounded-full border border-slate-300"
                          style={{ backgroundColor: stage.color }}
                        />
                      )}
                      {stage.name}
                    </Link>
                  </td>
                  <td className="px-4 py-2 text-slate-600">{stage._count.contacts}</td>
                  <td className="px-4 py-2 text-slate-600">{REASON_LABELS[stage.requiresReasonOn] ?? stage.requiresReasonOn}</td>
                  <td className="px-4 py-2">
                    {stage.isActive ? <span className="text-green-700">Ativa</span> : <span className="text-red-700">Inativa</span>}
                  </td>
                </tr>
              ))}
              {stages.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-4 py-6 text-center text-slate-500">
                    Nenhuma etapa cadastrada.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
