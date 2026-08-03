import Link from "next/link";
import { prisma } from "@mabres/db";
import { formatBRL } from "@mabres/shared";

export default async function PropertiesPage({
  searchParams,
}: {
  searchParams: { city?: string; neighborhood?: string; propertyType?: string; status?: string };
}) {
  const where = {
    deletedAt: null,
    ...(searchParams.city ? { city: { contains: searchParams.city, mode: "insensitive" as const } } : {}),
    ...(searchParams.neighborhood
      ? { neighborhood: { contains: searchParams.neighborhood, mode: "insensitive" as const } }
      : {}),
    ...(searchParams.propertyType
      ? { propertyType: { contains: searchParams.propertyType, mode: "insensitive" as const } }
      : {}),
    ...(searchParams.status ? { status: searchParams.status } : {}),
  };

  const properties = await prisma.property.findMany({
    where,
    orderBy: { createdAt: "desc" },
    take: 100,
  });

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-lg font-semibold text-slate-800">Imóveis</h1>
          <p className="text-sm text-slate-500">{properties.length} resultado(s)</p>
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
      </form>

      <div className="overflow-hidden rounded-lg border border-slate-200 bg-white">
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
                <td className="px-4 py-2 text-slate-600">{property.status}</td>
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
  );
}
