/**
 * Limites configuráveis para a importação de CSV (Fase 1.4). Lidos de
 * variáveis de ambiente com valores padrão conservadores — documentados em
 * `.env.example`.
 */
export interface ImportLimits {
  maxFileSizeBytes: number;
  maxRows: number;
  maxFieldLength: number;
  maxColumns: number;
  rowDataRetentionDays: number;
  batchSize: number;
}

function readIntEnv(name: string, fallback: number): number {
  const raw = process.env[name];
  const parsed = raw ? Number(raw) : NaN;
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

export function getImportLimits(): ImportLimits {
  return {
    maxFileSizeBytes: readIntEnv("IMPORT_MAX_FILE_SIZE_BYTES", 5_000_000),
    maxRows: readIntEnv("IMPORT_MAX_ROWS", 5_000),
    maxFieldLength: readIntEnv("IMPORT_MAX_FIELD_LENGTH", 5_000),
    maxColumns: readIntEnv("IMPORT_MAX_COLUMNS", 60),
    rowDataRetentionDays: readIntEnv("IMPORT_ROW_DATA_RETENTION_DAYS", 90),
    batchSize: readIntEnv("IMPORT_BATCH_SIZE", 100),
  };
}
