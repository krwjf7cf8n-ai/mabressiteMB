import Link from "next/link";
import { prisma } from "@mabres/db";
import { CONTACT_ORIGIN_LABELS, formatDateTimeSaoPaulo } from "@mabres/shared";
import { getContactScopeWhere } from "@/lib/session";
import { PhoneLink } from "@/components/ui/phone-link";
import { WhatsAppLink } from "@/components/ui/whatsapp-link";
import { Pagination } from "@/components/ui/pagination";
import { DEFAULT_PAGE_SIZE, digitsOnly, parsePageParam, parseSearchTerm } from "@/lib/list-query";

// G30 — mesma ideia de "filtro rápido" já usada em /tasks e /visits (view=),
// para o dashboard poder linkar direto para a lista já filtrada. Usa o mesmo
// cálculo de "N dias atrás" que o dashboard (dashboard/page.tsx) usa para as
// contagens, para o número clicado bater com o que a lista mostra.
function daysAgo(days: number): Date {
  const date = new Date();
  date.setDate(date.getDate() - days);
  date.setHours(0, 0, 0, 0);
  return date;
}

const LEADS_VIEW_SINCE_DAYS: Record<string, number> = { hoje: 0, "7d": 7, "30d": 30, "90d": 90 };

export default async function LeadsPage({ searchParams }: { searchParams: { q?: string; page?: string; view?: string } }) {
  const q = parseSearchTerm(searchParams.q);
  const page = parsePageParam(searchParams.page);
  const view = searchParams.view ?? "";

  const scope = await getContactScopeWhere();
  const qDigits = digitsOnly(q);

  const where = {
    ...scope,
    deletedAt: null,
    ...(view in LEADS_VIEW_SINCE_DAYS ? { createdAt: { gte: daysAgo(LEADS_VIEW_SINCE_DAYS[view]!) } } : {}),
    ...(view === "sem-atendimento" ? { firstContactAt: null } : {}),
    ...(q
      ? {
          OR: [
            { name: { contains: q, mode: "insensitive" as const } },
            { email: { contains: q, mode: "insensitive" as const } },
            { phone: { contains: q } },
            { whatsapp: { contains: q } },
            ...(qDigits ? [{ phone: { contains: qDigits } }, { whatsapp: { contains: qDigits } }] : []),
          ],
        }
      : {}),
  };

  const [total, contacts] = await Promise.all([
    prisma.contact.count({ where }),
    prisma.contact.findMany({
      where,
      include: { stage: true, ownerUser: true },
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * DEFAULT_PAGE_SIZE,
      take: DEFAULT_PAGE_SIZE,
    }),
  ]);

  const buildHref = (targetPage: number) => {
    const params = new URLSearchParams();
    if (q) params.set("q", q);
    if (view) params.set("view", view);
    if (targetPage > 1) params.set("page", String(targetPage));
    const qs = params.toString();
    return qs ? `/leads?${qs}` : "/leads";
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-lg font-semibold text-slate-800">Leads &amp; Clientes</h1>
          <p className="text-sm text-slate-500">{total} registro(s){q ? ` para "${q}"` : ""}</p>
        </div>
        <Link
          href="/leads/new"
          className="rounded-md bg-brand px-4 py-2 text-sm font-medium text-white hover:bg-brand-dark"
        >
          Novo lead
        </Link>
      </div>

      <form className="flex flex-wrap items-center gap-3 rounded-lg border border-slate-200 bg-white p-4" action="/leads">
        <input
          type="search"
          name="q"
          defaultValue={q}
          placeholder="Nome, telefone, WhatsApp ou e-mail"
          maxLength={100}
          className="min-w-0 flex-1 rounded-md border border-slate-300 px-3 py-2 text-sm"
        />
        <button type="submit" className="rounded-md border border-slate-300 px-3 py-2 text-sm hover:bg-slate-50">
          Buscar
        </button>
        {q && (
          <Link href="/leads" className="text-sm text-slate-500 underline hover:text-slate-700">
            Limpar busca
          </Link>
        )}
      </form>

      <div className="overflow-hidden rounded-lg border border-slate-200 bg-white">
        <div className="overflow-x-auto">
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
                  <td className="px-4 py-2 text-slate-600">
                    {contact.phone ? (
                      <div className="flex flex-wrap items-center gap-x-2">
                        <PhoneLink phone={contact.phone} />
                        <WhatsAppLink phone={contact.whatsapp ?? contact.phone} className="text-xs text-green-700 hover:underline" />
                      </div>
                    ) : (
                      contact.email || "—"
                    )}
                  </td>
                  <td className="px-4 py-2 text-slate-600">{CONTACT_ORIGIN_LABELS[contact.origin] ?? contact.origin}</td>
                  <td className="px-4 py-2 text-slate-600">{contact.stage?.name ?? "—"}</td>
                  <td className="px-4 py-2 text-slate-600">{contact.ownerUser?.name ?? "—"}</td>
                  <td className="px-4 py-2 text-slate-500">{formatDateTimeSaoPaulo(contact.createdAt)}</td>
                </tr>
              ))}
              {contacts.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-4 py-6 text-center text-slate-500">
                    {q ? `Nenhum lead encontrado para "${q}".` : "Nenhum lead cadastrado ainda."}
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
