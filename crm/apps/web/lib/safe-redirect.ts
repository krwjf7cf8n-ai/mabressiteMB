const DEFAULT_REDIRECT = "/dashboard";

/**
 * G23 — evita open redirect via `callbackUrl`: só aceita um caminho
 * absoluto-relativo genuinamente interno (começa com exatamente uma `/`,
 * não `//`, sem esquema embutido tipo `/\evil.com` ou `javascript:...`).
 * Qualquer outra coisa cai no destino padrão.
 */
export function getSafeCallbackUrl(value: string | null | undefined): string {
  if (!value) return DEFAULT_REDIRECT;
  if (!value.startsWith("/")) return DEFAULT_REDIRECT;
  if (value.startsWith("//")) return DEFAULT_REDIRECT;
  if (value.includes("://")) return DEFAULT_REDIRECT;
  if (value.toLowerCase().includes("\\")) return DEFAULT_REDIRECT;
  return value;
}
