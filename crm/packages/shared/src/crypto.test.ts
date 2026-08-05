import { createCipheriv, randomBytes, scryptSync } from "node:crypto";
import { beforeAll, describe, expect, it } from "vitest";
import { decryptSensitiveField, encryptSensitiveField } from "./crypto";

const VALID_KEY = "test-only-key-not-for-production"; // 32 caracteres — no limite mínimo

/** Recria o formato legado (pré-G2): scrypt com salt fixo, sem prefixo de versão. */
function encryptLegacy(plainText: string, secret: string): string {
  const key = scryptSync(secret, "mabres-crm-salt", 32);
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const encrypted = Buffer.concat([cipher.update(plainText, "utf8"), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return [iv.toString("base64"), authTag.toString("base64"), encrypted.toString("base64")].join(".");
}

describe("encryptSensitiveField / decryptSensitiveField", () => {
  beforeAll(() => {
    process.env.ENCRYPTION_KEY = VALID_KEY;
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

  it("lança erro claro quando ENCRYPTION_KEY é mais curta que o mínimo (chave fraca)", () => {
    const backup = process.env.ENCRYPTION_KEY;
    process.env.ENCRYPTION_KEY = "curta-demais";
    expect(() => encryptSensitiveField("x")).toThrow(/mínimo/);
    expect(() => decryptSensitiveField("v1.a.b.c")).toThrow(/mínimo/);
    process.env.ENCRYPTION_KEY = backup;
  });

  it("lança erro claro quando ENCRYPTION_KEY é uma string vazia (chave inválida)", () => {
    const backup = process.env.ENCRYPTION_KEY;
    process.env.ENCRYPTION_KEY = "";
    expect(() => encryptSensitiveField("x")).toThrow(/ENCRYPTION_KEY/);
    process.env.ENCRYPTION_KEY = backup;
  });

  it("grava no formato versionado v1.iv.tag.data", () => {
    const encrypted = encryptSensitiveField("valor qualquer");
    const parts = encrypted.split(".");
    expect(parts).toHaveLength(4);
    expect(parts[0]).toBe("v1");
  });

  it("mantém compatibilidade de leitura com ciphertexts gravados no formato legado (pré-G2, sem versão)", () => {
    const original = "dado gravado antes da migração para HKDF";
    const legacyCiphertext = encryptLegacy(original, VALID_KEY);
    expect(legacyCiphertext.split(".")).toHaveLength(3);
    expect(decryptSensitiveField(legacyCiphertext)).toBe(original);
  });

  it("rejeita ciphertext adulterado (tag de autenticação não bate) — nunca retorna dado incorreto silenciosamente", () => {
    const encrypted = encryptSensitiveField("valor original");
    const [version, iv, tag, data] = encrypted.split(".");
    const tampered = [version, iv, tag, `${(data ?? "").slice(0, -4)}AAAA`].join(".");
    expect(() => decryptSensitiveField(tampered)).toThrow();
  });

  it("rejeita ciphertext com formato desconhecido (nem 3 nem 4 partes, ou versão não reconhecida)", () => {
    expect(() => decryptSensitiveField("apenas-uma-parte")).toThrow(/formato/i);
    // "v2" (versão ainda não existente) não é reconhecida — só v1/legado são
    // aceitos hoje. Correto falhar alto em vez de tentar decriptar com uma
    // chave/derivação errada.
    expect(() => decryptSensitiveField("v2.a.b.c")).toThrow(/formato/i);
  });
});
