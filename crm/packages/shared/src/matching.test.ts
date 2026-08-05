import { describe, expect, it } from "vitest";
import { computeMatch, isMatchStale, MATCH_ALGORITHM_VERSION } from "./matching";
import type { MatchPreferenceInput, MatchPropertyInput } from "./matching";

const basePreference: MatchPreferenceInput = {
  intent: "COMPRA",
  city: "Sorocaba",
  neighborhoods: ["Campolim"],
  propertyType: "Apartamento",
  minPrice: 300000,
  maxPrice: 500000,
  bedrooms: 2,
  suites: 1,
  parkingSpots: 1,
};

const baseProperty: MatchPropertyInput = {
  status: "ativo",
  purpose: "VENDA",
  city: "Sorocaba",
  neighborhood: "Campolim",
  propertyType: "Apartamento",
  salePrice: 420000,
  bedrooms: 3,
  suites: 1,
  coveredParking: 1,
  uncoveredParking: 1,
};

describe("computeMatch — match perfeito", () => {
  it("retorna score 100, elegível e tier excelente quando tudo bate", () => {
    const result = computeMatch(basePreference, baseProperty);
    expect(result.score).toBe(100);
    expect(result.eligible).toBe(true);
    expect(result.tier).toBe("excelente");
    expect(result.eliminationReasons).toHaveLength(0);
  });
});

describe("computeMatch — preço incompatível", () => {
  it("marca o critério de preço como não atendido e reduz o score", () => {
    const result = computeMatch(basePreference, { ...baseProperty, salePrice: 900000 });
    const priceCriterion = result.criteria.find((c) => c.key === "priceRange")!;
    expect(priceCriterion.applicable).toBe(true);
    expect(priceCriterion.passed).toBe(false);
    expect(result.score).toBeLessThan(100);
  });

  it("elimina a opção quando preço é obrigatório e não atendido", () => {
    const result = computeMatch(basePreference, { ...baseProperty, salePrice: 900000 });
    expect(result.eligible).toBe(false);
    expect(result.tier).toBe("nao_recomendado");
    expect(result.eliminationReasons.some((r) => r.includes("Faixa de preço"))).toBe(true);
  });
});

describe("computeMatch — requisito obrigatório eliminado", () => {
  it("elimina quando cidade obrigatória não bate, mesmo com o resto perfeito", () => {
    const result = computeMatch(basePreference, { ...baseProperty, city: "Votorantim" });
    expect(result.eligible).toBe(false);
    const cityCriterion = result.criteria.find((c) => c.key === "city")!;
    expect(cityCriterion.eliminatory).toBe(true);
  });

  it("não elimina quando o critério não atendido é apenas desejável", () => {
    const result = computeMatch(basePreference, { ...baseProperty, neighborhood: "Centro" });
    expect(result.eligible).toBe(true);
    const neighborhoodCriterion = result.criteria.find((c) => c.key === "neighborhood")!;
    expect(neighborhoodCriterion.eliminatory).toBe(false);
    expect(neighborhoodCriterion.passed).toBe(false);
  });
});

describe("computeMatch — imóvel inativo", () => {
  it("nunca é elegível quando o imóvel não está ativo", () => {
    for (const status of ["vendido", "alugado", "suspenso", "indisponivel", "inativo"]) {
      const result = computeMatch(basePreference, { ...baseProperty, status });
      expect(result.eligible).toBe(false);
      expect(result.tier).toBe("nao_recomendado");
      expect(result.eliminationReasons.some((r) => r.includes("não está ativo"))).toBe(true);
    }
  });
});

describe("computeMatch — finalidade incompatível", () => {
  it("elimina cliente comprador contra imóvel só para locação", () => {
    const result = computeMatch({ ...basePreference, intent: "COMPRA" }, { ...baseProperty, purpose: "LOCACAO" });
    expect(result.eligible).toBe(false);
  });

  it("cliente com intenção de venda nunca é elegível para matching de aquisição", () => {
    const result = computeMatch({ ...basePreference, intent: "VENDA" }, baseProperty);
    expect(result.eligible).toBe(false);
    expect(result.eliminationReasons.some((r) => r.includes("vender"))).toBe(true);
  });

  it("imóvel AMBAS atende comprador e locatário", () => {
    const buyer = computeMatch({ ...basePreference, intent: "COMPRA" }, { ...baseProperty, purpose: "AMBAS" });
    // faixa de preço de venda não se aplica ao cenário de locação — omitida para isolar o teste de finalidade
    const renter = computeMatch(
      { ...basePreference, intent: "LOCACAO", minPrice: null, maxPrice: null },
      { ...baseProperty, purpose: "AMBAS", rentPrice: 2500 },
    );
    expect(buyer.eligible).toBe(true);
    expect(renter.eligible).toBe(true);
  });
});

describe("computeMatch — dado ausente não penaliza", () => {
  it("critério sem preferência informada fica 'não aplicável', não conta contra o score", () => {
    const preferenceOnlyCity: MatchPreferenceInput = { intent: "COMPRA", city: "Sorocaba" };
    const result = computeMatch(preferenceOnlyCity, baseProperty);
    expect(result.score).toBe(100);
    const applicableKeys = result.criteria.filter((c) => c.applicable).map((c) => c.key);
    expect(applicableKeys).toEqual(["city"]);
  });

  it("diferencia not_applicable de unmet: bedrooms sem preferência não aparece como reprovado", () => {
    const result = computeMatch({ intent: "COMPRA", city: "Sorocaba" }, baseProperty);
    const bedrooms = result.criteria.find((c) => c.key === "bedrooms")!;
    expect(bedrooms.applicable).toBe(false);
    expect(bedrooms.passed).toBe(false); // não é "atendido" nem "não atendido" de forma relevante — é ausência de dado
    expect(bedrooms.eliminatory).toBe(false);
  });
});

describe("computeMatch — múltiplas preferências combinadas", () => {
  it("combina critérios obrigatórios e desejáveis coerentemente", () => {
    const preference: MatchPreferenceInput = {
      ...basePreference,
      needsBackyard: true,
      needsGourmetArea: true,
      houseFormat: "sobrado",
      condoOrOpen: "condominio",
    };
    const property: MatchPropertyInput = {
      ...baseProperty,
      hasBackyard: true,
      hasGourmetArea: false,
      houseFormat: "sobrado",
      condoName: "Residencial Alfa",
    };
    const result = computeMatch(preference, property);
    expect(result.criteria.find((c) => c.key === "backyard")!.passed).toBe(true);
    expect(result.criteria.find((c) => c.key === "gourmetArea")!.passed).toBe(false);
    expect(result.criteria.find((c) => c.key === "houseFormat")!.passed).toBe(true);
    expect(result.criteria.find((c) => c.key === "condoOrOpen")!.passed).toBe(true);
    expect(result.eligible).toBe(true); // todos esses são "indiferente" por padrão, não eliminam
  });
});

describe("computeMatch — arredondamento", () => {
  it("arredonda para 2 casas decimais de forma determinística", () => {
    // 1 de 3 critérios aplicáveis e desejáveis passa -> 33.333...% deve virar 33.33
    const preference: MatchPreferenceInput = {
      intent: "COMPRA",
      city: "Sorocaba", // obrigatória, passa
      requirements: { city: "desejavel", propertyType: "desejavel", bedrooms: "desejavel" },
      propertyType: "Casa", // não bate
      bedrooms: 10, // não bate
    };
    const weights = {
      priceRange: 0, neighborhood: 0, suites: 0, parkingSpots: 0, backyard: 0, gourmetArea: 0,
      houseFormat: 0, condoOrOpen: 0, acceptsFinancing: 0, acceptsFgts: 0, acceptsTrade: 0,
      city: 1, propertyType: 1, bedrooms: 1,
    };
    const result = computeMatch(preference, baseProperty, weights);
    expect(result.score).toBe(33.33);
  });
});

describe("computeMatch — determinismo", () => {
  it("mesma entrada sempre produz o mesmo resultado", () => {
    const a = computeMatch(basePreference, baseProperty);
    const b = computeMatch(basePreference, baseProperty);
    expect(a).toEqual(b);
  });

  it("versão do algoritmo é registrada no resultado", () => {
    const result = computeMatch(basePreference, baseProperty);
    expect(result.algorithmVersion).toBe(MATCH_ALGORITHM_VERSION);
  });
});

describe("isMatchStale — invalidação por alteração relevante", () => {
  const calculatedAt = new Date("2026-01-10T12:00:00Z");

  it("não é obsoleto quando nada mudou depois do cálculo", () => {
    const stale = isMatchStale(
      { calculatedAt, algorithmVersion: MATCH_ALGORITHM_VERSION },
      new Date("2026-01-01T00:00:00Z"),
      new Date("2026-01-01T00:00:00Z"),
    );
    expect(stale).toBe(false);
  });

  it("fica obsoleto quando o imóvel foi atualizado (ex.: mudança de preço) depois do cálculo", () => {
    const stale = isMatchStale(
      { calculatedAt, algorithmVersion: MATCH_ALGORITHM_VERSION },
      new Date("2026-01-01T00:00:00Z"),
      new Date("2026-01-11T00:00:00Z"), // imóvel mudou depois do cálculo
    );
    expect(stale).toBe(true);
  });

  it("fica obsoleto quando o cliente foi atualizado depois do cálculo", () => {
    const stale = isMatchStale(
      { calculatedAt, algorithmVersion: MATCH_ALGORITHM_VERSION },
      new Date("2026-01-11T00:00:00Z"),
      new Date("2026-01-01T00:00:00Z"),
    );
    expect(stale).toBe(true);
  });

  it("fica obsoleto quando a versão do algoritmo mudou", () => {
    const stale = isMatchStale(
      { calculatedAt, algorithmVersion: "0.0.1" },
      new Date("2026-01-01T00:00:00Z"),
      new Date("2026-01-01T00:00:00Z"),
    );
    expect(stale).toBe(true);
  });
});
