import { notFound } from "next/navigation";
import { prisma } from "@mabres/db";
import { formatDateTimeSaoPaulo, IMPORT_CONTACT_FIELDS, type ImportContactMapping } from "@mabres/shared";
import { getCurrentSession } from "@/lib/session";
import { updateMappingAction } from "../actions";

const STATUS_LABELS: Record<string, string> = {
  RASCUNHO: "Rascunho",
  PROCESSANDO: "Processando",
  CONCLUIDO: "Concluído",
  CONCLUIDO_PARCIAL: "Concluído parcialmente",
  FALHA: "Falha",
  DESFEITO: "Desfeito",
  DESFEITO_PARCIAL: "Desfeito parcialmente",
};

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export default async function ImportDetailPage({
  params,
  searchParams,
}: {
  params: { id: string };
  searchParams: { error?: string; warning?: string; mappingConflict?: string };
}) {
  const session = await getCurrentSession();
  const job = await prisma.importJob.findUnique({
    where: { id: params.id },
    include: {
      importedByUser: { select: { name: true } },
      rows: { orderBy: { rowNumber: "asc" }, take: 10 },
    },
  });

  if (!job) notFound();

  const canViewSensitive = session?.user.permissions.includes("imports:view_sensitive_data");
  const canMap = session?.user.permissions.includes("imports:create") && job.status === "RASCUNHO";

  const headers = Object.keys((job.rows[0]?.originalData as Record<string, string>) ?? {});
  const mapping = (job.mapping as ImportContactMapping | null) ?? {};

  const [invalidRows, statusCounts] = await Promise.all([
    prisma.importRow.findMany({
      where: { importJobId: job.id, validationStatus: "INVALIDA" },
      orderBy: { rowNumber: "asc" },
      take: 50,
    }),
    prisma.importRow.groupBy({
      by: ["validationStatus"],
      where: { importJobId: job.id },
      _count: { _all: true },
    }),
  ]);

  const countsByStatus = Object.fromEntries(statusCounts.map((s) => [s.validationStatus, s._count._all]));
  const malformedRowNumbers = ((job.errorSummary as { malformedRowNumbers?: number[] } | null)?.malformedRowNumbers ?? []) as number[];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-lg font-semibold text-slate-800">{job.fileName}</h1>
        <p className="text-sm text-slate-500">
          {STATUS_LABELS[job.status] ?? job.status} · enviado por {job.importedByUser.name} em {formatDateTimeSaoPaulo(job.createdAt)}
        </p>
      </div>

      {searchParams.error && (
        <div className="rounded-md border border-red-300 bg-red-50 p-3 text-sm text-red-700">{searchParams.error}</div>
      )}
      {searchParams.warning && (
        <div className="rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-800">{searchParams.warning}</div>
      )}
      {searchParams.mappingConflict && (
        <div className="rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-800">
          Duas colunas de origem apontam para o mesmo campo de destino: {searchParams.mappingConflict}. Ajuste o mapeamento ou
          envie novamente com &ldquo;Confirmar mesmo se duas colunas apontarem para o mesmo campo&rdquo; marcado.
        </div>
      )}

      <section className="grid gap-3 rounded-lg border border-slate-200 bg-white p-4 text-sm sm:grid-cols-4">
        <div>
          <dt className="text-slate-500">Tamanho</dt>
          <dd className="font-medium text-slate-700">{formatBytes(job.fileSize)}</dd>
        </div>
        <div>
          <dt className="text-slate-500">Linhas</dt>
          <dd className="font-medium text-slate-700">{job.totalRows}</dd>
        </div>
        <div>
          <dt className="text-slate-500">Delimitador</dt>
          <dd className="font-medium text-slate-700">{job.delimiter === ";" ? "ponto e vírgula" : "vírgula"}</dd>
        </div>
        <div>
          <dt className="text-slate-500">Codificação</dt>
          <dd className="font-medium text-slate-700">UTF-8{job.hadBom ? " (com BOM)" : ""}</dd>
        </div>
      </section>

      {malformedRowNumbers.length > 0 && (
        <div className="rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-800">
          {malformedRowNumbers.length} linha(s) com número de colunas diferente do cabeçalho: linhas {malformedRowNumbers.slice(0, 20).join(", ")}
          {malformedRowNumbers.length > 20 ? "…" : ""}. Os campos ausentes foram tratados como vazios.
        </div>
      )}

      <section className="rounded-lg border border-slate-200 bg-white p-4">
        <h2 className="mb-3 text-sm font-semibold text-slate-700">Resumo da validação</h2>
        <div className="flex flex-wrap gap-4 text-sm">
          <span className="rounded-full bg-green-50 px-3 py-1 text-green-700">Válidas: {countsByStatus.VALIDA ?? 0}</span>
          <span className="rounded-full bg-amber-50 px-3 py-1 text-amber-700">Válidas com aviso: {countsByStatus.VALIDA_COM_AVISO ?? 0}</span>
          <span className="rounded-full bg-red-50 px-3 py-1 text-red-700">Inválidas: {countsByStatus.INVALIDA ?? 0}</span>
          <span className="rounded-full bg-blue-50 px-3 py-1 text-blue-700">Duplicadas: {countsByStatus.DUPLICADA ?? 0}</span>
        </div>
      </section>

      <section className="rounded-lg border border-slate-200 bg-white p-4">
        <h2 className="mb-3 text-sm font-semibold text-slate-700">Mapeamento de colunas</h2>
        {!canMap && <p className="mb-3 text-xs text-slate-500">Mapeamento só pode ser ajustado enquanto a importação está em rascunho.</p>}
        <form action={updateMappingAction} className="space-y-3">
          <input type="hidden" name="jobId" value={job.id} />
          <div className="grid gap-2 sm:grid-cols-2">
            {headers.map((header) => (
              <div key={header} className="flex items-center gap-2">
                <span className="w-1/2 truncate text-sm text-slate-600" title={header}>
                  {header}
                </span>
                <select
                  name={`map__${header}`}
                  defaultValue={mapping[header] ?? "IGNORAR"}
                  disabled={!canMap}
                  className="w-1/2 rounded-md border border-slate-300 px-2 py-1 text-sm disabled:bg-slate-50"
                >
                  <option value="IGNORAR">Ignorar coluna</option>
                  {IMPORT_CONTACT_FIELDS.map((field) => (
                    <option key={field.key} value={field.key}>
                      {field.label}
                      {field.required ? " (obrigatório)" : ""}
                      {field.sensitive ? " 🔒" : ""}
                    </option>
                  ))}
                </select>
              </div>
            ))}
          </div>
          {canMap && (
            <div className="flex items-center gap-3">
              <button type="submit" className="rounded-md bg-brand px-4 py-2 text-sm font-medium text-white hover:bg-brand-dark">
                Revalidar com este mapeamento
              </button>
              <label className="flex items-center gap-2 text-xs text-slate-500">
                <input type="checkbox" name="confirmed" value="true" /> Confirmar mesmo se duas colunas apontarem para o mesmo campo
              </label>
            </div>
          )}
        </form>
      </section>

      <section className="rounded-lg border border-slate-200 bg-white p-4">
        <h2 className="mb-3 text-sm font-semibold text-slate-700">Pré-visualização (primeiras {job.rows.length} linhas)</h2>
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead className="bg-slate-50 text-left uppercase text-slate-500">
              <tr>
                <th className="px-2 py-1">Linha</th>
                {headers.map((h) => (
                  <th key={h} className="px-2 py-1">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {job.rows.map((row) => {
                const data = row.originalData as Record<string, string>;
                return (
                  <tr key={row.id} className="border-t border-slate-100">
                    <td className="px-2 py-1 text-slate-400">{row.rowNumber}</td>
                    {headers.map((h) => {
                      const field = IMPORT_CONTACT_FIELDS.find((f) => f.key === mapping[h]);
                      const isSensitive = field?.sensitive && !canViewSensitive;
                      return (
                        <td key={h} className="px-2 py-1 text-slate-600">
                          {isSensitive ? "•••••" : data[h]}
                        </td>
                      );
                    })}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>

      {invalidRows.length > 0 && (
        <section className="rounded-lg border border-slate-200 bg-white p-4">
          <h2 className="mb-3 text-sm font-semibold text-slate-700">
            Linhas inválidas ({countsByStatus.INVALIDA ?? 0}{(countsByStatus.INVALIDA ?? 0) > 50 ? ", mostrando as 50 primeiras" : ""})
          </h2>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead className="bg-slate-50 text-left uppercase text-slate-500">
                <tr>
                  <th className="px-2 py-1">Linha</th>
                  <th className="px-2 py-1">Campo</th>
                  <th className="px-2 py-1">Valor recebido</th>
                  <th className="px-2 py-1">Erro</th>
                </tr>
              </thead>
              <tbody>
                {invalidRows.flatMap((row) => {
                  const errors = (row.validationErrors as Array<{ field: string; rawValue: string | null; message: string }> | null) ?? [];
                  return errors.map((err, i) => (
                    <tr key={`${row.id}-${i}`} className="border-t border-slate-100">
                      <td className="px-2 py-1 text-slate-400">{row.rowNumber}</td>
                      <td className="px-2 py-1 text-slate-600">{err.field}</td>
                      <td className="px-2 py-1 text-slate-600">{err.rawValue ?? "—"}</td>
                      <td className="px-2 py-1 text-red-700">{err.message}</td>
                    </tr>
                  ));
                })}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </div>
  );
}
