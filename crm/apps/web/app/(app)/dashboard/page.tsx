import { prisma } from "@mabres/db";
import { formatDateTimeSaoPaulo } from "@mabres/shared";

function daysAgo(days: number): Date {
  const date = new Date();
  date.setDate(date.getDate() - days);
  date.setHours(0, 0, 0, 0);
  return date;
}

async function getDashboardCounts() {
  const now = new Date();
  const startOfToday = daysAgo(0);

  const [
    leadsToday,
    leads7d,
    leads30d,
    leads90d,
    leadsSemAtendimento,
    tarefasVencidas,
    visitasAgendadas,
    proximasVisitas,
  ] = await Promise.all([
    prisma.contact.count({ where: { createdAt: { gte: startOfToday }, deletedAt: null } }),
    prisma.contact.count({ where: { createdAt: { gte: daysAgo(7) }, deletedAt: null } }),
    prisma.contact.count({ where: { createdAt: { gte: daysAgo(30) }, deletedAt: null } }),
    prisma.contact.count({ where: { createdAt: { gte: daysAgo(90) }, deletedAt: null } }),
    prisma.contact.count({ where: { firstContactAt: null, deletedAt: null } }),
    prisma.task.count({
      where: { dueAt: { lt: now }, status: { in: ["PENDENTE", "EM_ANDAMENTO"] } },
    }),
    prisma.visit.count({
      where: {
        scheduledAt: { gte: now },
        status: { in: ["AGUARDANDO_CONFIRMACAO", "CONFIRMADA", "REAGENDADA"] },
      },
    }),
    prisma.visit.findMany({
      where: {
        scheduledAt: { gte: now },
        status: { in: ["AGUARDANDO_CONFIRMACAO", "CONFIRMADA", "REAGENDADA"] },
      },
      orderBy: { scheduledAt: "asc" },
      take: 5,
      include: { contact: true, property: true },
    }),
  ]);

  return {
    leadsToday,
    leads7d,
    leads30d,
    leads90d,
    leadsSemAtendimento,
    tarefasVencidas,
    visitasAgendadas,
    proximasVisitas,
  };
}

function StatCard({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
      <p className="text-sm text-slate-500">{label}</p>
      <p className="mt-1 text-2xl font-semibold text-brand-dark">{value}</p>
    </div>
  );
}

export default async function DashboardPage() {
  const counts = await getDashboardCounts();

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-lg font-semibold text-slate-800">Dashboard</h1>
        <p className="text-sm text-slate-500">Visão geral do funil e das atividades.</p>
      </div>

      <section className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">
        <StatCard label="Leads hoje" value={counts.leadsToday} />
        <StatCard label="Últimos 7 dias" value={counts.leads7d} />
        <StatCard label="Últimos 30 dias" value={counts.leads30d} />
        <StatCard label="Últimos 90 dias" value={counts.leads90d} />
        <StatCard label="Sem primeiro atendimento" value={counts.leadsSemAtendimento} />
        <StatCard label="Tarefas vencidas" value={counts.tarefasVencidas} />
        <StatCard label="Visitas agendadas" value={counts.visitasAgendadas} />
      </section>

      <section>
        <h2 className="mb-3 text-sm font-semibold text-slate-700">Próximas visitas</h2>
        {counts.proximasVisitas.length === 0 ? (
          <p className="text-sm text-slate-500">Nenhuma visita agendada.</p>
        ) : (
          <ul className="divide-y divide-slate-200 rounded-lg border border-slate-200 bg-white">
            {counts.proximasVisitas.map((visit) => (
              <li key={visit.id} className="flex justify-between px-4 py-3 text-sm">
                <span>
                  {visit.contact.name} — {visit.property.internalCode}
                </span>
                <span className="text-slate-500">{formatDateTimeSaoPaulo(visit.scheduledAt)}</span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
