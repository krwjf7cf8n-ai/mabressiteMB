import Link from "next/link";
import { prisma } from "@mabres/db";
import { formatDateTimeSaoPaulo } from "@mabres/shared";
import { getCurrentSession, getVisitScopeWhere } from "@/lib/session";

function startOfDaySaoPaulo(offsetDays = 0): Date {
  const now = new Date();
  const d = new Date(now.getTime() + offsetDays * 24 * 60 * 60_000);
  d.setUTCHours(3, 0, 0, 0); // 00:00 America/Sao_Paulo (UTC-3) aproximado, sem DST hoje em dia
  return d;
}

export default async function VisitsPage({
  searchParams,
}: {
  searchParams: { status?: string; view?: string };
}) {
  const session = await getCurrentSession();
  const scope = await getVisitScopeWhere();

  const todayStart = startOfDaySaoPaulo(0);
  const todayEnd = startOfDaySaoPaulo(1);
  const weekEnd = startOfDaySaoPaulo(7);

  const view = searchParams.view ?? "proximas";

  const where = {
    ...scope,
    ...(searchParams.status ? { status: searchParams.status as never } : {}),
    ...(view === "hoje" ? { scheduledAt: { gte: todayStart, lt: todayEnd } } : {}),
    ...(view === "semana" ? { scheduledAt: { gte: todayStart, lt: weekEnd } } : {}),
    ...(view === "proximas" ? { scheduledAt: { gte: new Date() } } : {}),
  };

  const visits = await prisma.visit.findMany({
    where,
    include: { contact: true, property: true, brokerUser: true },
    orderBy: { scheduledAt: "asc" },
    take: 100,
  });

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-lg font-semibold text-slate-800">Visitas</h1>
          <p className="text-sm text-slate-500">
            {session?.user.permissions.includes("visits:view_all") ? "Toda a equipe" : "Suas visitas"} · {visits.length} resultado(s)
          </p>
        </div>
        <Link href="/visits/new" className="rounded-md bg-brand px-4 py-2 text-sm font-medium text-white hover:bg-brand-dark">
          Agendar visita
        </Link>
      </div>

      <div className="flex gap-2 text-sm">
        {[
          ["hoje", "Hoje"],
          ["semana", "Esta semana"],
          ["proximas", "Próximas"],
          ["", "Todas"],
        ].map(([value, label]) => (
          <Link
            key={value}
            href={`/visits?view=${value}`}
            className={`rounded-md border px-3 py-1.5 ${view === value ? "border-brand bg-brand text-white" : "border-slate-300 text-slate-600 hover:bg-slate-50"}`}
          >
            {label}
          </Link>
        ))}
      </div>

      <div className="overflow-hidden rounded-lg border border-slate-200 bg-white">
        <table className="min-w-full divide-y divide-slate-200 text-sm">
          <thead className="bg-slate-50 text-left text-xs uppercase text-slate-500">
            <tr>
              <th className="px-4 py-2">Data/hora</th>
              <th className="px-4 py-2">Cliente</th>
              <th className="px-4 py-2">Imóvel</th>
              <th className="px-4 py-2">Corretor</th>
              <th className="px-4 py-2">Status</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {visits.map((visit) => (
              <tr key={visit.id} className="hover:bg-slate-50">
                <td className="px-4 py-2">
                  <Link href={`/visits/${visit.id}`} className="font-medium text-brand-dark hover:underline">
                    {formatDateTimeSaoPaulo(visit.scheduledAt)}
                  </Link>
                </td>
                <td className="px-4 py-2 text-slate-600">{visit.contact.name}</td>
                <td className="px-4 py-2 text-slate-600">{visit.property.internalCode}</td>
                <td className="px-4 py-2 text-slate-600">{visit.brokerUser.name}</td>
                <td className="px-4 py-2 text-slate-600">{visit.status}</td>
              </tr>
            ))}
            {visits.length === 0 && (
              <tr>
                <td colSpan={5} className="px-4 py-6 text-center text-slate-500">
                  Nenhuma visita encontrada.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
