import { createHash } from "node:crypto";
import { Prisma, prisma, recordAudit } from "@mabres/db";
import {
  detectDelimiter,
  findDuplicateMatches,
  getImportLimits,
  looksLikeBinaryContent,
  parseCsv,
  stripBom,
  suggestColumnMapping,
  validateAndNormalizeContactRow,
  type ContactImportLookups,
  type ImportContactMapping,
  type NormalizedContactRow,
} from "@mabres/shared";

const ACCEPTED_MIME_TYPES = new Set(["text/csv", "text/plain", "application/vnd.ms-excel", "application/csv", ""]);

export interface FileValidationError {
  code: string;
  message: string;
}

export interface ParsedUpload {
  headers: string[];
  rows: string[][];
  malformedRowNumbers: number[];
  delimiter: "," | ";";
  hadBom: boolean;
  fileHash: string;
  fileSize: number;
}

/**
 * Validações no nível do arquivo — nunca confia só na extensão. Roda ANTES
 * de qualquer persistência: se falhar aqui, nenhum ImportJob é criado.
 */
export function validateAndParseUpload(
  buffer: Buffer,
  fileName: string,
  declaredMimeType: string,
): { ok: true; parsed: ParsedUpload } | { ok: false; error: FileValidationError } {
  const limits = getImportLimits();

  if (!fileName.toLowerCase().endsWith(".csv")) {
    return { ok: false, error: { code: "extensao_invalida", message: "Envie um arquivo com extensão .csv" } };
  }
  if (!ACCEPTED_MIME_TYPES.has(declaredMimeType)) {
    return { ok: false, error: { code: "mime_invalido", message: `Tipo de arquivo não aceito: ${declaredMimeType || "desconhecido"}` } };
  }
  if (buffer.byteLength === 0) {
    return { ok: false, error: { code: "arquivo_vazio", message: "O arquivo está vazio" } };
  }
  if (buffer.byteLength > limits.maxFileSizeBytes) {
    return {
      ok: false,
      error: { code: "arquivo_grande", message: `Arquivo maior que o limite permitido (${Math.round(limits.maxFileSizeBytes / 1_000_000)}MB)` },
    };
  }

  const fileHash = createHash("sha256").update(buffer).digest("hex");
  const decoded = buffer.toString("utf8");

  if (looksLikeBinaryContent(decoded)) {
    return { ok: false, error: { code: "conteudo_binario", message: "O arquivo não parece ser um CSV de texto válido" } };
  }

  const { text, hadBom } = stripBom(decoded);
  const delimiter = detectDelimiter(text);
  const { headers, rows, malformedRowNumbers } = parseCsv(text, delimiter);

  if (headers.length === 0) {
    return { ok: false, error: { code: "sem_cabecalho", message: "Não foi possível identificar o cabeçalho do arquivo" } };
  }
  if (headers.length > limits.maxColumns) {
    return { ok: false, error: { code: "colunas_excedidas", message: `O arquivo tem mais colunas que o limite permitido (${limits.maxColumns})` } };
  }
  if (rows.length === 0) {
    return { ok: false, error: { code: "sem_linhas", message: "O arquivo não tem nenhuma linha de dados" } };
  }
  if (rows.length > limits.maxRows) {
    return { ok: false, error: { code: "linhas_excedidas", message: `O arquivo tem mais linhas que o limite permitido (${limits.maxRows})` } };
  }
  for (const row of rows) {
    for (const field of row) {
      if (field.length > limits.maxFieldLength) {
        return { ok: false, error: { code: "campo_excedido", message: `Um dos campos excede o tamanho máximo permitido (${limits.maxFieldLength} caracteres)` } };
      }
    }
  }

  return { ok: true, parsed: { headers, rows, malformedRowNumbers, delimiter, hadBom, fileHash, fileSize: buffer.byteLength } };
}

/** Monta os lookups (etapa do funil por nome, corretor por nome/e-mail) usados na validação de linhas. */
export async function buildContactImportLookups(): Promise<ContactImportLookups> {
  const [stages, users] = await Promise.all([
    prisma.pipelineStage.findMany({ where: { isActive: true }, select: { id: true, name: true } }),
    prisma.user.findMany({ where: { deletedAt: null }, select: { id: true, name: true, email: true } }),
  ]);

  const stripAccentsLower = (value: string) =>
    value
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "")
      .toLowerCase()
      .replace(/[^a-z0-9]/g, "");

  const stagesByName = new Map(stages.map((s) => [stripAccentsLower(s.name), s.id]));
  const usersByNameOrEmail = new Map<string, string>();
  for (const u of users) {
    usersByNameOrEmail.set(stripAccentsLower(u.name), u.id);
    usersByNameOrEmail.set(stripAccentsLower(u.email), u.id);
  }

  return { stagesByName, usersByNameOrEmail };
}

export interface RowValidationOutcome {
  rowNumber: number;
  originalData: Record<string, string>;
  normalizedData: NormalizedContactRow | null;
  validationStatus: "VALIDA" | "VALIDA_COM_AVISO" | "INVALIDA";
  validationErrors: Array<{ field: string; rawValue: string | null; message: string }>;
}

/**
 * Valida e normaliza todas as linhas de uma importação com o mapeamento
 * atual — só validação de campo (obrigatoriedade, formato, lookups de etapa/
 * corretor). Detecção de duplicidade roda depois, em `detectDuplicatesForJob`
 * (só faz sentido para linhas já válidas, e é uma etapa própria do fluxo).
 * Não persiste nada — devolve o resultado para o chamador decidir como
 * gravar (criação inicial do job ou revalidação após mudança de mapeamento).
 */
export function validateContactRows(
  headers: string[],
  rows: string[][],
  mapping: ImportContactMapping,
  lookups: ContactImportLookups,
): RowValidationOutcome[] {
  return rows.map((rowValues, index) => {
    const rowNumber = index + 2; // +1 cabeçalho, +1 base-1
    const originalData: Record<string, string> = {};
    headers.forEach((h, i) => {
      originalData[h] = rowValues[i] ?? "";
    });

    const { normalized, errors, warnings } = validateAndNormalizeContactRow(originalData, mapping, lookups);

    if (!normalized || errors.length > 0) {
      return { rowNumber, originalData, normalizedData: null, validationStatus: "INVALIDA", validationErrors: errors };
    }

    return {
      rowNumber,
      originalData,
      normalizedData: normalized,
      validationStatus: warnings.length > 0 ? "VALIDA_COM_AVISO" : "VALIDA",
      validationErrors: warnings,
    };
  });
}

export interface DuplicateDetectionOutcome {
  rowNumber: number;
  duplicateMatch: Array<{ candidateId: string; matchedOn: string[] }>;
}

/**
 * Compara as linhas válidas (VALIDA/VALIDA_COM_AVISO) de um ImportJob contra
 * os contatos já existentes no banco, usando o mesmo mecanismo de
 * duplicidade do cadastro manual (`findDuplicateMatches`). Devolve só as
 * linhas em que alguma duplicidade foi encontrada — o chamador decide como
 * persistir (normalmente: marcar validationStatus = DUPLICADA).
 */
export async function detectDuplicatesForJob(jobId: string): Promise<DuplicateDetectionOutcome[]> {
  const [rows, candidates] = await Promise.all([
    prisma.importRow.findMany({
      where: { importJobId: jobId, validationStatus: { in: ["VALIDA", "VALIDA_COM_AVISO"] } },
      select: { rowNumber: true, normalizedData: true },
    }),
    prisma.contact.findMany({
      where: { deletedAt: null },
      select: { id: true, phone: true, whatsapp: true, email: true, metaLeadId: true },
    }),
  ]);

  const outcomes: DuplicateDetectionOutcome[] = [];
  for (const row of rows) {
    const normalized = row.normalizedData as unknown as NormalizedContactRow | null;
    if (!normalized) continue;
    const duplicates = findDuplicateMatches(
      { phone: normalized.contact.phone, whatsapp: normalized.contact.whatsapp, email: normalized.contact.email },
      candidates,
    );
    if (duplicates.length > 0) {
      outcomes.push({ rowNumber: row.rowNumber, duplicateMatch: duplicates });
    }
  }
  return outcomes;
}

/**
 * `NormalizedContactRow` tem campos `Date` (createdAt/lastContactAt), que não
 * são um `Prisma.InputJsonValue` válido — serializa via JSON (Date vira
 * string ISO) antes de gravar em `ImportRow.normalizedData`. Quem ler de
 * volta do banco recebe strings ISO, não `Date`.
 */
export function serializeNormalizedContactRow(normalized: NormalizedContactRow): Record<string, unknown> {
  return JSON.parse(JSON.stringify(normalized)) as Record<string, unknown>;
}

export function chunk<T>(items: T[], size: number): T[][] {
  const result: T[][] = [];
  for (let i = 0; i < items.length; i += size) {
    result.push(items.slice(i, i + size));
  }
  return result;
}

/** Lê de volta `ImportRow.normalizedData` (Json) — datas voltam como string ISO, reconvertidas para Date. */
export function deserializeNormalizedContactRow(raw: unknown): NormalizedContactRow {
  const data = raw as {
    contact: Record<string, unknown>;
    preference: Record<string, unknown> | null;
    financial: Record<string, unknown> | null;
  };
  return {
    ...data,
    contact: {
      ...data.contact,
      createdAt: data.contact.createdAt ? new Date(data.contact.createdAt as string) : null,
      lastContactAt: data.contact.lastContactAt ? new Date(data.contact.lastContactAt as string) : null,
    },
  } as NormalizedContactRow;
}

/**
 * Ação padrão de uma linha DUPLICADA segundo a estratégia global do job —
 * usada como valor inicial antes de qualquer ajuste manual por linha.
 */
export function defaultDuplicateAction(strategy: "CRIAR_SOMENTE_NOVOS" | "CRIAR_E_COMPLETAR" | "CRIAR_E_ATUALIZAR" | "IGNORAR_DUPLICADOS") {
  if (strategy === "CRIAR_E_COMPLETAR" || strategy === "CRIAR_E_ATUALIZAR") return "ATUALIZAR" as const;
  return "IGNORAR" as const;
}

const NEVER_SILENTLY_UPDATED_FIELDS = new Set(["ownerUserId", "stageId"]);

/**
 * Campos do Contact que uma atualização de importação tocaria, junto com o
 * valor atual e o novo valor — usado tanto para a prévia ("quais campos
 * serão alterados") quanto para montar o update de fato. `ownerUserId` e
 * `stageId` nunca entram aqui: responsável e etapa não são alterados
 * silenciosamente por importação, mesmo com CRIAR_E_ATUALIZAR.
 */
export function computeContactUpdateDiff(
  current: { name: string; phone: string | null; whatsapp: string | null; email: string | null; city: string | null; state: string | null; notes: string | null; campaign: string | null; temperature: string | null },
  incoming: NormalizedContactRow["contact"],
  strategy: "CRIAR_E_COMPLETAR" | "CRIAR_E_ATUALIZAR",
): Array<{ field: string; from: unknown; to: unknown }> {
  const diff: Array<{ field: string; from: unknown; to: unknown }> = [];
  const fields: Array<keyof typeof current> = ["name", "phone", "whatsapp", "email", "city", "state", "notes", "campaign", "temperature"];

  for (const field of fields) {
    if (NEVER_SILENTLY_UPDATED_FIELDS.has(field)) continue;
    const incomingValue = (incoming as Record<string, unknown>)[field];
    if (incomingValue === null || incomingValue === undefined) continue; // nunca apaga por causa de célula vazia
    const currentValue = current[field];
    if (strategy === "CRIAR_E_COMPLETAR" && currentValue) continue; // só completa campos vazios
    if (currentValue === incomingValue) continue;
    diff.push({ field, from: currentValue, to: incomingValue });
  }

  return diff;
}

interface ImportRowRecord {
  id: string;
  rowNumber: number;
  validationStatus: string;
  normalizedData: unknown;
  duplicateMatch: unknown;
  validationErrors: unknown;
}

export type ResolvedRowAction = "CRIAR" | "ATUALIZAR" | "IGNORAR" | "CRIAR_DUPLICADO" | "ERRO";

export interface ExecuteImportOptions {
  strategy: "CRIAR_SOMENTE_NOVOS" | "CRIAR_E_COMPLETAR" | "CRIAR_E_ATUALIZAR" | "IGNORAR_DUPLICADOS";
  /** Ação escolhida manualmente por linha (só se aplica a linhas DUPLICADA); sobrepõe o padrão da estratégia. */
  rowActionOverrides: Map<number, { action: ResolvedRowAction; justification?: string }>;
  actingUserId: string;
  canUpdateExisting: boolean;
  canCreateDuplicate: boolean;
}

function resolveRowAction(row: ImportRowRecord, options: ExecuteImportOptions): ResolvedRowAction {
  if (row.validationStatus === "INVALIDA") return "ERRO";

  if (row.validationStatus === "DUPLICADA") {
    const override = options.rowActionOverrides.get(row.rowNumber);
    const action = override?.action ?? defaultDuplicateAction(options.strategy);
    if (action === "ATUALIZAR" && !options.canUpdateExisting) return "IGNORAR";
    if (action === "CRIAR_DUPLICADO" && !options.canCreateDuplicate) return "IGNORAR";
    return action;
  }

  // VALIDA / VALIDA_COM_AVISO
  return "CRIAR";
}

async function createContactFromImport(tx: Prisma.TransactionClient, incoming: NormalizedContactRow, actingUserId: string) {
  const contact = incoming.contact;
  const created = await tx.contact.create({
    data: {
      name: contact.name,
      phone: contact.phone,
      whatsapp: contact.whatsapp,
      email: contact.email,
      city: contact.city,
      state: contact.state,
      origin: contact.origin,
      campaign: contact.campaign,
      notes: contact.notes,
      temperature: contact.temperature ?? undefined,
      stageId: contact.stageId ?? undefined,
      ownerUserId: contact.ownerUserId ?? actingUserId,
      createdAt: contact.createdAt ?? undefined,
      lastContactAt: contact.lastContactAt ?? undefined,
      preference: incoming.preference
        ? {
            create: {
              propertyType: incoming.preference.propertyType,
              desiredNeighborhoods: incoming.preference.desiredNeighborhoods,
              minPrice: incoming.preference.minPrice,
              maxPrice: incoming.preference.maxPrice,
            },
          }
        : undefined,
      financialInfo: incoming.financial
        ? {
            create: {
              individualIncome: incoming.financial.individualIncome,
              downPaymentAvailable: incoming.financial.downPaymentAvailable,
              fgtsBalanceApprox: incoming.financial.fgtsBalanceApprox,
            },
          }
        : undefined,
    },
  });
  return created;
}

async function updateContactFromImport(
  tx: Prisma.TransactionClient,
  contactId: string,
  incoming: NormalizedContactRow,
  strategy: "CRIAR_E_COMPLETAR" | "CRIAR_E_ATUALIZAR",
) {
  const current = await tx.contact.findUniqueOrThrow({
    where: { id: contactId },
    include: { preference: true, financialInfo: true },
  });

  const diff = computeContactUpdateDiff(current, incoming.contact, strategy);
  const preUpdateSnapshot: Record<string, unknown> = {};
  const updateData: Record<string, unknown> = {};
  for (const { field, from, to } of diff) {
    preUpdateSnapshot[field] = from;
    updateData[field] = to;
  }

  if (Object.keys(updateData).length > 0) {
    await tx.contact.update({ where: { id: contactId }, data: updateData });
  }

  if (incoming.preference) {
    const shouldWrite =
      !current.preference ||
      strategy === "CRIAR_E_ATUALIZAR" ||
      (strategy === "CRIAR_E_COMPLETAR" &&
        (!current.preference.propertyType || current.preference.desiredNeighborhoods.length === 0 || current.preference.minPrice === null || current.preference.maxPrice === null));
    if (shouldWrite) {
      const complete = strategy === "CRIAR_E_COMPLETAR";
      await tx.contactPreference.upsert({
        where: { contactId },
        create: {
          contactId,
          propertyType: incoming.preference.propertyType,
          desiredNeighborhoods: incoming.preference.desiredNeighborhoods,
          minPrice: incoming.preference.minPrice,
          maxPrice: incoming.preference.maxPrice,
        },
        update: {
          propertyType: complete && current.preference?.propertyType ? undefined : (incoming.preference.propertyType ?? undefined),
          desiredNeighborhoods: complete && current.preference && current.preference.desiredNeighborhoods.length > 0 ? undefined : incoming.preference.desiredNeighborhoods,
          minPrice: complete && current.preference?.minPrice != null ? undefined : (incoming.preference.minPrice ?? undefined),
          maxPrice: complete && current.preference?.maxPrice != null ? undefined : (incoming.preference.maxPrice ?? undefined),
        },
      });
    }
  }

  if (incoming.financial) {
    const complete = strategy === "CRIAR_E_COMPLETAR";
    await tx.contactFinancialInfo.upsert({
      where: { contactId },
      create: {
        contactId,
        individualIncome: incoming.financial.individualIncome,
        downPaymentAvailable: incoming.financial.downPaymentAvailable,
        fgtsBalanceApprox: incoming.financial.fgtsBalanceApprox,
      },
      update: {
        individualIncome: complete && current.financialInfo?.individualIncome != null ? undefined : (incoming.financial.individualIncome ?? undefined),
        downPaymentAvailable: complete && current.financialInfo?.downPaymentAvailable != null ? undefined : (incoming.financial.downPaymentAvailable ?? undefined),
        fgtsBalanceApprox: complete && current.financialInfo?.fgtsBalanceApprox != null ? undefined : (incoming.financial.fgtsBalanceApprox ?? undefined),
      },
    });
  }

  return { diff, preUpdateSnapshot };
}

export interface ImportRowOutcome {
  rowId: string;
  outcome: "created" | "updated" | "skipped" | "failed";
}

/** Processa uma única linha (uma transação por linha — nunca uma transação gigante para o job inteiro). */
async function processImportRow(row: ImportRowRecord, action: ResolvedRowAction, jobId: string, options: ExecuteImportOptions): Promise<ImportRowOutcome> {
  if (action === "ERRO") {
    await prisma.importRow.update({ where: { id: row.id }, data: { action: "ERRO" } });
    return { rowId: row.id, outcome: "failed" };
  }

  if (action === "IGNORAR") {
    const duplicateMatch = (row.duplicateMatch as Array<{ candidateId: string }> | null) ?? [];
    await prisma.importRow.update({
      where: { id: row.id },
      data: { action: "IGNORAR", targetEntityId: duplicateMatch[0]?.candidateId ?? null },
    });
    return { rowId: row.id, outcome: "skipped" };
  }

  const incoming = deserializeNormalizedContactRow(row.normalizedData);

  if (action === "CRIAR" || action === "CRIAR_DUPLICADO") {
    const override = options.rowActionOverrides.get(row.rowNumber);
    const notes = [...((row.validationErrors as unknown[] | null) ?? [])];
    if (action === "CRIAR_DUPLICADO" && override?.justification) {
      notes.push({ field: "duplicidade", rawValue: null, message: `Criado mesmo com duplicidade: ${override.justification}` });
    }

    const created = await prisma.$transaction(async (tx) => {
      const contact = await createContactFromImport(tx, incoming, options.actingUserId);
      await tx.importRow.update({
        where: { id: row.id },
        data: {
          action,
          targetEntityId: contact.id,
          validationErrors: notes.length > 0 ? (notes as Prisma.InputJsonValue) : Prisma.JsonNull,
        },
      });
      return contact;
    });

    await recordAudit(prisma, {
      entityType: "Contact",
      entityId: created.id,
      action: action === "CRIAR_DUPLICADO" ? "import_create_duplicate" : "import_create",
      actorUserId: options.actingUserId,
      after: { ...(serializeNormalizedContactRow(incoming).contact as Record<string, unknown>), importJobId: jobId },
    });
    return { rowId: row.id, outcome: "created" as const };
  }

  // ATUALIZAR
  const duplicateMatch = (row.duplicateMatch as Array<{ candidateId: string }> | null) ?? [];
  const distinctCandidates = Array.from(new Set(duplicateMatch.map((d) => d.candidateId)));
  if (distinctCandidates.length !== 1) {
    await prisma.importRow.update({
      where: { id: row.id },
      data: {
        action: "ERRO",
        validationErrors: [
          { field: "duplicidade", rawValue: null, message: "Duplicidade ambígua (mais de um registro correspondente) — requer análise manual" },
        ] as Prisma.InputJsonValue,
      },
    });
    return { rowId: row.id, outcome: "failed" };
  }

  const contactId = distinctCandidates[0]!;
  try {
    const { diff, preUpdateSnapshot } = await prisma.$transaction(async (tx) => {
      const result = await updateContactFromImport(tx, contactId, incoming, options.strategy as "CRIAR_E_COMPLETAR" | "CRIAR_E_ATUALIZAR");
      await tx.importRow.update({
        where: { id: row.id },
        data: { action: "ATUALIZAR", targetEntityId: contactId, preUpdateSnapshot: result.preUpdateSnapshot as Prisma.InputJsonValue },
      });
      return result;
    });

    await recordAudit(prisma, {
      entityType: "Contact",
      entityId: contactId,
      action: "import_update",
      actorUserId: options.actingUserId,
      before: preUpdateSnapshot as Prisma.InputJsonValue,
      after: { ...Object.fromEntries(diff.map((d) => [d.field, d.to])), importJobId: jobId },
    });
    return { rowId: row.id, outcome: "updated" as const };
  } catch {
    await prisma.importRow.update({
      where: { id: row.id },
      data: { action: "ERRO", validationErrors: [{ field: "atualizacao", rawValue: null, message: "Falha ao atualizar o registro existente" }] as Prisma.InputJsonValue },
    });
    return { rowId: row.id, outcome: "failed" };
  }
}

/**
 * Executa um ImportJob em lotes (nunca uma única transação gigante). Cada
 * linha é processada em sua própria transação — uma falha isolada não
 * derruba o lote inteiro. O job deve estar em RASCUNHO; não pode ser
 * reexecutado (idempotência no nível do job).
 */
export async function executeImportJob(jobId: string, options: ExecuteImportOptions): Promise<void> {
  const limits = getImportLimits();

  const rows = await prisma.importRow.findMany({
    where: { importJobId: jobId },
    select: { id: true, rowNumber: true, validationStatus: true, normalizedData: true, duplicateMatch: true, validationErrors: true },
  });

  const batches = chunk(rows, limits.batchSize);
  let created = 0;
  let updated = 0;
  let skipped = 0;
  let failed = 0;

  for (const batch of batches) {
    const results = await Promise.all(batch.map((row) => processImportRow(row, resolveRowAction(row, options), jobId, options)));
    for (const result of results) {
      if (result.outcome === "created") created += 1;
      else if (result.outcome === "updated") updated += 1;
      else if (result.outcome === "skipped") skipped += 1;
      else failed += 1;
    }
  }

  const status = failed > 0 ? (created + updated + skipped > 0 ? "CONCLUIDO_PARCIAL" : "FALHA") : "CONCLUIDO";

  await prisma.importJob.update({
    where: { id: jobId },
    data: {
      status,
      strategy: options.strategy,
      createdRows: created,
      updatedRows: updated,
      skippedRows: skipped,
      failedRows: failed,
      finishedAt: new Date(),
    },
  });
}

export { suggestColumnMapping };
