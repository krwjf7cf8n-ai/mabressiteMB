import { notFound } from "next/navigation";
import Link from "next/link";
import { prisma } from "@mabres/db";
import {
  formatBRL,
  formatDateTimeSaoPaulo,
  PROPERTY_STATUS_LABELS,
  TASK_PRIORITY_LABELS,
  TASK_STATUS_LABELS,
  VISIT_STATUS_LABELS,
} from "@mabres/shared";
import { getCurrentSession } from "@/lib/session";
import { getMatchesForProperty } from "@/lib/matching-service";
import { MatchResultsList, type MatchListItem } from "@/components/match-results-list";
import { RecalculateMatchesButton } from "@/components/recalculate-matches-button";
import { updatePropertyAction, inactivatePropertyAction, recalculateMatchesForPropertyAction } from "../actions";
import { PropertyForm } from "../property-form";

export default async function PropertyDetailPage({
  params,
  searchParams,
}: {
  params: { id: string };
  searchParams: { error?: string };
}) {
  const session = await getCurrentSession();
  const canUpdate = session?.user.permissions.includes("properties:update");
  const canViewMatches = session?.user.permissions.includes("matches:view");
  const canRecalculateMatches = session?.user.permissions.includes("matches:recalculate");

  // G12 — nenhuma das quatro consultas depende do resultado das outras
  // (visitas/tarefas usam params.id, que já é conhecido antes do fetch do
  // imóvel em si; não há checagem de escopo por dono em Property como há em
  // Contact/Visit/Task, então não existe gate de autorização entre elas):
  // todas rodam em paralelo.
  const [property, owners, recentVisits, openTasks] = await Promise.all([
    prisma.property.findUnique({
      where: { id: params.id },
      include: {
        owners: { include: { owner: true } },
        photos: { orderBy: { order: "asc" } },
        priceHistory: { orderBy: { createdAt: "desc" } },
        statusHistory: { orderBy: { createdAt: "desc" } },
      },
    }),
    prisma.owner.findMany({ where: { deletedAt: null }, select: { id: true, name: true } }),
    prisma.visit.findMany({
      where: { propertyId: params.id },
      include: { contact: true, brokerUser: true },
      orderBy: { scheduledAt: "desc" },
      take: 10,
    }),
    prisma.task.findMany({
      where: { propertyId: params.id, status: { notIn: ["CONCLUIDA", "CANCELADA"] } },
      include: { assignedUser: true },
      orderBy: [{ dueAt: "asc" }, { createdAt: "desc" }],
      take: 10,
    }),
  ]);

  if (!property) notFound();

  let matchItems: MatchListItem[] = [];
  let matchSummary: Awaited<ReturnType<typeof getMatchesForProperty>> | null = null;

  if (canViewMatches && property.status === "ativo") {
    matchSummary = await getMatchesForProperty(property.id);
    const contacts = await prisma.contact.findMany({
      where: { id: { in: matchSummary.eligible.map((m) => m.contactId) } },
    });
    const contactById = new Map(contacts.map((c) => [c.id, c]));
    matchItems = matchSummary.eligible
      .map((m) => {
        const contact = contactById.get(m.contactId);
        if (!contact) return null;
        return {
          id: contact.id,
          title: contact.name,
          // Nunca exibir renda/FGTS/valor aprovado aqui — só dado comercial (temperatura, cidade).
          subtitle: `${contact.city ?? "cidade não informada"} · temperatura: ${contact.temperature}`,
          href: `/leads/${contact.id}`,
          result: m.result,
          calculatedAt: m.calculatedAt,
        };
      })
      .filter((x): x is MatchListItem => x !== null);
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-lg font-semibold text-slate-800">
          {property.internalCode} — {property.propertyType}
        </h1>
        <p className="text-sm text-slate-500">
          {property.city} {property.neighborhood ? `— ${property.neighborhood}` : ""} · Status:{" "}
          {PROPERTY_STATUS_LABELS[property.status] ?? property.status}
          {property.externalRef && <> · Ref. e-Móvel: {property.externalRef}</>}
        </p>
      </div>

      {searchParams.error && (
        <div className="rounded-md border border-red-300 bg-red-50 p-3 text-sm text-red-700">
          {searchParams.error}
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2 space-y-6">
          {canUpdate ? (
            <PropertyForm
              action={updatePropertyAction}
              values={{
                id: property.id,
                status: property.status,
                purpose: property.purpose,
                propertyType: property.propertyType,
                externalRef: property.externalRef,
                addressLine: property.addressLine,
                number: property.number,
                complement: property.complement,
                neighborhood: property.neighborhood,
                city: property.city,
                state: property.state,
                zipCode: property.zipCode,
                condoName: property.condoName,
                salePrice: property.salePrice,
                rentPrice: property.rentPrice,
                condoFee: property.condoFee,
                iptu: property.iptu,
                landArea: property.landArea,
                builtArea: property.builtArea,
                bedrooms: property.bedrooms,
                suites: property.suites,
                bathrooms: property.bathrooms,
                coveredParking: property.coveredParking,
                uncoveredParking: property.uncoveredParking,
                furnished: property.furnished,
                hasPool: property.hasPool,
                hasGourmetArea: property.hasGourmetArea,
                hasBackyard: property.hasBackyard,
                acceptsFinancing: property.acceptsFinancing,
                acceptsFgts: property.acceptsFgts,
                acceptsTrade: property.acceptsTrade,
                title: property.title,
                shortDescription: property.shortDescription,
                fullDescription: property.fullDescription,
                legalNotes: property.legalNotes,
                ownerId: property.owners[0]?.ownerId ?? null,
                photoUrls: property.photos.map((p) => p.url),
              }}
              owners={owners}
              submitLabel="Salvar alterações"
            />
          ) : (
            <p className="text-sm text-slate-500">Você não tem permissão para editar imóveis.</p>
          )}

          {canUpdate && property.status !== "inativo" && (
            <section className="rounded-lg border border-amber-200 bg-amber-50 p-4">
              <h2 className="mb-2 text-sm font-semibold text-amber-800">Inativar imóvel</h2>
              <form action={inactivatePropertyAction} className="flex gap-3">
                <input type="hidden" name="id" value={property.id} />
                <input
                  name="reason"
                  required
                  placeholder="Motivo da inativação"
                  className="flex-1 rounded-md border border-amber-300 px-3 py-2 text-sm"
                />
                <button
                  type="submit"
                  className="rounded-md bg-amber-600 px-4 py-2 text-sm font-medium text-white hover:bg-amber-700"
                >
                  Inativar
                </button>
              </form>
            </section>
          )}

          {canViewMatches && (
            <section className="rounded-lg border border-slate-200 bg-white p-4">
              <div className="mb-3 flex items-center justify-between">
                <h2 className="text-sm font-semibold text-slate-700">Clientes compatíveis</h2>
                {canRecalculateMatches && property.status === "ativo" && (
                  <form action={recalculateMatchesForPropertyAction}>
                    <input type="hidden" name="propertyId" value={property.id} />
                    <RecalculateMatchesButton />
                  </form>
                )}
              </div>
              <MatchResultsList
                items={matchItems}
                totalEvaluated={matchSummary?.totalEvaluated ?? 0}
                eliminationReasonTally={matchSummary?.eliminationReasonTally ?? []}
                emptyContext={
                  property.status !== "ativo"
                    ? "Imóvel não está ativo — matching não é calculado para imóveis inativos, vendidos, alugados ou indisponíveis."
                    : "Nenhum cliente com preferências cadastradas ainda."
                }
              />
            </section>
          )}
        </div>

        <aside className="space-y-4">
          <section className="rounded-lg border border-slate-200 bg-white p-4 text-sm">
            <h2 className="mb-2 font-semibold text-slate-700">Proprietário</h2>
            {property.owners.length === 0 ? (
              <p className="text-slate-500">Nenhum proprietário vinculado.</p>
            ) : (
              <ul className="space-y-1 text-slate-600">
                {property.owners.map((po) => (
                  <li key={po.ownerId}>
                    {po.owner.name} ({po.ownershipPercent?.toString() ?? "100"}%)
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section className="rounded-lg border border-slate-200 bg-white p-4 text-sm">
            <h2 className="mb-2 font-semibold text-slate-700">Histórico de preço</h2>
            <ul className="space-y-1 text-slate-600">
              {property.priceHistory.map((h) => (
                <li key={h.id}>
                  {formatDateTimeSaoPaulo(h.createdAt)} — venda {h.salePrice ? formatBRL(h.salePrice.toString()) : "—"}, locação{" "}
                  {h.rentPrice ? formatBRL(h.rentPrice.toString()) : "—"}
                </li>
              ))}
              {property.priceHistory.length === 0 && <li className="text-slate-500">Sem histórico.</li>}
            </ul>
          </section>

          <section className="rounded-lg border border-slate-200 bg-white p-4 text-sm">
            <h2 className="mb-2 font-semibold text-slate-700">Histórico de status</h2>
            <ul className="space-y-1 text-slate-600">
              {property.statusHistory.map((h) => (
                <li key={h.id}>
                  {formatDateTimeSaoPaulo(h.createdAt)} — {h.fromStatus ? (PROPERTY_STATUS_LABELS[h.fromStatus] ?? h.fromStatus) : "—"} →{" "}
                  {PROPERTY_STATUS_LABELS[h.toStatus] ?? h.toStatus}
                  {h.reason && <span className="text-slate-500"> ({h.reason})</span>}
                </li>
              ))}
              {property.statusHistory.length === 0 && <li className="text-slate-500">Sem histórico.</li>}
            </ul>
          </section>

          <section className="rounded-lg border border-slate-200 bg-white p-4 text-sm">
            <h2 className="mb-2 font-semibold text-slate-700">Visitas recentes</h2>
            {recentVisits.length === 0 ? (
              <p className="text-slate-500">Nenhuma visita registrada para este imóvel.</p>
            ) : (
              <ul className="space-y-2 text-slate-600">
                {recentVisits.map((visit) => (
                  <li key={visit.id} className="border-b border-slate-100 pb-2 last:border-0">
                    <Link href={`/visits/${visit.id}`} className="font-medium text-brand-dark hover:underline">
                      {formatDateTimeSaoPaulo(visit.scheduledAt)}
                    </Link>
                    <p className="text-xs text-slate-500">
                      {visit.contact.name} · {visit.brokerUser.name} · {VISIT_STATUS_LABELS[visit.status] ?? visit.status}
                    </p>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section className="rounded-lg border border-slate-200 bg-white p-4 text-sm">
            <h2 className="mb-2 font-semibold text-slate-700">Tarefas abertas</h2>
            {openTasks.length === 0 ? (
              <p className="text-slate-500">Nenhuma tarefa aberta para este imóvel.</p>
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
        </aside>
      </div>
    </div>
  );
}
