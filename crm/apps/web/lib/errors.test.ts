import { describe, expect, it } from "vitest";
import { ConcurrencyConflictError } from "@mabres/db";
import { LastAdminError, PrivilegeEscalationError, SelfRoleChangeError } from "@mabres/shared";
import { friendlyErrorMessage, isNextRedirectError } from "./errors";

describe("isNextRedirectError", () => {
  it("reconhece um erro com campo digest (assinatura do redirect()/notFound() do Next.js)", () => {
    expect(isNextRedirectError({ digest: "NEXT_REDIRECT;push;/dashboard;307;" })).toBe(true);
  });

  it("retorna false para erros comuns e valores não-erro", () => {
    expect(isNextRedirectError(new Error("qualquer coisa"))).toBe(false);
    expect(isNextRedirectError(null)).toBe(false);
    expect(isNextRedirectError(undefined)).toBe(false);
    expect(isNextRedirectError("string")).toBe(false);
    expect(isNextRedirectError({})).toBe(false);
  });
});

describe("friendlyErrorMessage", () => {
  it("usa a mensagem de erros de domínio conhecidos", () => {
    expect(friendlyErrorMessage(new PrivilegeEscalationError(["users:create"]))).toContain("users:create");
    expect(friendlyErrorMessage(new SelfRoleChangeError())).toBe("Você não pode alterar o próprio papel.");
    expect(friendlyErrorMessage(new LastAdminError("desativar este usuário"))).toContain("desativar este usuário");
    expect(friendlyErrorMessage(new ConcurrencyConflictError("Este registro"))).toContain("Este registro");
  });

  it("cai para a mensagem de um Error genérico", () => {
    expect(friendlyErrorMessage(new Error("falha qualquer"))).toBe("falha qualquer");
  });

  it("cai para a mensagem padrão quando não é um Error", () => {
    expect(friendlyErrorMessage("string qualquer")).toBe("Ocorreu um erro inesperado.");
    expect(friendlyErrorMessage(null)).toBe("Ocorreu um erro inesperado.");
    expect(friendlyErrorMessage(undefined)).toBe("Ocorreu um erro inesperado.");
    expect(friendlyErrorMessage({ code: "P2002" })).toBe("Ocorreu um erro inesperado.");
  });

  it("aceita uma mensagem de fallback customizada", () => {
    expect(friendlyErrorMessage("string qualquer", "Não foi possível trocar a senha.")).toBe(
      "Não foi possível trocar a senha.",
    );
    expect(friendlyErrorMessage(new Error("erro real"), "fallback customizado")).toBe("erro real");
  });
});
