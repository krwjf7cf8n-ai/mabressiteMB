import { notFound } from "next/navigation";
import Link from "next/link";
import { prisma } from "@mabres/db";
import {
  formatDateTimeSaoPaulo,
  TASK_STATUS_LABELS,
  VISIT_MODALITY_LABELS,
  VISIT_ORIGIN_LABELS,
  VISIT_STATUS_LABELS,
} from "@mabres/shared";
import { getCurrentSession } from "@/lib/session";
import { describeJsonDiff } from "@/lib/audit-diff";
import { changeVisitStatusAction, completeVisitOutcomeAction, reassignVisitAction, rescheduleVisitAction } from "../actions";

const VISIT_EVENT_LABELS: Record<string, string> = {
  CREATED: "Visita criada",
  STATUS_CHANGED: "Status alterado",
  RESCHEDULED: "Reagendada",
  ASSIGNEE_CHANGED: "Corretor reatribuído",
  CLIENT_CHANGED: "Cliente alterado",
  PROPERTY_CHANGED: "Imóvel alterado",
  CONFLICT_OVERRIDDEN: "Conflito de agenda confirmado",
  RESULT_RECORDED: "Resultado da visita registrado",
  CANCELLED: "Cancelada",
  CORRECTED_BY_ADMIN: "Correção administrativa excepcional",
};

const NEXT_STATUS_ACTIONS: Record<string, Array<{ to: string; label: string; needsReason: boolean; style: string }>> = {
  AGUARDANDO_CONFIRMACAO: [
    { to: "CONFIRMADA", label: "Confirmar", needsReason: false, style: "bg-brand text-white hover:bg-brand-dark" },
    { to: "PROPRIETARIO_INDISPONIVEL", label: "Proprietário indisponível", needsReason: true, style: "border border-amber-300 text-amber-700 hover:bg-amber-50" },
    { to: "CANCELADA_CLIENTE", label: "Cancelar (cliente)", needsReason: true, style: "border border-red-300 text-red-700 hover:bg-red-50" },
    { to: "CANCELADA_CORRETOR", label: "Cancelar (corretor)", needsReason: true, style: "border border-red-300 text-red-700 hover:bg-red-50" },
  ],
  CONFIRMADA: [
    { to: "CLIENTE_NAO_COMPARECEU", label: "Cliente não compareceu", needsReason: true, style: "border border-amber-300 text-amber-700 hover:bg-amber-50" },
    { to: "CANCELADA_CLIENTE", label: "Cancelar (cliente)", needsReason: true, style: "border border-red-300 text-red-700 hover:bg-red-50" },
    { to: "CANCELADA_CORRETOR", label: "Cancelar (corretor)", needsReason: true, style: "border border-red-300 text-red-700 hover:bg-red-50" },
  ],
  REAGENDADA: [
    { to: "CONFIRMADA", label: "Confirmar", needsReason: false, style: "bg-brand text-white hover:bg-brand-dark" },
    { to: "CANCELADA_CLIENTE", label: "Cancelar (cliente)", needsReason: true, style: "border border-red-300 text-red-700 hover:bg-red-50" },
  ],
  CLIENTE_NAO_COMPARECEU: [{ to: "CANCELADA_CORRETOR", label: "Cancelar definitivamente", needsReason: true, style: "border border-red-300 text-red-700 hover:bg-red-50" }],
  PROPRIETARIO_INDISPONIVEL: [{ to: "CANCELADA_CORRETOR", label: "Cancelar definitivamente", needsReason: true, style: "border border-red-300 text-red-700 hover:bg-red-50" }],
};

export default async function VisitDetailPage({
  params,
  searchParams,
}: {
  params: { id: string };
  searchParams: { error?: string };
}) {
  const session = await getCurrentSession();
  const visit = await prisma.visit.findUnique({
    where: { id: params.id },
    include: {
      contact: true,
      property: true,
      brokerUser: true,
      createdByUser: true,
      events: { orderBy: { createdAt: "desc" } },
      tasks: { orderBy: { createdAt: "desc" } },
    },
  });

  if (!visit) notFound();

  // Escopo por responsável: quem não tem visits:view_all só pode ver as
  // próprias visitas — mesma proteção já aplicada na listagem (achado S4).
  const canViewAllVisits = session?.user.permissions.includes("visits:view_all");
  if (!canViewAllVisits && visit.brokerUserId !== session?.user.id) {
    notFound();
  }

  const canUpdate = session?.user.permissions.includes("visits:update");
  const canOverride = session?.user.permissions.includes("visits:override_conflict");

  const nextActions = NEXT_STATUS_ACTIONS[visit.status] ?? [];
  const canComplete = visit.status === "CONFIRMADA" && canUpdate;
  const canReschedule = ["AGUARDANDO_CONFIRMACAO", "CONFIRMADA", "REAGENDADA"].includes(visit.status) && canUpdate;
  const canReassign = session?.user.permissions.includes("visits:reassign");
  const brokers = canReassign
    ? await prisma.user.findMany({ where: { isActive: true, deletedAt: null }, select: { id: true, name: true } })
    : [];

  return (
    <div className="grid gap-6 lg:grid-cols-3">
      <div className="lg:col-span-2 space-y-6">
        <div>
          <h1 className="text-lg font-semibold text-slate-800">
            Visita — {visit.contact.name} · {visit.property.internalCode}
          </h1>
          <p className="text-sm text-slate-500">
            {formatDateTimeSaoPaulo(visit.scheduledAt)} · {visit.durationMinutes} min ·{" "}
            {VISIT_MODALITY_LABELS[visit.modality] ?? visit.modality} · status{" "}
            {VISIT_STATUS_LABELS[visit.status] ?? visit.status}
          </p>
        </div>

        {searchParams.error && (
          <div className="rounded-md border border-red-300 bg-red-50 p-3 text-sm text-red-700">{searchParams.error}</div>
        )}

        {(nextActions.length > 0 || canUpdate) && (
          <section className="rounded-lg border border-slate-200 bg-white p-4">
            <h2 className="mb-3 text-sm font-semibold text-slate-700">Ações</h2>
            <div className="flex flex-wrap gap-2">
              {nextActions.map((action) => (
                <form key={action.to} action={changeVisitStatusAction} className="flex items-center gap-2">
                  <input type="hidden" name="id" value={visit.id} />
                  <input type="hidden" name="expectedUpdatedAt" value={visit.updatedAt.toISOString()} />
                  <input type="hidden" name="toStatus" value={action.to} />
                  {action.needsReason && (
                    <input name="reason" placeholder="Motivo" required className="rounded-md border border-slate-300 px-2 py-1 text-xs" />
                  )}
                  <button type="submit" className={`rounded-md px-3 py-1.5 text-sm ${action.style}`}>
                    {action.label}
                  </button>
                </form>
              ))}
            </div>

            {canOverride && ["REALIZADA", "CANCELADA_CLIENTE", "CANCELADA_CORRETOR"].includes(visit.status) && (
              <form action={changeVisitStatusAction} className="mt-3 flex items-center gap-2 border-t border-slate-100 pt-3">
                <input type="hidden" name="id" value={visit.id} />
                <input type="hidden" name="expectedUpdatedAt" value={visit.updatedAt.toISOString()} />
                <input type="hidden" name="allowException" value="true" />
                <span className="text-xs text-slate-500">Correção excepcional (auditada):</span>
                <select name="toStatus" className="rounded-md border border-slate-300 px-2 py-1 text-xs">
                  <option value="AGUARDANDO_CONFIRMACAO">Aguardando confirmação</option>
                  <option value="CONFIRMADA">Confirmada</option>
                </select>
                <input name="reason" placeholder="Justificativa obrigatória" required className="rounded-md border border-slate-300 px-2 py-1 text-xs" />
                <button type="submit" className="rounded-md border border-amber-300 px-3 py-1.5 text-xs text-amber-700 hover:bg-amber-50">
                  Aplicar correção
                </button>
              </form>
            )}
          </section>
        )}

        {canReschedule && (
          <section className="rounded-lg border border-slate-200 bg-white p-4">
            <h2 className="mb-3 text-sm font-semibold text-slate-700">Reagendar</h2>
            <form action={rescheduleVisitAction} className="grid grid-cols-2 gap-3">
              <input type="hidden" name="id" value={visit.id} />
              <input type="hidden" name="expectedUpdatedAt" value={visit.updatedAt.toISOString()} />
              <input type="datetime-local" name="scheduledAt" required className="rounded-md border border-slate-300 px-3 py-2 text-sm" />
              <input type="number" name="durationMinutes" defaultValue={visit.durationMinutes} className="rounded-md border border-slate-300 px-3 py-2 text-sm" />
              <input name="reason" placeholder="Motivo do reagendamento" required className="col-span-2 rounded-md border border-slate-300 px-3 py-2 text-sm" />
              {canOverride && (
                <label className="col-span-2 flex items-center gap-2 text-xs text-slate-500">
                  <input type="checkbox" name="confirmConflict" value="true" /> Confirmar mesmo se houver conflito de agenda
                </label>
              )}
              <button type="submit" className="col-span-2 rounded-md bg-brand px-4 py-2 text-sm font-medium text-white hover:bg-brand-dark">
                Reagendar
              </button>
            </form>
          </section>
        )}

        {canComplete && (
          <section className="rounded-lg border border-slate-200 bg-white p-4">
            <h2 className="mb-3 text-sm font-semibold text-slate-700">Marcar como realizada / registrar resultado</h2>
            <form action={completeVisitOutcomeAction} className="space-y-3">
              <input type="hidden" name="id" value={visit.id} />
              <input type="hidden" name="expectedUpdatedAt" value={visit.updatedAt.toISOString()} />
              <div className="grid grid-cols-2 gap-3">
                <select name="interestLevel" className="rounded-md border border-slate-300 px-3 py-2 text-sm">
                  <option value="">Nível de interesse</option>
                  <option value="baixo">Baixo</option>
                  <option value="medio">Médio</option>
                  <option value="alto">Alto</option>
                </select>
                <input type="datetime-local" name="recommendedReturnAt" className="rounded-md border border-slate-300 px-3 py-2 text-sm" />
              </div>
              <input name="positivePoints" placeholder="Pontos positivos" className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm" />
              <input name="objections" placeholder="Objeções" className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm" />
              <input name="rejectionReason" placeholder="Motivo de rejeição (se houver)" className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm" />
              <div className="flex flex-wrap gap-4 text-sm text-slate-600">
                <label className="flex items-center gap-2"><input type="checkbox" name="intendsToPropose" /> Pretende propor</label>
                <label className="flex items-center gap-2"><input type="checkbox" name="needsFinancingReview" /> Precisa avaliar financiamento</label>
                <label className="flex items-center gap-2"><input type="checkbox" name="wantsToSeeOtherProperties" /> Quer ver outros imóveis</label>
                <label className="flex items-center gap-2"><input type="checkbox" name="createFollowUpTask" defaultChecked /> Criar tarefa de retorno</label>
              </div>
              <textarea name="outcomeNotes" rows={2} placeholder="Observações" className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm" />
              <input name="nextAction" placeholder="Próxima ação" className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm" />
              <button type="submit" className="rounded-md bg-brand px-4 py-2 text-sm font-medium text-white hover:bg-brand-dark">
                Registrar visita realizada
              </button>
            </form>
          </section>
        )}

        <section className="rounded-lg border border-slate-200 bg-white p-4">
          <h2 className="mb-3 text-sm font-semibold text-slate-700">Histórico (linha do tempo append-only)</h2>
          <ul className="space-y-2 text-sm">
            {visit.events.map((event) => (
              <li key={event.id} className="border-b border-slate-100 pb-2 last:border-0">
                <span className="font-medium text-slate-700">{VISIT_EVENT_LABELS[event.eventType] ?? event.eventType}</span>
                <span className="ml-2 text-slate-400">{formatDateTimeSaoPaulo(event.createdAt)}</span>
                {describeJsonDiff(event.previousData, event.newData).map((line) => (
                  <p key={line} className="text-slate-500">
                    {line}
                  </p>
                ))}
                {event.reason && <p className="text-slate-500">Motivo: {event.reason}</p>}
              </li>
            ))}
            {visit.events.length === 0 && <li className="text-slate-500">Sem histórico.</li>}
          </ul>
        </section>

        {(visit.outcomeNotes || visit.interestLevel) && (
          <section className="rounded-lg border border-slate-200 bg-white p-4 text-sm">
            <h2 className="mb-2 font-semibold text-slate-700">Resultado registrado</h2>
            <dl className="space-y-1 text-slate-600">
              {visit.interestLevel && <div>Interesse: {visit.interestLevel}</div>}
              {visit.positivePoints && <div>Pontos positivos: {visit.positivePoints}</div>}
              {visit.objections && <div>Objeções: {visit.objections}</div>}
              {visit.outcomeNotes && <div>Observações: {visit.outcomeNotes}</div>}
              {visit.nextAction && <div>Próxima ação: {visit.nextAction}</div>}
            </dl>
          </section>
        )}
      </div>

      <aside className="space-y-4">
        <section className="rounded-lg border border-slate-200 bg-white p-4 text-sm">
          <h2 className="mb-2 font-semibold text-slate-700">Dados</h2>
          <dl className="space-y-1 text-slate-600">
            <div>
              <dt className="inline font-medium">Cliente: </dt>
              <dd className="inline">
                <Link href={`/leads/${visit.contact.id}`} className="text-brand-dark hover:underline">
                  {visit.contact.name}
                </Link>
              </dd>
            </div>
            <div>
              <dt className="inline font-medium">Imóvel: </dt>
              <dd className="inline">
                <Link href={`/properties/${visit.property.id}`} className="text-brand-dark hover:underline">
                  {visit.property.internalCode}
                </Link>
              </dd>
            </div>
            <div>
              <dt className="inline font-medium">Corretor: </dt>
              <dd className="inline">{visit.brokerUser.name}</dd>
            </div>
            {canReassign && (
              <form action={reassignVisitAction} className="flex items-center gap-2 pt-1">
                <input type="hidden" name="id" value={visit.id} />
                <input type="hidden" name="expectedUpdatedAt" value={visit.updatedAt.toISOString()} />
                <select name="brokerUserId" defaultValue={visit.brokerUserId} className="rounded-md border border-slate-300 px-2 py-1 text-xs">
                  {brokers.map((b) => (
                    <option key={b.id} value={b.id}>
                      {b.name}
                    </option>
                  ))}
                </select>
                <button type="submit" className="rounded-md border border-slate-300 px-2 py-1 text-xs hover:bg-slate-50">
                  Reatribuir
                </button>
              </form>
            )}
            <div>
              <dt className="inline font-medium">Criado por: </dt>
              <dd className="inline">{visit.createdByUser.name}</dd>
            </div>
            <div>
              <dt className="inline font-medium">Origem: </dt>
              <dd className="inline">{VISIT_ORIGIN_LABELS[visit.origin] ?? visit.origin}</dd>
            </div>
            {visit.meetingPoint && (
              <div>
                <dt className="inline font-medium">Ponto de encontro: </dt>
                <dd className="inline">{visit.meetingPoint}</dd>
              </div>
            )}
            {visit.scheduleConflictNote && (
              <div className="text-amber-700">
                <dt className="inline font-medium">Conflito confirmado: </dt>
                <dd className="inline">{visit.scheduleConflictNote}</dd>
              </div>
            )}
          </dl>
        </section>

        <section className="rounded-lg border border-slate-200 bg-white p-4 text-sm">
          <div className="mb-2 flex items-center justify-between">
            <h2 className="font-semibold text-slate-700">Tarefas relacionadas</h2>
            <Link href={`/tasks/new?contactId=${visit.contactId}&propertyId=${visit.propertyId}&visitId=${visit.id}`} className="text-xs text-brand-dark underline hover:no-underline">
              Nova tarefa
            </Link>
          </div>
          <ul className="space-y-1 text-slate-600">
            {visit.tasks.map((t) => (
              <li key={t.id}>
                <Link href={`/tasks/${t.id}`} className="hover:underline">
                  {t.title}
                </Link>{" "}
                — {TASK_STATUS_LABELS[t.status] ?? t.status}
              </li>
            ))}
            {visit.tasks.length === 0 && <li className="text-slate-500">Nenhuma.</li>}
          </ul>
        </section>
      </aside>
    </div>
  );
}
