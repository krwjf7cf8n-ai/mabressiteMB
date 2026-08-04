import Link from "next/link";
import { prisma } from "@mabres/db";
import { formatDateTimeSaoPaulo } from "@mabres/shared";
import { getCurrentSession, getTaskScopeWhere } from "@/lib/session";
import { Pagination } from "@/components/ui/pagination";
import { DEFAULT_PAGE_SIZE, parsePageParam, parseSearchTerm, startOfDaySaoPaulo } from "@/lib/list-query";

const OPEN_TASK_STATUSES = ["PENDENTE", "EM_ANDAMENTO"] as const;

export default async function TasksPage({
  searchParams,
}: {
  searchParams: { status?: string; q?: string; page?: string; view?: string };
}) {
  const session = await getCurrentSession();
  const scope = await getTaskScopeWhere();
  const q = parseSearchTerm(searchParams.q);
  const page = parsePageParam(searchParams.page);
  const view = searchParams.view ?? "";

  const todayStart = startOfDaySaoPaulo(0);
  const todayEnd = startOfDaySaoPaulo(1);

  const where = {
    ...scope,
    ...(searchParams.status ? { status: searchParams.status as never } : { status: { not: "CANCELADA" as never } }),
    // G29 — filtros rápidos "Hoje"/"Atrasadas": sempre restritos a tarefas
    // em aberto (não faz sentido uma tarefa concluída/cancelada aparecer
    // como "atrasada"), combinados com o filtro de status normal acima.
    ...(view === "hoje" ? { dueAt: { gte: todayStart, lt: todayEnd }, status: { in: [...OPEN_TASK_STATUSES] } } : {}),
    ...(view === "atrasadas" ? { dueAt: { lt: new Date() }, status: { in: [...OPEN_TASK_STATUSES] } } : {}),
    ...(q
      ? {
          OR: [
            { title: { contains: q, mode: "insensitive" as const } },
            { description: { contains: q, mode: "insensitive" as const } },
            { contact: { name: { contains: q, mode: "insensitive" as const } } },
            { assignedUser: { name: { contains: q, mode: "insensitive" as const } } },
          ],
        }
      : {}),
  };

  const [total, tasks] = await Promise.all([
    prisma.task.count({ where }),
    prisma.task.findMany({
      where,
      include: { assignedUser: true, contact: true, property: true },
      orderBy: [{ dueAt: "asc" }, { createdAt: "desc" }],
      skip: (page - 1) * DEFAULT_PAGE_SIZE,
      take: DEFAULT_PAGE_SIZE,
    }),
  ]);

  const buildHref = (targetPage: number) => {
    const params = new URLSearchParams();
    if (q) params.set("q", q);
    if (searchParams.status) params.set("status", searchParams.status);
    if (view) params.set("view", view);
    if (targetPage > 1) params.set("page", String(targetPage));
    const qs = params.toString();
    return qs ? `/tasks?${qs}` : "/tasks";
  };

  const now = new Date();

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-lg font-semibold text-slate-800">Tarefas</h1>
          <p className="text-sm text-slate-500">
            {session?.user.permissions.includes("tasks:view_all") ? "Toda a equipe" : "Suas tarefas"} ·{" "}
            {total} resultado(s){q ? ` para "${q}"` : ""}
          </p>
        </div>
        <Link href="/tasks/new" className="rounded-md bg-brand px-4 py-2 text-sm font-medium text-white hover:bg-brand-dark">
          Nova tarefa
        </Link>
      </div>

      <div className="flex flex-wrap gap-2 text-sm">
        {[
          ["", "Todas"],
          ["hoje", "Hoje"],
          ["atrasadas", "Atrasadas"],
        ].map(([value, label]) => (
          <Link
            key={value}
            href={value ? `/tasks?view=${value}` : "/tasks"}
            className={`rounded-md border px-3 py-1.5 ${view === value ? "border-brand bg-brand text-white" : "border-slate-300 text-slate-600 hover:bg-slate-50"}`}
          >
            {label}
          </Link>
        ))}
      </div>

      <form className="flex flex-wrap gap-3">
        <input type="hidden" name="view" value={view} />
        <input
          type="search"
          name="q"
          defaultValue={q}
          placeholder="Título, descrição, contato ou responsável"
          maxLength={100}
          className="min-w-0 flex-1 rounded-md border border-slate-300 px-3 py-2 text-sm"
        />
        <select name="status" defaultValue={searchParams.status ?? ""} className="rounded-md border border-slate-300 px-3 py-2 text-sm">
          <option value="">Pendentes e em andamento</option>
          <option value="PENDENTE">Pendente</option>
          <option value="EM_ANDAMENTO">Em andamento</option>
          <option value="CONCLUIDA">Concluída</option>
          <option value="CANCELADA">Cancelada</option>
        </select>
        <button className="rounded-md border border-slate-300 px-3 py-2 text-sm hover:bg-slate-50">Filtrar</button>
        {q && (
          <Link href="/tasks" className="self-center text-sm text-slate-500 underline hover:text-slate-700">
            Limpar busca
          </Link>
        )}
      </form>

      <div className="overflow-hidden rounded-lg border border-slate-200 bg-white">
        <div className="overflow-x-auto">
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
                    {q ? `Nenhuma tarefa encontrada para "${q}".` : "Nenhuma tarefa encontrada."}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      <Pagination page={page} pageSize={DEFAULT_PAGE_SIZE} total={total} buildHref={buildHref} />
    </div>
  );
}
