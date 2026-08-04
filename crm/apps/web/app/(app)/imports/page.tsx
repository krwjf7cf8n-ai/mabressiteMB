import Link from "next/link";
import { prisma } from "@mabres/db";
import { formatDateTimeSaoPaulo } from "@mabres/shared";
import { getCurrentSession } from "@/lib/session";

const STATUS_LABELS: Record<string, string> = {
  RASCUNHO: "Rascunho",
  PROCESSANDO: "Processando",
  CONCLUIDO: "Concluído",
  CONCLUIDO_PARCIAL: "Concluído parcialmente",
  FALHA: "Falha",
  DESFEITO: "Desfeito",
  DESFEITO_PARCIAL: "Desfeito parcialmente",
};

export default async function ImportsPage() {
  const session = await getCurrentSession();
  const canCreate = session?.user.permissions.includes("imports:create");

  const jobs = await prisma.importJob.findMany({
    orderBy: { createdAt: "desc" },
    take: 100,
    include: { importedByUser: { select: { name: true } } },
  });

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-lg font-semibold text-slate-800">Importações</h1>
          <p className="text-sm text-slate-500">Importação de leads e clientes via CSV — {jobs.length} importação(ões)</p>
        </div>
        {canCreate && (
          <Link href="/imports/new" className="rounded-md bg-brand px-4 py-2 text-sm font-medium text-white hover:bg-brand-dark">
            Nova importação
          </Link>
        )}
      </div>

      <div className="overflow-hidden rounded-lg border border-slate-200 bg-white">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-left text-xs uppercase text-slate-500">
              <tr>
                <th className="px-4 py-2">Arquivo</th>
                <th className="px-4 py-2">Status</th>
                <th className="px-4 py-2">Linhas</th>
                <th className="px-4 py-2">Criados</th>
                <th className="px-4 py-2">Atualizados</th>
                <th className="px-4 py-2">Enviado por</th>
                <th className="px-4 py-2">Data</th>
              </tr>
            </thead>
            <tbody>
              {jobs.map((job) => (
                <tr key={job.id} className="border-t border-slate-100 hover:bg-slate-50">
                  <td className="px-4 py-2">
                    <Link href={`/imports/${job.id}`} className="text-brand-dark hover:underline">
                      {job.fileName}
                    </Link>
                  </td>
                  <td className="px-4 py-2">{STATUS_LABELS[job.status] ?? job.status}</td>
                  <td className="px-4 py-2">{job.totalRows}</td>
                  <td className="px-4 py-2">{job.createdRows}</td>
                  <td className="px-4 py-2">{job.updatedRows}</td>
                  <td className="px-4 py-2">{job.importedByUser.name}</td>
                  <td className="px-4 py-2">{formatDateTimeSaoPaulo(job.createdAt)}</td>
                </tr>
              ))}
              {jobs.length === 0 && (
                <tr>
                  <td colSpan={7} className="px-4 py-6 text-center text-slate-500">
                    Nenhuma importação ainda.
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
