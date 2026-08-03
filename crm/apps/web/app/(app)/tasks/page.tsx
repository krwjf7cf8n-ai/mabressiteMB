import Link from "next/link";
import { prisma } from "@mabres/db";
import { formatDateTimeSaoPaulo } from "@mabres/shared";
import { getCurrentSession, getTaskScopeWhere } from "@/lib/session";

export default async function TasksPage({
  searchParams,
}: {
  searchParams: { status?: string };
}) {
  const session = await getCurrentSession();
  const scope = await getTaskScopeWhere();

  const where = {
    ...scope,
    ...(searchParams.status ? { status: searchParams.status as never } : { status: { not: "CANCELADA" as never } }),
  };

  const tasks = await prisma.task.findMany({
    where,
    include: { assignedUser: true, contact: true, property: true },
    orderBy: [{ dueAt: "asc" }, { createdAt: "desc" }],
    take: 100,
  });

  const now = new Date();

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-lg font-semibold text-slate-800">Tarefas</h1>
          <p className="text-sm text-slate-500">
            {session?.user.permissions.includes("tasks:view_all") ? "Toda a equipe" : "Suas tarefas"} ·{" "}
            {tasks.length} resultado(s)
          </p>
        </div>
        <Link href="/tasks/new" className="rounded-md bg-brand px-4 py-2 text-sm font-medium text-white hover:bg-brand-dark">
          Nova tarefa
        </Link>
      </div>

      <form className="flex gap-3">
        <select name="status" defaultValue={searchParams.status ?? ""} className="rounded-md border border-slate-300 px-3 py-2 text-sm">
          <option value="">Pendentes e em andamento</option>
          <option value="PENDENTE">Pendente</option>
          <option value="EM_ANDAMENTO">Em andamento</option>
          <option value="CONCLUIDA">Concluída</option>
          <option value="CANCELADA">Cancelada</option>
        </select>
        <button className="rounded-md border border-slate-300 px-3 py-2 text-sm hover:bg-slate-50">Filtrar</button>
      </form>

      <div className="overflow-hidden rounded-lg border border-slate-200 bg-white">
        <table className="min-w-full divide-y divide-slate-200 text-sm">
          <thead className="bg-slate-50 text-left text-xs uppercase text-slate-500">
            <tr>
              <th className="px-4 py-2">Título</th>
              <th className="px-4 py-2">Tipo</th>
              <th className="px-4 py-2">Relacionado</th>
              <th className="px-4 py-2">Responsável</th>
              <th className="px-4 py-2">Vencimento</th>
              <th className="px-4 py-2">Status</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {tasks.map((task) => {
              const overdue = task.dueAt && task.dueAt < now && task.status !== "CONCLUIDA" && task.status !== "CANCELADA";
              return (
                <tr key={task.id} className="hover:bg-slate-50">
                  <td className="px-4 py-2">
                    <Link href={`/tasks/${task.id}`} className="font-medium text-brand-dark hover:underline">
                      {task.title}
                    </Link>
                  </td>
                  <td className="px-4 py-2 text-slate-600">{task.taskType}</td>
                  <td className="px-4 py-2 text-slate-600">{task.contact?.name ?? task.property?.internalCode ?? "—"}</td>
                  <td className="px-4 py-2 text-slate-600">{task.assignedUser.name}</td>
                  <td className={`px-4 py-2 ${overdue ? "font-medium text-red-600" : "text-slate-600"}`}>
                    {task.dueAt ? formatDateTimeSaoPaulo(task.dueAt) : "—"} {overdue && "(vencida)"}
                  </td>
                  <td className="px-4 py-2 text-slate-600">{task.status}</td>
                </tr>
              );
            })}
            {tasks.length === 0 && (
              <tr>
                <td colSpan={6} className="px-4 py-6 text-center text-slate-500">
                  Nenhuma tarefa encontrada.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
