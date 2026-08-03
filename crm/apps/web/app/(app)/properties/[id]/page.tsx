import { notFound } from "next/navigation";
import { prisma } from "@mabres/db";
import { formatBRL, formatDateTimeSaoPaulo } from "@mabres/shared";
import { getCurrentSession } from "@/lib/session";
import { updatePropertyAction, inactivatePropertyAction } from "../actions";
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

  const property = await prisma.property.findUnique({
    where: { id: params.id },
    include: {
      owners: { include: { owner: true } },
      photos: { orderBy: { order: "asc" } },
      priceHistory: { orderBy: { createdAt: "desc" } },
      statusHistory: { orderBy: { createdAt: "desc" } },
    },
  });

  if (!property) notFound();

  const owners = await prisma.owner.findMany({ where: { deletedAt: null }, select: { id: true, name: true } });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-lg font-semibold text-slate-800">
          {property.internalCode} — {property.propertyType}
        </h1>
        <p className="text-sm text-slate-500">
          {property.city} {property.neighborhood ? `— ${property.neighborhood}` : ""} · Status: {property.status}
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
                  {formatDateTimeSaoPaulo(h.createdAt)} — {h.fromStatus ?? "—"} → {h.toStatus}
                  {h.reason && <span className="text-slate-500"> ({h.reason})</span>}
                </li>
              ))}
              {property.statusHistory.length === 0 && <li className="text-slate-500">Sem histórico.</li>}
            </ul>
          </section>
        </aside>
      </div>
    </div>
  );
}
