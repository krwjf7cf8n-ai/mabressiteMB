import { describe, expect, it } from "vitest";
import { PERMISSIONS, resolveRolePermissions } from "./permissions";

describe("RBAC — separação de privilégios entre papéis", () => {
  const adminOnlyKeys = [
    "users:manage",
    "roles:manage",
    "settings:manage",
    "integrations:manage",
    "audit:view",
  ] as const;

  it("Administrador possui todas as permissões do catálogo", () => {
    const perms = resolveRolePermissions("Administrador");
    expect(perms).toHaveLength(PERMISSIONS.length);
    for (const key of adminOnlyKeys) {
      expect(perms).toContain(key);
    }
  });

  it.each(["Gestor", "Corretor", "Assistente"] as const)(
    "%s não possui nenhuma permissão administrativa restrita",
    (role) => {
      const perms = resolveRolePermissions(role);
      for (const key of adminOnlyKeys) {
        expect(perms).not.toContain(key);
      }
    },
  );

  it("Corretor não pode excluir nem exportar contatos, nem gerenciar comissões/contratos", () => {
    const perms = resolveRolePermissions("Corretor");
    expect(perms).not.toContain("contacts:delete");
    expect(perms).not.toContain("contacts:export");
    expect(perms).not.toContain("commissions:manage");
    expect(perms).not.toContain("contracts:manage");
  });

  it("Assistente não acessa dados financeiros do cliente", () => {
    const perms = resolveRolePermissions("Assistente");
    expect(perms).not.toContain("contacts:view_financial");
    expect(perms).not.toContain("contacts:update_financial");
  });

  it("toda chave retornada existe no catálogo oficial de permissões", () => {
    const validKeys = new Set(PERMISSIONS.map((p) => p.key));
    for (const role of ["Administrador", "Gestor", "Corretor", "Assistente"] as const) {
      for (const key of resolveRolePermissions(role)) {
        expect(validKeys.has(key)).toBe(true);
      }
    }
  });
});
