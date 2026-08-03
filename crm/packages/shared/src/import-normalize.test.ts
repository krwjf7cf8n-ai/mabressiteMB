import { describe, expect, it } from "vitest";
import {
  normalizeBoolean,
  normalizeDateBR,
  normalizeMoneyBR,
  normalizePhoneToE164BR,
  normalizeProperCase,
  normalizeText,
  normalizeUF,
} from "./import-normalize";

describe("normalizeText", () => {
  it("colapsa espaços múltiplos e remove das pontas", () => {
    expect(normalizeText("  João   da   Silva  ")).toBe("João da Silva");
  });
  it("devolve null para vazio", () => {
    expect(normalizeText("   ")).toBeNull();
    expect(normalizeText(undefined)).toBeNull();
  });
});

describe("normalizeProperCase", () => {
  it("capitaliza palavras mantendo conectores em minúsculo", () => {
    expect(normalizeProperCase("joão da silva de souza")).toBe("João da Silva de Souza");
  });
});

describe("normalizePhoneToE164BR", () => {
  it("normaliza telefone com DDD e 9 dígitos para E.164", () => {
    expect(normalizePhoneToE164BR("(15) 99999-8888")).toBe("+5515999998888");
  });
  it("normaliza telefone já com DDI 55", () => {
    expect(normalizePhoneToE164BR("+55 15 99999-8888")).toBe("+5515999998888");
  });
  it("normaliza telefone fixo (10 dígitos)", () => {
    expect(normalizePhoneToE164BR("15 3222-1234")).toBe("+551532221234");
  });
  it("rejeita telefone incompleto", () => {
    expect(normalizePhoneToE164BR("999")).toBeNull();
  });
});

describe("normalizeUF", () => {
  it("aceita UF válida em qualquer caixa", () => {
    expect(normalizeUF("sp")).toBe("SP");
  });
  it("rejeita UF inexistente", () => {
    expect(normalizeUF("XX")).toBeNull();
  });
});

describe("normalizeMoneyBR", () => {
  it.each([
    ["450.000,00", 450000],
    ["R$ 450.000", 450000],
    ["450000", 450000],
    ["450.50", 450.5],
    ["1.234,56", 1234.56],
    ["R$ 1.234,56", 1234.56],
  ])("normaliza %s para %d", (input, expected) => {
    expect(normalizeMoneyBR(input)).toBeCloseTo(expected, 2);
  });

  it("devolve null para texto sem número", () => {
    expect(normalizeMoneyBR("a combinar")).toBeNull();
  });
});

describe("normalizeDateBR", () => {
  it("aceita formato dd/mm/yyyy e converte para UTC (meia-noite America/Sao_Paulo)", () => {
    const d = normalizeDateBR("10/03/2026");
    expect(d?.toISOString()).toBe("2026-03-10T03:00:00.000Z");
  });

  it("aceita formato yyyy-mm-dd", () => {
    const d = normalizeDateBR("2026-03-10");
    expect(d?.toISOString()).toBe("2026-03-10T03:00:00.000Z");
  });

  it("aceita ISO 8601 completo com timezone explícito", () => {
    const d = normalizeDateBR("2026-03-10T14:00:00Z");
    expect(d?.toISOString()).toBe("2026-03-10T14:00:00.000Z");
  });

  it("devolve null para data inválida", () => {
    expect(normalizeDateBR("32/13/2026")).toBeNull();
    expect(normalizeDateBR("não é uma data")).toBeNull();
  });
});

describe("normalizeBoolean", () => {
  it.each([
    ["sim", true],
    ["Não", false],
    ["1", true],
    ["0", false],
  ])("normaliza %s", (input, expected) => {
    expect(normalizeBoolean(input)).toBe(expected);
  });

  it("devolve null para valor ambíguo", () => {
    expect(normalizeBoolean("talvez")).toBeNull();
  });
});
