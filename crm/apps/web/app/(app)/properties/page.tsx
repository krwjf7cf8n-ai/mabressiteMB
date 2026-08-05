import Link from "next/link";
import { prisma, PropertyStatus } from "@mabres/db";
import { formatBRL, PROPERTY_STATUS_LABELS } from "@mabres/shared";
import { Pagination } from "@/components/ui/pagination";
import { DEFAULT_PAGE_SIZE, parsePageParam, parseSearchTerm } from "@/lib/list-query";

const PROPERTY_STATUS_VALUES = new Set<string>(Object.values(PropertyStatus));

function parseStatusFilter(status: string | undefined): PropertyStatus | undefined {
  return status && PROPERTY_STATUS_VALUES.has(status) ? (status as PropertyStatus) : undefined;
}

export default async function PropertiesPage({
  searchParams,
}: {
  searchParams: { q?: string; city?: string; neighborhood?: string; propertyType?: string; status?: string; page?: string };
}) {
  const q = parseSearchTerm(searchParams.q);
  const page = parsePageParam(searchParams.page);
  const statusFilter = parseStatusFilter(searchParams.status);

  const where = {
    deletedAt: null,
    ...(searchParams.city ? { city: { contains: searchParams.city, mode: "insensitive" as const } } : {}),
    ...(searchParams.neighborhood
      ? { neighborhood: { contains: searchParams.neighborhood, mode: "insensitive" as const } }
      : {}),
    ...(searchParams.propertyType
      ? { propertyType: { contains: searchParams.propertyType, mode: "insensitive" as const } }
      : {}),
    ...(statusFilter ? { status: statusFilter } : {}),
    ...(q
      ? {
          OR: [
            { internalCode: { contains: q, mode: "insensitive" as const } },
            { addressLine: { contains: q, mode: "insensitive" as const } },
            { neighborhood: { contains: q, mode: "insensitive" as const } },
            { city: { contains: q, mode: "insensitive" as const } },
            { owners: { some: { owner: { name: { contains: q, mode: "insensitive" as const } } } } },
          ],
        }
      : {}),
  };

  const [total, properties] = await Promise.all([
    prisma.property.count({ where }),
    prisma.property.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * DEFAULT_PAGE_SIZE,
      take: DEFAULT_PAGE_SIZE,
    }),
  ]);

  const buildHref = (targetPage: number) => {
    const params = new URLSearchParams();
    if (q) params.set("q", q);
    if (searchParams.city) params.set("city", searchParams.city);
    if (searchParams.neighborhood) params.set("neighborhood", searchParams.neighborhood);
    if (searchParams.propertyType) params.set("propertyType", searchParams.propertyType);
    if (searchParams.status) params.set("status", searchParams.status);
    if (targetPage > 1) params.set("page", String(targetPage));
    const qs = params.toString();
    return qs ? `/properties?${qs}` : "/properties";
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-lg font-semibold text-slate-800">Imóveis</h1>
          <p className="text-sm text-slate-500">{total} resultado(s){q ? ` para "${q}"` : ""}</p>
        </div>
        <Link
          href="/properties/new"
          className="rounded-md bg-brand px-4 py-2 text-sm font-medium text-white hover:bg-brand-dark"
        >
          Novo imóvel
        </Link>
      </div>

      <form className="grid grid-cols-2 gap-3 rounded-lg border border-slate-200 bg-white p-4 sm:grid-cols-4">
        <input
          name="q"
          defaultValue={q}
          placeholder="Código, endereço, bairro, cidade ou proprietário"
          maxLength={100}
          className="col-span-2 rounded-md border border-slate-300 px-3 py-2 text-sm sm:col-span-4"
        />
        <input
          name="city"
          defaultValue={searchParams.city}
          placeholder="Cidade"
          className="rounded-md border border-slate-300 px-3 py-2 text-sm"
        />
        <input
          name="neighborhood"
          defaultValue={searchParams.neighborhood}
          placeholder="Bairro"
          className="rounded-md border border-slate-300 px-3 py-2 text-sm"
        />
        <input
          name="propertyType"
          defaultValue={searchParams.propertyType}
          placeholder="Tipo (ex.: Apartamento)"
          className="rounded-md border border-slate-300 px-3 py-2 text-sm"
        />
        <select
          name="status"
          defaultValue={searchParams.status ?? ""}
          className="rounded-md border border-slate-300 px-3 py-2 text-sm"
        >
          <option value="">Todos os status</option>
          <option value="ativo">Ativo</option>
          <option value="vendido">Vendido</option>
          <option value="alugado">Alugado</option>
          <option value="suspenso">Suspenso</option>
          <option value="indisponivel">Indisponível</option>
          <option value="inativo">Inativo</option>
        </select>
        <button className="col-span-2 rounded-md border border-slate-300 px-3 py-2 text-sm hover:bg-slate-50 sm:col-span-4">
          Filtrar
        </button>
        {(q || searchParams.city || searchParams.neighborhood || searchParams.propertyType || searchParams.status) && (
          <Link href="/properties" className="col-span-2 text-sm text-slate-500 underline hover:text-slate-700 sm:col-span-4">
            Limpar busca e filtros
          </Link>
        )}
      </form>

      <div className="overflow-hidden rounded-lg border border-slate-200 bg-white">
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-slate-200 text-sm">
            <thead className="bg-slate-50 text-left text-xs uppercase text-slate-500">
              <tr>
                <th className="px-4 py-2">Código</th>
                <th className="px-4 py-2">Tipo</th>
                <th className="px-4 py-2">Cidade/Bairro</th>
                <th className="px-4 py-2">Preço</th>
                <th className="px-4 py-2">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {properties.map((property) => (
                <tr key={property.id} className="hover:bg-slate-50">
                  <td className="px-4 py-2">
                    <Link
                      href={`/properties/${property.id}`}
                      className="font-medium text-brand-dark hover:underline"
                    >
                      {property.internalCode}
                    </Link>
                  </td>
                  <td className="px-4 py-2 text-slate-600">{property.propertyType}</td>
                  <td className="px-4 py-2 text-slate-600">
                    {property.city} {property.neighborhood ? `— ${property.neighborhood}` : ""}
                  </td>
                  <td className="px-4 py-2 text-slate-600">
                    {property.salePrice ? formatBRL(property.salePrice.toString()) : "—"}
                  </td>
                  <td className="px-4 py-2 text-slate-600">{PROPERTY_STATUS_LABELS[property.status] ?? property.status}</td>
                </tr>
              ))}
              {properties.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-4 py-6 text-center text-slate-500">
                    Nenhum imóvel encontrado com esses filtros.
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
