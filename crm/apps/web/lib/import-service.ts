import { createHash } from "node:crypto";
import { prisma } from "@mabres/db";
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

export { suggestColumnMapping };
