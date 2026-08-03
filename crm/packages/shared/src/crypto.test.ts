import { beforeAll, describe, expect, it } from "vitest";
import { decryptSensitiveField, encryptSensitiveField } from "./crypto";

describe("encryptSensitiveField / decryptSensitiveField", () => {
  beforeAll(() => {
    process.env.ENCRYPTION_KEY = "test-only-key-not-for-production";
  });

  it("faz round-trip preservando o valor original", () => {
    const original = "Banco 001, Agência 1234, Conta 56789-0";
    const encrypted = encryptSensitiveField(original);
    expect(encrypted).not.toContain(original);
    expect(decryptSensitiveField(encrypted)).toBe(original);
  });

  it("gera ciphertexts diferentes para a mesma entrada (IV aleatório)", () => {
    const a = encryptSensitiveField("mesmo valor");
    const b = encryptSensitiveField("mesmo valor");
    expect(a).not.toBe(b);
  });

  it("lança erro claro quando ENCRYPTION_KEY não está definida", () => {
    const backup = process.env.ENCRYPTION_KEY;
    delete process.env.ENCRYPTION_KEY;
    expect(() => encryptSensitiveField("x")).toThrow(/ENCRYPTION_KEY/);
    process.env.ENCRYPTION_KEY = backup;
  });
});
