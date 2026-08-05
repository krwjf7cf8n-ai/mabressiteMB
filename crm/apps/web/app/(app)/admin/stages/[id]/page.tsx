import { notFound } from "next/navigation";
import { prisma } from "@mabres/db";
import { requirePermission } from "@/lib/session";
import { updateStageAction } from "../actions";

export default async function StageDetailPage({
  params,
  searchParams,
}: {
  params: { id: string };
  searchParams: { error?: string };
}) {
  const session = await requirePermission("stages:view");
  const stage = await prisma.pipelineStage.findUnique({ where: { id: params.id }, include: { _count: { select: { contacts: true } } } });

  if (!stage) notFound();

  const canManage = session.user.permissions.includes("stages:manage");

  return (
    <div className="max-w-xl space-y-6">
      <div>
        <h1 className="text-lg font-semibold text-slate-800">{stage.name}</h1>
        <p className="text-sm text-slate-500">
          {stage._count.contacts} lead(s)/cliente(s) nesta etapa · status {stage.isActive ? "Ativa" : "Inativa"}
        </p>
      </div>

      {searchParams.error && (
        <div className="rounded-md border border-red-300 bg-red-50 p-3 text-sm text-red-700">{searchParams.error}</div>
      )}

      <form action={updateStageAction} className="space-y-4 rounded-lg border border-slate-200 bg-white p-4">
        <input type="hidden" name="id" value={stage.id} />
        <input type="hidden" name="expectedUpdatedAt" value={stage.updatedAt.toISOString()} />
        <div>
          <label className="mb-1 block text-sm font-medium text-slate-700">Nome da etapa</label>
          <input
            name="name"
            required
            defaultValue={stage.name}
            disabled={!canManage}
            className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm disabled:bg-slate-50"
          />
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <label className="mb-1 block text-sm font-medium text-slate-700">Ordem</label>
            <input
              name="order"
              type="number"
              min={1}
              step={1}
              required
              defaultValue={stage.order}
              disabled={!canManage}
              className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm disabled:bg-slate-50"
            />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-slate-700">Cor (opcional)</label>
            <input
              name="color"
              type="text"
              placeholder="#22C55E"
              defaultValue={stage.color ?? ""}
              disabled={!canManage}
              className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm disabled:bg-slate-50"
            />
          </div>
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium text-slate-700">Exige motivo ao entrar nesta etapa?</label>
          <select
            name="requiresReasonOn"
            defaultValue={stage.requiresReasonOn}
            disabled={!canManage}
            className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm disabled:bg-slate-50"
          >
            <option value="NONE">Não exige</option>
            <option value="PAUSE">Exige (etapa de pausa)</option>
            <option value="LOSS">Exige (etapa de perda)</option>
          </select>
        </div>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" name="isActive" defaultChecked={stage.isActive} disabled={!canManage} />
          Etapa ativa (aparece como destino disponível no funil)
        </label>
        {canManage && (
          <button type="submit" className="rounded-md bg-brand px-4 py-2 text-sm font-medium text-white hover:bg-brand-dark">
            Salvar alterações
          </button>
        )}
      </form>
    </div>
  );
}
