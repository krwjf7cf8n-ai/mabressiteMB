/**
 * Normalização de valores vindos de CSV, aplicada antes da validação.
 * Cada função é pura e tolerante a entradas vazias/inválidas — devolve
 * `null` quando não consegue normalizar, deixando a validação decidir se
 * isso é um erro (campo obrigatório) ou só ausência de dado opcional.
 *
 * `normalizeEmail` não é redefinida aqui — reaproveita a de `./dedup`
 * (mesma regra: trim + minúsculo), para não ter duas implementações da
 * mesma normalização no pacote.
 */

export function normalizeText(raw: string | null | undefined): string | null {
  if (raw === null || raw === undefined) return null;
  const trimmed = raw.replace(/\s+/g, " ").trim();
  return trimmed || null;
}

/** Capitaliza cada palavra — usado para nome, cidade — preservando conectores comuns em minúsculo. */
const LOWERCASE_CONNECTORS = new Set(["de", "da", "do", "das", "dos", "e"]);
export function normalizeProperCase(raw: string | null | undefined): string | null {
  const text = normalizeText(raw);
  if (!text) return null;
  return text
    .toLowerCase()
    .split(" ")
    .map((word, index) => (index > 0 && LOWERCASE_CONNECTORS.has(word) ? word : word.charAt(0).toUpperCase() + word.slice(1)))
    .join(" ");
}

/** Telefone/WhatsApp brasileiro para armazenamento — formato E.164 (+55DDDNNNNNNNNN). */
export function normalizePhoneToE164BR(raw: string | null | undefined): string | null {
  const text = normalizeText(raw);
  if (!text) return null;
  const digits = text.replace(/\D/g, "");
  if (!digits) return null;
  const withoutCountry = digits.startsWith("55") && digits.length > 11 ? digits.slice(2) : digits;
  if (withoutCountry.length !== 10 && withoutCountry.length !== 11) return null;
  return `+55${withoutCountry}`;
}

const UF_SET = new Set([
  "AC", "AL", "AP", "AM", "BA", "CE", "DF", "ES", "GO", "MA", "MT", "MS", "MG",
  "PA", "PB", "PR", "PE", "PI", "RJ", "RN", "RS", "RO", "RR", "SC", "SP", "SE", "TO",
]);
export function normalizeUF(raw: string | null | undefined): string | null {
  const text = normalizeText(raw);
  if (!text) return null;
  const uf = text.toUpperCase();
  return UF_SET.has(uf) ? uf : null;
}

/**
 * Aceita formatos brasileiros comuns: "450.000,00", "R$ 450.000", "450000",
 * "450000.50" (formato US, caso a planilha já venha assim). Devolve number
 * ou null se não for possível interpretar com confiança.
 */
export function normalizeMoneyBR(raw: string | null | undefined): number | null {
  const text = normalizeText(raw);
  if (!text) return null;
  const cleaned = text.replace(/R\$\s?/gi, "").trim();
  if (!/[0-9]/.test(cleaned)) return null;

  const hasComma = cleaned.includes(",");
  const hasDot = cleaned.includes(".");

  let normalized: string;
  if (hasComma && hasDot) {
    // formato BR: ponto = milhar, vírgula = decimal
    normalized = cleaned.replace(/\./g, "").replace(",", ".");
  } else if (hasComma) {
    // só vírgula: assume decimal BR
    normalized = cleaned.replace(",", ".");
  } else if (hasDot) {
    // só ponto: ambíguo entre milhar (450.000) e decimal (450.50) — decide pelo nº de dígitos após o ponto
    const [, decimals] = cleaned.split(".");
    normalized = decimals && decimals.length === 3 ? cleaned.replace(/\./g, "") : cleaned;
  } else {
    normalized = cleaned;
  }

  const value = Number(normalized.replace(/[^\d.-]/g, ""));
  return Number.isFinite(value) ? value : null;
}

/**
 * Aceita dd/mm/yyyy, dd-mm-yyyy, yyyy-mm-dd, ISO 8601 completo. Datas sem
 * horário são interpretadas como meia-noite em America/Sao_Paulo e
 * convertidas para UTC — nunca com aritmética de fuso local ingênua.
 */
export function normalizeDateBR(raw: string | null | undefined): Date | null {
  const text = normalizeText(raw);
  if (!text) return null;

  const isoWithTime = /^\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}(:\d{2})?(\.\d+)?(Z|[+-]\d{2}:?\d{2})?$/;
  const isoDateOnly = /^\d{4}-\d{2}-\d{2}$/;
  const brDateOnly = /^(\d{2})[/-](\d{2})[/-](\d{4})$/;

  if (isoWithTime.test(text)) {
    const hasOffset = /Z|[+-]\d{2}:?\d{2}$/.test(text);
    const d = new Date(hasOffset ? text.replace(" ", "T") : `${text.replace(" ", "T")}-03:00`);
    return Number.isNaN(d.getTime()) ? null : d;
  }

  if (isoDateOnly.test(text)) {
    const d = new Date(`${text}T00:00:00-03:00`);
    return Number.isNaN(d.getTime()) ? null : d;
  }

  const brMatch = text.match(brDateOnly);
  if (brMatch) {
    const [, dd, mm, yyyy] = brMatch;
    const d = new Date(`${yyyy}-${mm}-${dd}T00:00:00-03:00`);
    return Number.isNaN(d.getTime()) ? null : d;
  }

  return null;
}

const TRUTHY = new Set(["sim", "s", "true", "1", "yes", "y", "verdadeiro"]);
const FALSY = new Set(["nao", "não", "n", "false", "0", "no", "falso"]);
export function normalizeBoolean(raw: string | null | undefined): boolean | null {
  const text = normalizeText(raw)?.toLowerCase();
  if (!text) return null;
  if (TRUTHY.has(text)) return true;
  if (FALSY.has(text)) return false;
  return null;
}
