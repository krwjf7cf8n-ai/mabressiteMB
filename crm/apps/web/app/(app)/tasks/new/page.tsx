import { prisma } from "@mabres/db";
import { TASK_TYPE_OPTIONS } from "@mabres/shared";
import { getCurrentSession } from "@/lib/session";
import { createTaskAction } from "../actions";

export default async function NewTaskPage({
  searchParams,
}: {
  searchParams: { error?: string; contactId?: string; propertyId?: string; visitId?: string };
}) {
  const session = await getCurrentSession();
  const users = await prisma.user.findMany({ where: { isActive: true, deletedAt: null }, select: { id: true, name: true } });

  return (
    <div className="max-w-xl space-y-6">
      <h1 className="text-lg font-semibold text-slate-800">Nova tarefa</h1>

      {searchParams.error && (
        <div className="rounded-md border border-red-300 bg-red-50 p-3 text-sm text-red-700">{searchParams.error}</div>
      )}

      <form action={createTaskAction} className="space-y-4 rounded-lg border border-slate-200 bg-white p-6">
        {searchParams.contactId && <input type="hidden" name="contactId" value={searchParams.contactId} />}
        {searchParams.propertyId && <input type="hidden" name="propertyId" value={searchParams.propertyId} />}
        {searchParams.visitId && <input type="hidden" name="visitId" value={searchParams.visitId} />}

        <div>
          <label className="mb-1 block text-sm font-medium text-slate-700">Título</label>
          <input name="title" required className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm" />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="mb-1 block text-sm font-medium text-slate-700">Tipo</label>
            <select name="taskType" className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm">
              {TASK_TYPE_OPTIONS.map((t) => (
                <option key={t.value} value={t.value}>
                  {t.label}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-slate-700">Prioridade</label>
            <select name="priority" defaultValue="MEDIA" className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm">
              <option value="BAIXA">Baixa</option>
              <option value="MEDIA">Média</option>
              <option value="ALTA">Alta</option>
              <option value="URGENTE">Urgente</option>
            </select>
          </div>
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium text-slate-700">Responsável</label>
          <select name="assignedUserId" defaultValue={session?.user.id} className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm">
            {users.map((u) => (
              <option key={u.id} value={u.id}>
                {u.name}
              </option>
            ))}
          </select>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="mb-1 block text-sm font-medium text-slate-700">Vencimento</label>
            <input type="datetime-local" name="dueAt" className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm" />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-slate-700">Lembrete</label>
            <input type="datetime-local" name="reminderAt" className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm" />
          </div>
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium text-slate-700">Descrição</label>
          <textarea name="description" rows={3} className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm" />
        </div>
        <button type="submit" className="rounded-md bg-brand px-4 py-2 text-sm font-medium text-white hover:bg-brand-dark">
          Criar tarefa
        </button>
      </form>
    </div>
  );
}
