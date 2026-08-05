import { describe, expect, it } from "vitest";
import { generateTempPassword, hashPassword, verifyPassword } from "./password";
import { passwordPolicySchema } from "./validators";

describe("generateTempPassword", () => {
  it("sempre satisfaz a política de senha (roda várias vezes para pegar o caso raro sem dígito)", () => {
    for (let i = 0; i < 50; i += 1) {
      const password = generateTempPassword();
      expect(() => passwordPolicySchema.parse(password)).not.toThrow();
    }
  });

  it("gera senhas diferentes a cada chamada", () => {
    const a = generateTempPassword();
    const b = generateTempPassword();
    expect(a).not.toBe(b);
  });
});

describe("hashPassword / verifyPassword", () => {
  it("faz round-trip corretamente", async () => {
    const hash = await hashPassword("SenhaForte123");
    expect(await verifyPassword("SenhaForte123", hash)).toBe(true);
    expect(await verifyPassword("SenhaErrada123", hash)).toBe(false);
  });
});
