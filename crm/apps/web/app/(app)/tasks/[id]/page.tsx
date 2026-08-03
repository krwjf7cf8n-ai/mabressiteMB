import { notFound } from "next/navigation";
import Link from "next/link";
import { prisma } from "@mabres/db";
import { formatDateTimeSaoPaulo } from "@mabres/shared";
import { getCurrentSession } from "@/lib/session";
import {
  cancelTaskAction,
  completeTaskAction,
  reassignTaskAction,
  reopenTaskAction,
} from "../actions";

export default async function TaskDetailPage({
  params,
  searchParams,
}: {
  params: { id: string };
  searchParams: { error?: string };
}) {
  const session = await getCurrentSession();
  const task = await prisma.task.findUnique({
    where: { id: params.id },
    include: { assignedUser: true, createdByUser: true, contact: true, property: true, visit: true },
  });

  if (!task) notFound();

  const auditLogs = await prisma.auditLog.findMany({
    where: { entityType: "Task", entityId: task.id },
    orderBy: { createdAt: "desc" },
    include: { actorUser: true },
  });

  const users = await prisma.user.findMany({ where: { isActive: true, deletedAt: null }, select: { id: true, name: true } });

  const canComplete = session?.user.permissions.includes("tasks:complete");
  const canCancel = session?.user.permissions.includes("tasks:cancel");
  const canReassign = session?.user.permissions.includes("tasks:reassign");
  const canUpdate = session?.user.permissions.includes("tasks:update");

  return (
    <div className="grid gap-6 lg:grid-cols-3">
      <div className="lg:col-span-2 space-y-6">
        <div>
          <h1 className="text-lg font-semibold text-slate-800">{task.title}</h1>
          <p className="text-sm text-slate-500">
            {task.taskType} · prioridade {task.priority} · status {task.status} · origem {task.origin}
          </p>
          {task.description && <p className="mt-2 whitespace-pre-wrap text-sm text-slate-600">{task.description}</p>}
        </div>

        {searchParams.error && (
          <div className="rounded-md border border-red-300 bg-red-50 p-3 text-sm text-red-700">{searchParams.error}</div>
        )}

        <section className="flex flex-wrap gap-3 rounded-lg border border-slate-200 bg-white p-4">
          {task.status !== "CONCLUIDA" && task.status !== "CANCELADA" && canComplete && (
            <form action={completeTaskAction} className="flex gap-2">
              <input type="hidden" name="id" value={task.id} />
              <input name="completionNotes" placeholder="Observação de conclusão (opcional)" className="rounded-md border border-slate-300 px-2 py-1 text-sm" />
              <button type="submit" className="rounded-md bg-brand px-3 py-1.5 text-sm font-medium text-white hover:bg-brand-dark">
                Concluir
              </button>
            </form>
          )}
          {task.status !== "CANCELADA" && task.status !== "CONCLUIDA" && canCancel && (
            <form action={cancelTaskAction} className="flex gap-2">
              <input type="hidden" name="id" value={task.id} />
              <input name="reason" required placeholder="Motivo do cancelamento" className="rounded-md border border-slate-300 px-2 py-1 text-sm" />
              <button type="submit" className="rounded-md border border-red-300 px-3 py-1.5 text-sm text-red-700 hover:bg-red-50">
                Cancelar
              </button>
            </form>
          )}
          {(task.status === "CONCLUIDA" || task.status === "CANCELADA") && canUpdate && (
            <form action={reopenTaskAction}>
              <input type="hidden" name="id" value={task.id} />
              <button type="submit" className="rounded-md border border-slate-300 px-3 py-1.5 text-sm hover:bg-slate-50">
                Reabrir
              </button>
            </form>
          )}
          {canReassign && (
            <form action={reassignTaskAction} className="flex gap-2">
              <input type="hidden" name="id" value={task.id} />
              <select name="assignedUserId" defaultValue={task.assignedUserId} className="rounded-md border border-slate-300 px-2 py-1 text-sm">
                {users.map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.name}
                  </option>
                ))}
              </select>
              <button type="submit" className="rounded-md border border-slate-300 px-3 py-1.5 text-sm hover:bg-slate-50">
                Reatribuir
              </button>
            </form>
          )}
        </section>

        <section className="rounded-lg border border-slate-200 bg-white p-4">
          <h2 className="mb-2 text-sm font-semibold text-slate-700">Histórico</h2>
          <ul className="space-y-2 text-sm">
            {auditLogs.map((log) => (
              <li key={log.id} className="border-b border-slate-100 pb-2 last:border-0">
                <span className="text-slate-700">{log.action}</span>
                <span className="ml-2 text-slate-400">
                  {log.actorUser?.name ?? "sistema"} · {formatDateTimeSaoPaulo(log.createdAt)}
                </span>
              </li>
            ))}
            {auditLogs.length === 0 && <li className="text-slate-500">Sem histórico.</li>}
          </ul>
        </section>
      </div>

      <aside className="space-y-4">
        <section className="rounded-lg border border-slate-200 bg-white p-4 text-sm">
          <h2 className="mb-2 font-semibold text-slate-700">Dados</h2>
          <dl className="space-y-1 text-slate-600">
            <div>
              <dt className="inline font-medium">Responsável: </dt>
              <dd className="inline">{task.assignedUser.name}</dd>
            </div>
            <div>
              <dt className="inline font-medium">Criado por: </dt>
              <dd className="inline">{task.createdByUser.name}</dd>
            </div>
            <div>
              <dt className="inline font-medium">Vencimento: </dt>
              <dd className="inline">{task.dueAt ? formatDateTimeSaoPaulo(task.dueAt) : "—"}</dd>
            </div>
            {task.completedAt && (
              <div>
                <dt className="inline font-medium">Concluída em: </dt>
                <dd className="inline">{formatDateTimeSaoPaulo(task.completedAt)}</dd>
              </div>
            )}
            {task.cancellationReason && (
              <div>
                <dt className="inline font-medium">Motivo do cancelamento: </dt>
                <dd className="inline">{task.cancellationReason}</dd>
              </div>
            )}
            {task.contact && (
              <div>
                <dt className="inline font-medium">Cliente: </dt>
                <dd className="inline">
                  <Link href={`/leads/${task.contact.id}`} className="text-brand-dark hover:underline">
                    {task.contact.name}
                  </Link>
                </dd>
              </div>
            )}
            {task.property && (
              <div>
                <dt className="inline font-medium">Imóvel: </dt>
                <dd className="inline">
                  <Link href={`/properties/${task.property.id}`} className="text-brand-dark hover:underline">
                    {task.property.internalCode}
                  </Link>
                </dd>
              </div>
            )}
            {task.visit && (
              <div>
                <dt className="inline font-medium">Visita: </dt>
                <dd className="inline">
                  <Link href={`/visits/${task.visit.id}`} className="text-brand-dark hover:underline">
                    {formatDateTimeSaoPaulo(task.visit.scheduledAt)}
                  </Link>
                </dd>
              </div>
            )}
          </dl>
        </section>
      </aside>
    </div>
  );
}
