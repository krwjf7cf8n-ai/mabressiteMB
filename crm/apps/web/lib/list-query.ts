/**
 * Helpers genéricos para busca + paginação por offset nas listagens do CRM
 * (Leads, Imóveis, Visitas, Tarefas, Usuários administrativos). Mantém a
 * validação de parâmetros de URL num só lugar em vez de repetir em cada
 * página.
 */
export const DEFAULT_PAGE_SIZE = 25;
export const MAX_SEARCH_TERM_LENGTH = 100;

/** Página inválida (negativa, zero, NaN, não-inteira) sempre cai em 1. */
export function parsePageParam(raw: string | undefined): number {
  const n = Number(raw);
  if (!Number.isFinite(n) || !Number.isInteger(n) || n < 1) return 1;
  return n;
}

/** Corta o termo de busca a um tamanho máximo e remove espaços nas pontas. */
export function parseSearchTerm(raw: string | undefined, maxLength = MAX_SEARCH_TERM_LENGTH): string {
  if (!raw) return "";
  return raw.trim().slice(0, maxLength);
}

/** Só os dígitos de um termo — usado para casar telefone/WhatsApp independentemente de formatação. */
export function digitsOnly(raw: string): string {
  return raw.replace(/\D/g, "");
}

/** 00:00 America/Sao_Paulo (UTC-3) aproximado, sem DST hoje em dia — usado nos filtros rápidos "hoje". */
export function startOfDaySaoPaulo(offsetDays = 0): Date {
  const now = new Date();
  const d = new Date(now.getTime() + offsetDays * 24 * 60 * 60_000);
  d.setUTCHours(3, 0, 0, 0);
  return d;
}
