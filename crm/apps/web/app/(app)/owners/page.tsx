import Link from "next/link";
import { prisma } from "@mabres/db";
import { PhoneLink } from "@/components/ui/phone-link";
import { WhatsAppLink } from "@/components/ui/whatsapp-link";

export default async function OwnersPage() {
  const owners = await prisma.owner.findMany({
    where: { deletedAt: null },
    orderBy: { createdAt: "desc" },
    include: { properties: true },
  });

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-lg font-semibold text-slate-800">Proprietários</h1>
          <p className="text-sm text-slate-500">{owners.length} cadastrados</p>
        </div>
        <Link
          href="/owners/new"
          className="rounded-md bg-brand px-4 py-2 text-sm font-medium text-white hover:bg-brand-dark"
        >
          Novo proprietário
        </Link>
      </div>

      <div className="overflow-hidden rounded-lg border border-slate-200 bg-white">
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-slate-200 text-sm">
            <thead className="bg-slate-50 text-left text-xs uppercase text-slate-500">
              <tr>
                <th className="px-4 py-2">Nome</th>
                <th className="px-4 py-2">Contato</th>
                <th className="px-4 py-2">Autorização de anúncio</th>
                <th className="px-4 py-2">Imóveis vinculados</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {owners.map((owner) => (
                <tr key={owner.id} className="hover:bg-slate-50">
                  <td className="px-4 py-2 font-medium text-slate-700">{owner.name}</td>
                  <td className="px-4 py-2 text-slate-600">
                    {owner.phone ? (
                      <div className="flex flex-wrap items-center gap-x-2">
                        <PhoneLink phone={owner.phone} />
                        <WhatsAppLink phone={owner.phone} className="text-xs text-green-700 hover:underline" />
                      </div>
                    ) : (
                      owner.email || "—"
                    )}
                  </td>
                  <td className="px-4 py-2 text-slate-600">{owner.adAuthorization ? "Sim" : "Não"}</td>
                  <td className="px-4 py-2 text-slate-600">{owner.properties.length}</td>
                </tr>
              ))}
              {owners.length === 0 && (
                <tr>
                  <td colSpan={4} className="px-4 py-6 text-center text-slate-500">
                    Nenhum proprietário cadastrado ainda.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
