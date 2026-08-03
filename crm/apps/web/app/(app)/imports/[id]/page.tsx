import { notFound } from "next/navigation";
import { prisma } from "@mabres/db";
import { formatDateTimeSaoPaulo, IMPORT_CONTACT_FIELDS, type ImportContactMapping } from "@mabres/shared";
import { getCurrentSession } from "@/lib/session";
import { computeContactUpdateDiff, deserializeNormalizedContactRow } from "@/lib/import-service";
import { detectDuplicatesAction, executeImportAction, updateMappingAction } from "../actions";

const STRATEGY_LABELS: Record<string, string> = {
  CRIAR_SOMENTE_NOVOS: "Criar somente novos (ignora duplicados)",
  CRIAR_E_COMPLETAR: "Criar novos e completar existentes (nunca sobrescreve campo preenchido)",
  CRIAR_E_ATUALIZAR: "Criar novos e atualizar existentes (sobrescreve com os dados do CSV)",
  IGNORAR_DUPLICADOS: "Ignorar duplicados (só cria os novos)",
};

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
  const canExecute = session?.user.permissions.includes("imports:execute") && job.status === "RASCUNHO";
  const canUpdateExisting = session?.user.permissions.includes("imports:update_existing") ?? false;
  const canCreateDuplicate = session?.user.permissions.includes("imports:create_duplicate") ?? false;

  const headers = Object.keys((job.rows[0]?.originalData as Record<string, string>) ?? {});
  const mapping = (job.mapping as ImportContactMapping | null) ?? {};

  const [invalidRows, duplicateRows, statusCounts] = await Promise.all([
    prisma.importRow.findMany({
      where: { importJobId: job.id, validationStatus: "INVALIDA" },
      orderBy: { rowNumber: "asc" },
      take: 50,
    }),
    prisma.importRow.findMany({
      where: { importJobId: job.id, validationStatus: "DUPLICADA" },
      orderBy: { rowNumber: "asc" },
      take: 100,
    }),
    prisma.importRow.groupBy({
      by: ["validationStatus"],
      where: { importJobId: job.id },
      _count: { _all: true },
    }),
  ]);

  const candidateIds = Array.from(
    new Set(duplicateRows.flatMap((r) => ((r.duplicateMatch as Array<{ candidateId: string }> | null) ?? []).map((m) => m.candidateId))),
  );
  const candidates = candidateIds.length
    ? await prisma.contact.findMany({
        where: { id: { in: candidateIds } },
        select: { id: true, name: true, phone: true, whatsapp: true, email: true, city: true, state: true, notes: true, campaign: true, temperature: true },
      })
    : [];
  const candidatesById = new Map(candidates.map((c) => [c.id, c]));

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
        {job.status === "RASCUNHO" && session?.user.permissions.includes("imports:create") && (
          <form action={detectDuplicatesAction} className="mt-3">
            <input type="hidden" name="jobId" value={job.id} />
            <button type="submit" className="rounded-md border border-slate-300 px-3 py-1.5 text-sm hover:bg-slate-50">
              {countsByStatus.DUPLICADA ? "Detectar duplicidades novamente" : "Detectar duplicidades"}
            </button>
          </form>
        )}
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

      {duplicateRows.length > 0 && job.status === "RASCUNHO" && (
        <section className="rounded-lg border border-slate-200 bg-white p-4">
          <h2 className="mb-3 text-sm font-semibold text-slate-700">
            Duplicidades encontradas ({countsByStatus.DUPLICADA ?? 0}{(countsByStatus.DUPLICADA ?? 0) > 100 ? ", mostrando as 100 primeiras" : ""})
          </h2>
          <p className="mb-3 text-xs text-slate-500">
            Detectado por telefone, WhatsApp, e-mail ou ID da Meta — nomes iguais sozinhos não contam como duplicidade.
          </p>
          <form action={executeImportAction} className="space-y-4">
            <input type="hidden" name="jobId" value={job.id} />

            <div>
              <label className="mb-1 block text-sm font-medium text-slate-700">Estratégia de importação</label>
              <select name="strategy" defaultValue="CRIAR_SOMENTE_NOVOS" className="w-full max-w-md rounded-md border border-slate-300 px-3 py-2 text-sm">
                {Object.entries(STRATEGY_LABELS)
                  .filter(([key]) => canUpdateExisting || (key !== "CRIAR_E_COMPLETAR" && key !== "CRIAR_E_ATUALIZAR"))
                  .map(([key, label]) => (
                    <option key={key} value={key}>
                      {label}
                    </option>
                  ))}
              </select>
              {!canUpdateExisting && (
                <p className="mt-1 text-xs text-slate-500">
                  Você não tem permissão para usar uma estratégia que atualiza registros existentes ({"imports:update_existing"}).
                </p>
              )}
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead className="bg-slate-50 text-left uppercase text-slate-500">
                  <tr>
                    <th className="px-2 py-1">Linha</th>
                    <th className="px-2 py-1">Nome (CSV)</th>
                    <th className="px-2 py-1">Corresponde a</th>
                    <th className="px-2 py-1">Campo(s)</th>
                    {canUpdateExisting && <th className="px-2 py-1">Se atualizar, mudaria</th>}
                    <th className="px-2 py-1">Ação para esta linha</th>
                  </tr>
                </thead>
                <tbody>
                  {duplicateRows.map((row) => {
                    const matches = (row.duplicateMatch as Array<{ candidateId: string; matchedOn: string[] }> | null) ?? [];
                    const normalized = row.normalizedData as { contact?: { name?: string } } | null;
                    const ambiguous = new Set(matches.map((m) => m.candidateId)).size > 1;
                    const singleCandidate = !ambiguous ? candidatesById.get(matches[0]?.candidateId ?? "") : undefined;
                    const diff =
                      canUpdateExisting && singleCandidate && row.normalizedData
                        ? computeContactUpdateDiff(singleCandidate, deserializeNormalizedContactRow(row.normalizedData).contact, "CRIAR_E_ATUALIZAR")
                        : [];
                    return (
                      <tr key={row.id} className="border-t border-slate-100 align-top">
                        <td className="px-2 py-1 text-slate-400">{row.rowNumber}</td>
                        <td className="px-2 py-1 text-slate-600">{normalized?.contact?.name ?? "—"}</td>
                        <td className="px-2 py-1 text-slate-600">
                          {ambiguous ? (
                            <span className="text-amber-700">múltiplos registros — requer análise manual</span>
                          ) : (
                            matches.slice(0, 1).map((m) => {
                              const candidate = candidatesById.get(m.candidateId);
                              return candidate ? `${candidate.name} (${candidate.phone ?? candidate.email ?? "—"})` : m.candidateId;
                            })
                          )}
                        </td>
                        <td className="px-2 py-1 text-slate-600">{matches[0]?.matchedOn.join(", ") ?? "—"}</td>
                        {canUpdateExisting && (
                          <td className="px-2 py-1 text-slate-600">
                            {diff.length === 0
                              ? "nada"
                              : diff.map((d) => (
                                  <div key={d.field}>
                                    {d.field}: {String(d.from ?? "—")} → {String(d.to)}
                                  </div>
                                ))}
                          </td>
                        )}
                        <td className="px-2 py-1">
                          {ambiguous ? (
                            <span className="text-slate-400">deixada pendente</span>
                          ) : (
                            <div className="flex flex-col gap-1">
                              <select name={`rowAction__${row.rowNumber}`} defaultValue="" className="rounded-md border border-slate-300 px-2 py-1 text-xs">
                                <option value="">Usar padrão da estratégia</option>
                                <option value="IGNORAR">Ignorar</option>
                                {canUpdateExisting && <option value="ATUALIZAR">Atualizar registro existente</option>}
                                {canCreateDuplicate && <option value="CRIAR_DUPLICADO">Criar mesmo assim (duplicado)</option>}
                              </select>
                              {canCreateDuplicate && (
                                <input
                                  name={`justification__${row.rowNumber}`}
                                  placeholder="Justificativa (obrigatória p/ criar duplicado)"
                                  className="rounded-md border border-slate-300 px-2 py-1 text-xs"
                                />
                              )}
                            </div>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {canExecute && (
              <button type="submit" className="rounded-md bg-brand px-4 py-2 text-sm font-medium text-white hover:bg-brand-dark">
                Executar importação
              </button>
            )}
          </form>
        </section>
      )}

      {job.status === "RASCUNHO" && countsByStatus.DUPLICADA === undefined && canExecute && (
        <section className="rounded-lg border border-slate-200 bg-white p-4">
          <h2 className="mb-3 text-sm font-semibold text-slate-700">Executar importação</h2>
          <p className="mb-3 text-xs text-slate-500">Nenhuma duplicidade detectada ainda para esta importação (ou nenhuma encontrada).</p>
          <form action={executeImportAction} className="space-y-3">
            <input type="hidden" name="jobId" value={job.id} />
            <select name="strategy" defaultValue="CRIAR_SOMENTE_NOVOS" className="w-full max-w-md rounded-md border border-slate-300 px-3 py-2 text-sm">
              {Object.entries(STRATEGY_LABELS)
                .filter(([key]) => canUpdateExisting || (key !== "CRIAR_E_COMPLETAR" && key !== "CRIAR_E_ATUALIZAR"))
                .map(([key, label]) => (
                  <option key={key} value={key}>
                    {label}
                  </option>
                ))}
            </select>
            <button type="submit" className="rounded-md bg-brand px-4 py-2 text-sm font-medium text-white hover:bg-brand-dark">
              Executar importação
            </button>
          </form>
        </section>
      )}

      {job.status !== "RASCUNHO" && (
        <section className="rounded-lg border border-slate-200 bg-white p-4">
          <h2 className="mb-3 text-sm font-semibold text-slate-700">Resultado da execução</h2>
          <div className="flex flex-wrap gap-4 text-sm">
            <span className="rounded-full bg-green-50 px-3 py-1 text-green-700">Criados: {job.createdRows}</span>
            <span className="rounded-full bg-blue-50 px-3 py-1 text-blue-700">Atualizados: {job.updatedRows}</span>
            <span className="rounded-full bg-slate-100 px-3 py-1 text-slate-700">Ignorados: {job.skippedRows}</span>
            <span className="rounded-full bg-red-50 px-3 py-1 text-red-700">Falhas: {job.failedRows}</span>
          </div>
          {job.finishedAt && <p className="mt-2 text-xs text-slate-500">Concluído em {formatDateTimeSaoPaulo(job.finishedAt)}</p>}
        </section>
      )}
    </div>
  );
}
