"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { Prisma, prisma, recordAudit } from "@mabres/db";
import {
  findMappingConflicts,
  suggestColumnMapping,
  type ImportContactFieldKey,
  type ImportContactMapping,
} from "@mabres/shared";
import { requirePermission } from "@/lib/session";
import {
  buildContactImportLookups,
  serializeNormalizedContactRow,
  validateAndParseUpload,
  validateContactRows,
} from "@/lib/import-service";

function countByStatus(outcomes: Array<{ validationStatus: string }>, status: string) {
  return outcomes.filter((o) => o.validationStatus === status).length;
}

export async function uploadImportFileAction(formData: FormData) {
  const session = await requirePermission("imports:create");

  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) {
    redirect(`/imports/new?error=${encodeURIComponent("Selecione um arquivo CSV")}`);
  }

  const buffer = Buffer.from(await file.arrayBuffer());
  const result = validateAndParseUpload(buffer, file.name, file.type);
  if (!result.ok) {
    redirect(`/imports/new?error=${encodeURIComponent(result.error.message)}`);
  }

  const { parsed } = result;

  const existingSameHash = await prisma.importJob.findFirst({
    where: { fileHash: parsed.fileHash, status: { in: ["CONCLUIDO", "CONCLUIDO_PARCIAL", "PROCESSANDO"] } },
    orderBy: { createdAt: "desc" },
    select: { id: true, createdAt: true },
  });

  const lookups = await buildContactImportLookups();
  const mapping = suggestColumnMapping(parsed.headers);
  const outcomes = validateContactRows(parsed.headers, parsed.rows, mapping, lookups);

  const job = await prisma.importJob.create({
    data: {
      type: "CONTACTS",
      fileName: file.name,
      fileHash: parsed.fileHash,
      fileSize: parsed.fileSize,
      delimiter: parsed.delimiter,
      hadBom: parsed.hadBom,
      importedByUserId: session.user.id,
      status: "RASCUNHO",
      mapping: mapping as Prisma.InputJsonValue,
      totalRows: outcomes.length,
      validRows: countByStatus(outcomes, "VALIDA") + countByStatus(outcomes, "VALIDA_COM_AVISO"),
      invalidRows: countByStatus(outcomes, "INVALIDA"),
      errorSummary: (parsed.malformedRowNumbers.length > 0
        ? { malformedRowNumbers: parsed.malformedRowNumbers }
        : Prisma.JsonNull) as Prisma.InputJsonValue,
      rows: {
        create: outcomes.map((o) => ({
          rowNumber: o.rowNumber,
          originalData: o.originalData as Prisma.InputJsonValue,
          normalizedData: o.normalizedData ? (serializeNormalizedContactRow(o.normalizedData) as Prisma.InputJsonValue) : Prisma.JsonNull,
          validationStatus: o.validationStatus,
          validationErrors: (o.validationErrors.length > 0 ? o.validationErrors : Prisma.JsonNull) as Prisma.InputJsonValue,
        })),
      },
    },
  });

  await recordAudit(prisma, {
    entityType: "ImportJob",
    entityId: job.id,
    action: "upload",
    actorUserId: session.user.id,
    after: {
      fileName: file.name,
      fileHash: parsed.fileHash,
      fileSize: parsed.fileSize,
      totalRows: outcomes.length,
      delimiter: parsed.delimiter,
      hadBom: parsed.hadBom,
      malformedRows: parsed.malformedRowNumbers,
    },
  });

  revalidatePath("/imports");

  if (existingSameHash) {
    redirect(
      `/imports/${job.id}?warning=${encodeURIComponent(
        `Este mesmo arquivo já foi importado antes (importação de ${existingSameHash.createdAt.toLocaleString("pt-BR")}). Confira antes de prosseguir para não duplicar.`,
      )}`,
    );
  }

  redirect(`/imports/${job.id}`);
}

export async function updateMappingAction(formData: FormData) {
  const session = await requirePermission("imports:create");
  const jobId = String(formData.get("jobId") ?? "");

  const job = await prisma.importJob.findUniqueOrThrow({
    where: { id: jobId },
    include: { rows: { orderBy: { rowNumber: "asc" } } },
  });

  if (job.status !== "RASCUNHO") {
    redirect(`/imports/${jobId}?error=${encodeURIComponent("Esta importação não está mais em rascunho e não pode ser remapeada.")}`);
  }

  const headers = Object.keys((job.rows[0]?.originalData as Record<string, string>) ?? {});
  const mapping: ImportContactMapping = {};
  for (const header of headers) {
    const target = formData.get(`map__${header}`);
    if (typeof target === "string" && target !== "" && target !== "IGNORAR") {
      mapping[header] = target as ImportContactFieldKey;
    }
  }

  const conflicts = findMappingConflicts(mapping);
  const confirmed = formData.get("confirmed") === "true";
  if (conflicts.length > 0 && !confirmed) {
    const summary = conflicts.map((c) => `"${c.target}" recebeu as colunas: ${c.sourceColumns.join(", ")}`).join("; ");
    redirect(`/imports/${jobId}?mappingConflict=${encodeURIComponent(summary)}`);
  }

  const lookups = await buildContactImportLookups();
  const rowsValues = job.rows.map((r) => headers.map((h) => (r.originalData as Record<string, string>)[h] ?? ""));
  const outcomes = validateContactRows(headers, rowsValues, mapping, lookups);

  await prisma.$transaction(async (tx) => {
    for (const outcome of outcomes) {
      await tx.importRow.update({
        where: { importJobId_rowNumber: { importJobId: jobId, rowNumber: outcome.rowNumber } },
        data: {
          normalizedData: outcome.normalizedData
            ? (serializeNormalizedContactRow(outcome.normalizedData) as Prisma.InputJsonValue)
            : Prisma.JsonNull,
          validationStatus: outcome.validationStatus,
          validationErrors: (outcome.validationErrors.length > 0 ? outcome.validationErrors : Prisma.JsonNull) as Prisma.InputJsonValue,
          duplicateMatch: Prisma.JsonNull,
        },
      });
    }

    await tx.importJob.update({
      where: { id: jobId },
      data: {
        mapping: mapping as Prisma.InputJsonValue,
        validRows: countByStatus(outcomes, "VALIDA") + countByStatus(outcomes, "VALIDA_COM_AVISO"),
        invalidRows: countByStatus(outcomes, "INVALIDA"),
      },
    });
  });

  await recordAudit(prisma, {
    entityType: "ImportJob",
    entityId: jobId,
    action: "remap",
    actorUserId: session.user.id,
    after: { mapping },
  });

  revalidatePath(`/imports/${jobId}`);
  redirect(`/imports/${jobId}`);
}
