import { prisma } from "@mabres/db";
import { createStageAction } from "../actions";

export default async function NewStagePage({ searchParams }: { searchParams: { error?: string } }) {
  const maxOrder = await prisma.pipelineStage.aggregate({ _max: { order: true } });
  const suggestedOrder = (maxOrder._max.order ?? 0) + 1;

  return (
    <div className="max-w-xl space-y-6">
      <div>
        <h1 className="text-lg font-semibold text-slate-800">Nova etapa do funil</h1>
        <p className="text-sm text-slate-500">
          A ordem precisa ser um número único — nenhuma outra etapa pode usar o mesmo valor.
        </p>
      </div>

      {searchParams.error && (
        <div className="rounded-md border border-red-300 bg-red-50 p-3 text-sm text-red-700">{searchParams.error}</div>
      )}

      <form action={createStageAction} className="space-y-4 rounded-lg border border-slate-200 bg-white p-4">
        <div>
          <label className="mb-1 block text-sm font-medium text-slate-700">Nome da etapa</label>
          <input name="name" required className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm" />
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
              defaultValue={suggestedOrder}
              className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-slate-700">Cor (opcional)</label>
            <input
              name="color"
              type="text"
              placeholder="#22C55E"
              className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
            />
          </div>
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium text-slate-700">Exige motivo ao entrar nesta etapa?</label>
          <select name="requiresReasonOn" defaultValue="NONE" className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm">
            <option value="NONE">Não exige</option>
            <option value="PAUSE">Exige (etapa de pausa)</option>
            <option value="LOSS">Exige (etapa de perda)</option>
          </select>
        </div>
        <button type="submit" className="rounded-md bg-brand px-4 py-2 text-sm font-medium text-white hover:bg-brand-dark">
          Criar etapa
        </button>
      </form>
    </div>
  );
}
