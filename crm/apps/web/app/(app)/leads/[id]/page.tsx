import { notFound } from "next/navigation";
import Link from "next/link";
import { prisma } from "@mabres/db";
import {
  CONTACT_ORIGIN_LABELS,
  formatDateTimeSaoPaulo,
  TASK_PRIORITY_LABELS,
  TASK_STATUS_LABELS,
} from "@mabres/shared";
import { getCurrentSession } from "@/lib/session";
import { getMatchesForContact } from "@/lib/matching-service";
import { MatchResultsList, type MatchListItem } from "@/components/match-results-list";
import { RecalculateMatchesButton } from "@/components/recalculate-matches-button";
import { PhoneLink } from "@/components/ui/phone-link";
import { WhatsAppLink } from "@/components/ui/whatsapp-link";
import { changeStageAction, recalculateMatchesForContactAction } from "../actions";
import { PreferenceForm } from "../preference-form";

export default async function LeadDetailPage({
  params,
  searchParams,
}: {
  params: { id: string };
  searchParams: { error?: string };
}) {
  const session = await getCurrentSession();
  const canViewFinancial = session?.user.permissions.includes("contacts:view_financial");
  const canViewMatches = session?.user.permissions.includes("matches:view");
  const canRecalculateMatches = session?.user.permissions.includes("matches:recalculate");

  const contact = await prisma.contact.findUnique({
    where: { id: params.id },
    include: {
      stage: true,
      ownerUser: true,
      financialInfo: canViewFinancial,
      preference: true,
      stageHistory: { orderBy: { createdAt: "desc" }, include: { toStage: true, fromStage: true } },
      consents: true,
    },
  });

  if (!contact) notFound();

  // Escopo por dono: quem não tem contacts:view_all só pode ver os próprios
  // leads/clientes — nunca confiar só em esconder da listagem (achado S2/S18).
  const canViewAllContacts = session?.user.permissions.includes("contacts:view_all");
  if (!canViewAllContacts && contact.ownerUserId !== session?.user.id) {
    notFound();
  }

  const [stages, openTasks] = await Promise.all([
    prisma.pipelineStage.findMany({
      where: { isActive: true },
      orderBy: { order: "asc" },
    }),
    prisma.task.findMany({
      where: { contactId: contact.id, status: { notIn: ["CONCLUIDA", "CANCELADA"] } },
      include: { assignedUser: true },
      orderBy: [{ dueAt: "asc" }, { createdAt: "desc" }],
      take: 10,
    }),
  ]);

  let matchItems: MatchListItem[] = [];
  let matchSummary: Awaited<ReturnType<typeof getMatchesForContact>> | null = null;

  if (canViewMatches) {
    matchSummary = await getMatchesForContact(contact.id);
    const properties = await prisma.property.findMany({
      where: { id: { in: matchSummary.eligible.map((m) => m.propertyId) } },
    });
    const propertyById = new Map(properties.map((p) => [p.id, p]));
    matchItems = matchSummary.eligible
      .map((m) => {
        const property = propertyById.get(m.propertyId);
        if (!property) return null;
        return {
          id: property.id,
          title: `${property.internalCode} — ${property.propertyType}`,
          subtitle: `${property.city}${property.neighborhood ? ` — ${property.neighborhood}` : ""}`,
          href: `/properties/${property.id}`,
          result: m.result,
          calculatedAt: m.calculatedAt,
        };
      })
      .filter((x): x is MatchListItem => x !== null);
  }

  return (
    <div className="grid gap-6 lg:grid-cols-3">
      <div className="lg:col-span-2 space-y-6">
        <div>
          <h1 className="text-lg font-semibold text-slate-800">{contact.name}</h1>
          <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-slate-500">
            <PhoneLink phone={contact.phone} />
            <WhatsAppLink phone={contact.whatsapp ?? contact.phone} />
            <span>
              · {contact.email || "sem e-mail"} · Origem: {CONTACT_ORIGIN_LABELS[contact.origin] ?? contact.origin}
            </span>
          </p>
        </div>

        {searchParams.error && (
          <div className="rounded-md border border-red-300 bg-red-50 p-3 text-sm text-red-700">
            {searchParams.error}
          </div>
        )}

        <section className="rounded-lg border border-slate-200 bg-white p-4">
          <h2 className="mb-3 text-sm font-semibold text-slate-700">Mudar etapa do funil</h2>
          <form action={changeStageAction} className="space-y-3">
            <input type="hidden" name="contactId" value={contact.id} />
            <select
              name="toStageId"
              defaultValue={contact.stageId ?? ""}
              className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
            >
              {stages.map((stage) => (
                <option key={stage.id} value={stage.id}>
                  {stage.name}
                </option>
              ))}
            </select>
            <input
              name="reason"
              placeholder="Motivo (obrigatório para perda/pausa)"
              className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
            />
            <input
              name="comment"
              placeholder="Comentário (opcional)"
              className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
            />
            <button
              type="submit"
              className="rounded-md bg-brand px-4 py-2 text-sm font-medium text-white hover:bg-brand-dark"
            >
              Registrar mudança
            </button>
          </form>
        </section>

        <section className="rounded-lg border border-slate-200 bg-white p-4">
          <h2 className="mb-3 text-sm font-semibold text-slate-700">Histórico de etapas</h2>
          <ul className="space-y-2 text-sm">
            {contact.stageHistory.map((h) => (
              <li key={h.id} className="border-b border-slate-100 pb-2 last:border-0">
                <span className="text-slate-700">
                  {h.fromStage?.name ?? "—"} → {h.toStage.name}
                </span>
                <span className="ml-2 text-slate-400">{formatDateTimeSaoPaulo(h.createdAt)}</span>
                {h.reason && <p className="text-slate-500">Motivo: {h.reason}</p>}
                {h.comment && <p className="text-slate-500">{h.comment}</p>}
              </li>
            ))}
            {contact.stageHistory.length === 0 && (
              <li className="text-slate-500">Sem histórico registrado.</li>
            )}
          </ul>
        </section>

        <section className="rounded-lg border border-slate-200 bg-white p-4">
          <h2 className="mb-3 text-sm font-semibold text-slate-700">Preferências e critérios de matching</h2>
          <PreferenceForm
            values={{
              contactId: contact.id,
              intent: contact.preference?.intent,
              desiredCity: contact.preference?.desiredCity,
              desiredNeighborhoods: contact.preference?.desiredNeighborhoods,
              propertyType: contact.preference?.propertyType,
              minPrice: contact.preference?.minPrice,
              maxPrice: contact.preference?.maxPrice,
              bedrooms: contact.preference?.bedrooms,
              suites: contact.preference?.suites,
              parkingSpots: contact.preference?.parkingSpots,
              needsBackyard: contact.preference?.needsBackyard,
              needsGourmetArea: contact.preference?.needsGourmetArea,
              houseFormat: contact.preference?.houseFormat,
              condoOrOpen: contact.preference?.condoOrOpen,
              criteriaRequirements: contact.preference?.criteriaRequirements as never,
            }}
          />
        </section>

        {canViewMatches && (
          <section className="rounded-lg border border-slate-200 bg-white p-4">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-sm font-semibold text-slate-700">Imóveis compatíveis</h2>
              {canRecalculateMatches && (
                <form action={recalculateMatchesForContactAction}>
                  <input type="hidden" name="contactId" value={contact.id} />
                  <RecalculateMatchesButton />
                </form>
              )}
            </div>
            <MatchResultsList
              items={matchItems}
              totalEvaluated={matchSummary?.totalEvaluated ?? 0}
              eliminationReasonTally={matchSummary?.eliminationReasonTally ?? []}
              emptyContext="Nenhum imóvel ativo cadastrado ainda para calcular compatibilidade."
              contextLabel={`Imóveis compatíveis com ${contact.name}`}
            />
          </section>
        )}
      </div>

      <aside className="space-y-4">
        <section className="rounded-lg border border-slate-200 bg-white p-4 text-sm">
          <h2 className="mb-2 font-semibold text-slate-700">Dados</h2>
          <dl className="space-y-1 text-slate-600">
            <div>
              <dt className="inline font-medium">Etapa atual: </dt>
              <dd className="inline">{contact.stage?.name ?? "—"}</dd>
            </div>
            <div>
              <dt className="inline font-medium">Responsável: </dt>
              <dd className="inline">{contact.ownerUser?.name ?? "—"}</dd>
            </div>
            <div>
              <dt className="inline font-medium">Temperatura: </dt>
              <dd className="inline">{contact.temperature}</dd>
            </div>
            <div>
              <dt className="inline font-medium">Cidade: </dt>
              <dd className="inline">
                {contact.city ?? "—"} {contact.state ? `/${contact.state}` : ""}
              </dd>
            </div>
            <div>
              <dt className="inline font-medium">Último contato: </dt>
              <dd className="inline">
                {contact.lastContactAt ? formatDateTimeSaoPaulo(contact.lastContactAt) : "Nunca houve contato registrado"}
              </dd>
            </div>
          </dl>
        </section>

        <section className="rounded-lg border border-slate-200 bg-white p-4 text-sm">
          <div className="mb-2 flex items-center justify-between">
            <h2 className="font-semibold text-slate-700">Tarefas abertas</h2>
            <Link href={`/tasks/new?contactId=${contact.id}`} className="text-xs text-brand-dark underline hover:no-underline">
              Nova tarefa
            </Link>
          </div>
          {openTasks.length === 0 ? (
            <p className="text-slate-500">Nenhuma tarefa aberta para este lead.</p>
          ) : (
            <ul className="space-y-2 text-slate-600">
              {openTasks.map((task) => (
                <li key={task.id} className="border-b border-slate-100 pb-2 last:border-0">
                  <Link href={`/tasks/${task.id}`} className="font-medium text-brand-dark hover:underline">
                    {task.title}
                  </Link>
                  <p className="text-xs text-slate-500">
                    {TASK_STATUS_LABELS[task.status] ?? task.status} · prioridade{" "}
                    {TASK_PRIORITY_LABELS[task.priority] ?? task.priority} ·{" "}
                    {task.dueAt ? formatDateTimeSaoPaulo(task.dueAt) : "sem prazo"} ·{" "}
                    {task.assignedUser.name}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </section>

        {canViewFinancial && (
          <section className="rounded-lg border border-slate-200 bg-white p-4 text-sm">
            <h2 className="mb-2 font-semibold text-slate-700">Dados financeiros (restrito)</h2>
            {contact.financialInfo ? (
              <dl className="space-y-1 text-slate-600">
                <div>
                  <dt className="inline font-medium">Status de crédito: </dt>
                  <dd className="inline">{contact.financialInfo.creditAnalysisStatus ?? "—"}</dd>
                </div>
              </dl>
            ) : (
              <p className="text-slate-500">Nenhum dado financeiro cadastrado.</p>
            )}
          </section>
        )}

        <section className="rounded-lg border border-slate-200 bg-white p-4 text-sm">
          <h2 className="mb-2 font-semibold text-slate-700">Consentimento LGPD</h2>
          {contact.consents.length === 0 ? (
            <p className="text-slate-500">Nenhum consentimento registrado.</p>
          ) : (
            <ul className="space-y-1 text-slate-600">
              {contact.consents.map((c) => (
                <li key={c.id}>
                  {c.purpose} — {c.granted ? "concedido" : "revogado"} ({c.origin})
                </li>
              ))}
            </ul>
          )}
        </section>
      </aside>
    </div>
  );
}
