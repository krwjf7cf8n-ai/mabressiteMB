/**
 * Normalização de telefone/WhatsApp brasileiro para uso em links `tel:` e
 * `https://wa.me`. Mesmo critério de DDI já usado em `normalizePhoneBR`
 * (dedup.ts): sempre dígitos com DDI 55, sem duplicar o 55 quando o valor
 * já o contém. Além disso valida o tamanho (DDD + 8 ou 9 dígitos) — um
 * valor com poucos dígitos não é um número utilizável, mesmo que
 * `normalizePhoneBR` o aceitasse para fins de comparação de duplicidade.
 */
export function normalizeBrazilianPhoneDigits(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const digits = raw.replace(/\D/g, "");
  if (!digits) return null;

  const withoutCountryCode = digits.startsWith("55") && digits.length > 11 ? digits.slice(2) : digits;

  // DDD (2 dígitos) + número (8 fixo ou 9 celular) = 10 ou 11 dígitos.
  if (withoutCountryCode.length !== 10 && withoutCountryCode.length !== 11) return null;

  return `55${withoutCountryCode}`;
}

/** `tel:+55DDDNNNNNNNNN`, ou `null` se o valor não for um número BR utilizável. */
export function toTelHref(raw: string | null | undefined): string | null {
  const digits = normalizeBrazilianPhoneDigits(raw);
  return digits ? `tel:+${digits}` : null;
}

/** `https://wa.me/55DDDNNNNNNNNN`, ou `null` se o valor não for um número BR utilizável. */
export function toWhatsAppHref(raw: string | null | undefined): string | null {
  const digits = normalizeBrazilianPhoneDigits(raw);
  return digits ? `https://wa.me/${digits}` : null;
}
