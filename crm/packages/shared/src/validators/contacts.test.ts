import { describe, expect, it } from "vitest";
import { contactCreateSchema } from "./contacts";

describe("contactCreateSchema — normalização de e-mail (G19)", () => {
  it("normaliza o e-mail para minúsculas ao validar", () => {
    const parsed = contactCreateSchema.parse({ name: "Cliente Teste", email: "  Fulano@Exemplo.COM " });
    expect(parsed.email).toBe("fulano@exemplo.com");
  });

  it("mantém e-mail já em minúsculas sem alteração", () => {
    const parsed = contactCreateSchema.parse({ name: "Cliente Teste", email: "ja.minusculo@example.com" });
    expect(parsed.email).toBe("ja.minusculo@example.com");
  });

  it("continua aceitando ausência de e-mail (null/undefined/vazio)", () => {
    expect(contactCreateSchema.parse({ name: "Cliente Teste", email: null }).email).toBeNull();
    expect(contactCreateSchema.parse({ name: "Cliente Teste" }).email).toBeUndefined();
    expect(contactCreateSchema.parse({ name: "Cliente Teste", email: "" }).email).toBe("");
  });

  it("continua rejeitando e-mail com formato inválido", () => {
    expect(() => contactCreateSchema.parse({ name: "Cliente Teste", email: "não-é-email" })).toThrow();
  });
});
