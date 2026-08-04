import { describe, expect, it } from "vitest";
import { findDuplicateMatches, findDuplicateOwnerMatches, normalizeDocument, normalizeEmail, normalizePhoneBR } from "./dedup";

describe("normalizePhoneBR", () => {
  it("normaliza números com e sem DDI 55 para o mesmo valor", () => {
    expect(normalizePhoneBR("(15) 99728-4640")).toBe(normalizePhoneBR("+55 15 99728-4640"));
  });

  it("retorna null para valores vazios", () => {
    expect(normalizePhoneBR(null)).toBeNull();
    expect(normalizePhoneBR("")).toBeNull();
  });
});

describe("normalizeEmail", () => {
  it("normaliza caixa e espaços", () => {
    expect(normalizeEmail("  Fulano@Exemplo.com ")).toBe("fulano@exemplo.com");
  });
});

describe("findDuplicateMatches", () => {
  const candidates = [
    { id: "c1", phone: "15997284640", whatsapp: null, email: "ana@exemplo.com", metaLeadId: null },
    { id: "c2", phone: null, whatsapp: null, email: null, metaLeadId: "meta-123" },
  ];

  it("detecta duplicidade por telefone normalizado", () => {
    const matches = findDuplicateMatches({ phone: "(15) 99728-4640" }, candidates);
    expect(matches).toHaveLength(1);
    expect(matches[0]).toMatchObject({ candidateId: "c1", matchedOn: ["phone"] });
  });

  it("detecta duplicidade por e-mail e por metaLeadId simultaneamente contra candidatos diferentes", () => {
    const matches = findDuplicateMatches(
      { email: "ana@exemplo.com", metaLeadId: "meta-123" },
      candidates,
    );
    expect(matches.map((m) => m.candidateId).sort()).toEqual(["c1", "c2"]);
  });

  it("não reporta duplicidade quando nada coincide", () => {
    const matches = findDuplicateMatches({ phone: "11900000000", email: "novo@exemplo.com" }, candidates);
    expect(matches).toHaveLength(0);
  });
});

describe("normalizeDocument", () => {
  it("mantém só os dígitos, removendo pontuação de CPF/CNPJ", () => {
    expect(normalizeDocument("123.456.789-00")).toBe("12345678900");
    expect(normalizeDocument("12.345.678/0001-90")).toBe("12345678000190");
  });

  it("retorna null para valores vazios", () => {
    expect(normalizeDocument(null)).toBeNull();
    expect(normalizeDocument("")).toBeNull();
  });
});

describe("findDuplicateOwnerMatches (G20)", () => {
  const candidates = [
    { id: "o1", phone: "15997284640", email: "carlos@exemplo.com", document: "12345678900" },
    { id: "o2", phone: null, email: null, document: "12345678000190" },
  ];

  it("detecta duplicidade por telefone normalizado", () => {
    const matches = findDuplicateOwnerMatches({ phone: "(15) 99728-4640" }, candidates);
    expect(matches).toHaveLength(1);
    expect(matches[0]).toMatchObject({ candidateId: "o1", matchedOn: ["phone"] });
  });

  it("detecta duplicidade por documento com pontuação diferente da já cadastrada", () => {
    const matches = findDuplicateOwnerMatches({ document: "123.456.789-00" }, candidates);
    expect(matches).toHaveLength(1);
    expect(matches[0]).toMatchObject({ candidateId: "o1", matchedOn: ["document"] });
  });

  it("detecta duplicidade por e-mail e por documento simultaneamente contra candidatos diferentes", () => {
    const matches = findDuplicateOwnerMatches(
      { email: "carlos@exemplo.com", document: "12.345.678/0001-90" },
      candidates,
    );
    expect(matches.map((m) => m.candidateId).sort()).toEqual(["o1", "o2"]);
  });

  it("não reporta duplicidade quando nada coincide", () => {
    const matches = findDuplicateOwnerMatches({ phone: "11900000000", document: "00000000000" }, candidates);
    expect(matches).toHaveLength(0);
  });
});
