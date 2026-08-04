import Link from "next/link";
import { prisma } from "@mabres/db";
import { formatDateTimeSaoPaulo } from "@mabres/shared";
import { getContactScopeWhere } from "@/lib/session";

export default async function LeadsPage() {
  const scope = await getContactScopeWhere();
  const contacts = await prisma.contact.findMany({
    where: { ...scope, deletedAt: null },
    include: { stage: true, ownerUser: true },
    orderBy: { createdAt: "desc" },
    take: 100,
  });

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-lg font-semibold text-slate-800">Leads &amp; Clientes</h1>
          <p className="text-sm text-slate-500">{contacts.length} registros (últimos 100)</p>
        </div>
        <Link
          href="/leads/new"
          className="rounded-md bg-brand px-4 py-2 text-sm font-medium text-white hover:bg-brand-dark"
        >
          Novo lead
        </Link>
      </div>

      <div className="overflow-hidden rounded-lg border border-slate-200 bg-white">
        <table className="min-w-full divide-y divide-slate-200 text-sm">
          <thead className="bg-slate-50 text-left text-xs uppercase text-slate-500">
            <tr>
              <th className="px-4 py-2">Nome</th>
              <th className="px-4 py-2">Contato</th>
              <th className="px-4 py-2">Origem</th>
              <th className="px-4 py-2">Etapa</th>
              <th className="px-4 py-2">Responsável</th>
              <th className="px-4 py-2">Criado em</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {contacts.map((contact) => (
              <tr key={contact.id} className="hover:bg-slate-50">
                <td className="px-4 py-2">
                  <Link href={`/leads/${contact.id}`} className="font-medium text-brand-dark hover:underline">
                    {contact.name}
                  </Link>
                </td>
                <td className="px-4 py-2 text-slate-600">{contact.phone || contact.email || "—"}</td>
                <td className="px-4 py-2 text-slate-600">{contact.origin}</td>
                <td className="px-4 py-2 text-slate-600">{contact.stage?.name ?? "—"}</td>
                <td className="px-4 py-2 text-slate-600">{contact.ownerUser?.name ?? "—"}</td>
                <td className="px-4 py-2 text-slate-500">{formatDateTimeSaoPaulo(contact.createdAt)}</td>
              </tr>
            ))}
            {contacts.length === 0 && (
              <tr>
                <td colSpan={6} className="px-4 py-6 text-center text-slate-500">
                  Nenhum lead cadastrado ainda.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
