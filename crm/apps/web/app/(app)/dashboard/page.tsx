import { prisma } from "@mabres/db";
import { formatDateTimeSaoPaulo } from "@mabres/shared";
import { getCurrentSession, getTaskScopeWhere, getVisitScopeWhere } from "@/lib/session";

function daysAgo(days: number): Date {
  const date = new Date();
  date.setDate(date.getDate() - days);
  date.setHours(0, 0, 0, 0);
  return date;
}

function daysAhead(days: number): Date {
  const date = new Date();
  date.setDate(date.getDate() + days);
  date.setHours(0, 0, 0, 0);
  return date;
}

const ACTIVE_VISIT_STATUSES = ["AGUARDANDO_CONFIRMACAO", "CONFIRMADA", "REAGENDADA"] as const;
const OPEN_TASK_STATUSES = ["PENDENTE", "EM_ANDAMENTO"] as const;

async function getDashboardCounts() {
  const now = new Date();
  const startOfToday = daysAgo(0);
  const startOfTomorrow = daysAhead(1);
  const in7Days = daysAhead(7);
  const since30d = daysAgo(30);

  const visitScope = await getVisitScopeWhere();
  const taskScope = await getTaskScopeWhere();

  const [
    leadsToday,
    leads7d,
    leads30d,
    leads90d,
    leadsSemAtendimento,
    tarefasVencidas,
    tarefasHoje,
    tarefasProximosDias,
    visitasAgendadas,
    visitasHoje,
    visitasAguardandoConfirmacao,
    visitasRealizadas30d,
    visitasCanceladas30d,
    visitasNaoCompareceu30d,
    proximasVisitas,
  ] = await Promise.all([
    prisma.contact.count({ where: { createdAt: { gte: startOfToday }, deletedAt: null } }),
    prisma.contact.count({ where: { createdAt: { gte: daysAgo(7) }, deletedAt: null } }),
    prisma.contact.count({ where: { createdAt: { gte: daysAgo(30) }, deletedAt: null } }),
    prisma.contact.count({ where: { createdAt: { gte: daysAgo(90) }, deletedAt: null } }),
    prisma.contact.count({ where: { firstContactAt: null, deletedAt: null } }),
    prisma.task.count({ where: { ...taskScope, dueAt: { lt: now }, status: { in: [...OPEN_TASK_STATUSES] } } }),
    prisma.task.count({
      where: { ...taskScope, dueAt: { gte: startOfToday, lt: startOfTomorrow }, status: { in: [...OPEN_TASK_STATUSES] } },
    }),
    prisma.task.count({
      where: { ...taskScope, dueAt: { gte: startOfTomorrow, lt: in7Days }, status: { in: [...OPEN_TASK_STATUSES] } },
    }),
    prisma.visit.count({ where: { ...visitScope, scheduledAt: { gte: now }, status: { in: [...ACTIVE_VISIT_STATUSES] } } }),
    prisma.visit.count({
      where: { ...visitScope, scheduledAt: { gte: startOfToday, lt: startOfTomorrow }, status: { in: [...ACTIVE_VISIT_STATUSES] } },
    }),
    prisma.visit.count({ where: { ...visitScope, status: "AGUARDANDO_CONFIRMACAO" } }),
    prisma.visit.count({ where: { ...visitScope, status: "REALIZADA", updatedAt: { gte: since30d } } }),
    prisma.visit.count({
      where: { ...visitScope, status: { in: ["CANCELADA_CLIENTE", "CANCELADA_CORRETOR"] }, updatedAt: { gte: since30d } },
    }),
    prisma.visit.count({ where: { ...visitScope, status: "CLIENTE_NAO_COMPARECEU", updatedAt: { gte: since30d } } }),
    prisma.visit.findMany({
      where: { ...visitScope, scheduledAt: { gte: now }, status: { in: [...ACTIVE_VISIT_STATUSES] } },
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
    tarefasHoje,
    tarefasProximosDias,
    visitasAgendadas,
    visitasHoje,
    visitasAguardandoConfirmacao,
    visitasRealizadas30d,
    visitasCanceladas30d,
    visitasNaoCompareceu30d,
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
  const session = await getCurrentSession();
  const counts = await getDashboardCounts();
  const teamScope = session?.user.permissions.includes("visits:view_all") || session?.user.permissions.includes("tasks:view_all");

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-lg font-semibold text-slate-800">Dashboard</h1>
        <p className="text-sm text-slate-500">
          Visão geral do funil e das atividades {teamScope ? "(toda a equipe)" : "(suas atividades)"}.
        </p>
      </div>

      <section>
        <h2 className="mb-3 text-sm font-semibold text-slate-700">Leads</h2>
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">
          <StatCard label="Leads hoje" value={counts.leadsToday} />
          <StatCard label="Últimos 7 dias" value={counts.leads7d} />
          <StatCard label="Últimos 30 dias" value={counts.leads30d} />
          <StatCard label="Últimos 90 dias" value={counts.leads90d} />
          <StatCard label="Sem primeiro atendimento" value={counts.leadsSemAtendimento} />
        </div>
      </section>

      <section>
        <h2 className="mb-3 text-sm font-semibold text-slate-700">Tarefas</h2>
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
          <StatCard label="Tarefas vencidas" value={counts.tarefasVencidas} />
          <StatCard label="Tarefas para hoje" value={counts.tarefasHoje} />
          <StatCard label="Próximos 7 dias" value={counts.tarefasProximosDias} />
        </div>
      </section>

      <section>
        <h2 className="mb-3 text-sm font-semibold text-slate-700">Visitas</h2>
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-6">
          <StatCard label="Visitas hoje" value={counts.visitasHoje} />
          <StatCard label="Próximas visitas" value={counts.visitasAgendadas} />
          <StatCard label="Aguardando confirmação" value={counts.visitasAguardandoConfirmacao} />
          <StatCard label="Realizadas (30 dias)" value={counts.visitasRealizadas30d} />
          <StatCard label="Cancelamentos (30 dias)" value={counts.visitasCanceladas30d} />
          <StatCard label="Não comparecimentos (30 dias)" value={counts.visitasNaoCompareceu30d} />
        </div>
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
