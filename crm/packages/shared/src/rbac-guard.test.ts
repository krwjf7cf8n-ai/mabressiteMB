import { describe, expect, it } from "vitest";
import {
  assertKeepsAtLeastOneAdmin,
  assertNoPrivilegeEscalation,
  assertNotSelfRoleChange,
  LastAdminError,
  PrivilegeEscalationError,
  SelfRoleChangeError,
} from "./rbac-guard";

describe("assertNoPrivilegeEscalation", () => {
  it("permite quando o alvo é subconjunto das permissões do ator", () => {
    expect(() => assertNoPrivilegeEscalation(["a", "b", "c"], ["a", "b"])).not.toThrow();
  });

  it("bloqueia quando o alvo tem uma permissão que o ator não possui", () => {
    expect(() => assertNoPrivilegeEscalation(["a", "b"], ["a", "b", "c"])).toThrow(PrivilegeEscalationError);
  });

  it("a mensagem de erro lista exatamente as permissões não autorizadas", () => {
    try {
      assertNoPrivilegeEscalation(["a"], ["a", "b", "c"]);
      throw new Error("deveria ter lançado");
    } catch (error) {
      expect(error).toBeInstanceOf(PrivilegeEscalationError);
      expect((error as Error).message).toContain("b");
      expect((error as Error).message).toContain("c");
    }
  });

  it("permite lista de alvo vazia", () => {
    expect(() => assertNoPrivilegeEscalation([], [])).not.toThrow();
  });
});

describe("assertNotSelfRoleChange", () => {
  it("bloqueia quando o ator tenta alterar o próprio papel", () => {
    expect(() => assertNotSelfRoleChange("user-1", "user-1")).toThrow(SelfRoleChangeError);
  });

  it("permite quando o ator altera o papel de outro usuário", () => {
    expect(() => assertNotSelfRoleChange("user-1", "user-2")).not.toThrow();
  });
});

describe("assertKeepsAtLeastOneAdmin", () => {
  it("bloqueia quando restariam zero administradores ativos", () => {
    expect(() => assertKeepsAtLeastOneAdmin(0, "desativar este usuário")).toThrow(LastAdminError);
  });

  it("permite quando resta ao menos um administrador ativo", () => {
    expect(() => assertKeepsAtLeastOneAdmin(1, "desativar este usuário")).not.toThrow();
    expect(() => assertKeepsAtLeastOneAdmin(2, "desativar este usuário")).not.toThrow();
  });
});
