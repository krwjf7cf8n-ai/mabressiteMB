import { describe, expect, it } from "vitest";
import { findDuplicateMatches, normalizeEmail, normalizePhoneBR } from "./dedup";

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
