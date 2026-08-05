import { ConcurrencyConflictError } from "@mabres/db";
import { LastAdminError, PrivilegeEscalationError, SelfRoleChangeError } from "@mabres/shared";

/**
 * Erros de domínio conhecidos cuja `.message` já é segura e específica o
 * bastante para mostrar direto ao usuário (evita vazar mensagem crua do
 * Prisma/Node em telas de erro de Server Action).
 */
const KNOWN_DOMAIN_ERRORS = [PrivilegeEscalationError, SelfRoleChangeError, LastAdminError, ConcurrencyConflictError] as const;

/**
 * O Next.js sinaliza `redirect()`/`notFound()` lançando um erro especial
 * com um campo `digest` — nunca deve ser tratado como "erro de negócio"
 * por um catch genérico em volta de uma chamada de serviço; precisa ser
 * relançado para o Next completar a navegação.
 */
export function isNextRedirectError(error: unknown): boolean {
  return Boolean(error && typeof error === "object" && "digest" in error);
}

/** Mensagem segura para mostrar ao usuário a partir de um erro capturado numa Server Action. */
export function friendlyErrorMessage(error: unknown, fallback = "Ocorreu um erro inesperado."): string {
  for (const ErrorClass of KNOWN_DOMAIN_ERRORS) {
    if (error instanceof ErrorClass) return error.message;
  }
  if (error instanceof Error) return error.message;
  return fallback;
}
