import { describe, expect, it } from "vitest";
import { computeMatchScore } from "./matching";

describe("computeMatchScore", () => {
  it("retorna 100 quando todos os critérios aplicáveis batem", () => {
    const result = computeMatchScore(
      {
        city: "Sorocaba",
        neighborhoods: ["Campolim"],
        propertyType: "Apartamento",
        minPrice: 300000,
        maxPrice: 500000,
        bedrooms: 2,
        suites: 1,
        parkingSpots: 1,
      },
      {
        city: "Sorocaba",
        neighborhood: "Campolim",
        propertyType: "Apartamento",
        price: 420000,
        bedrooms: 3,
        suites: 1,
        parkingSpots: 2,
      },
    );

    expect(result.score).toBe(100);
    expect(result.tier).toBe("excelente");
  });

  it("classifica como não recomendado quando cidade e faixa de preço não batem", () => {
    const result = computeMatchScore(
      { city: "Sorocaba", minPrice: 200000, maxPrice: 300000 },
      { city: "Votorantim", price: 900000 },
    );

    expect(result.score).toBeLessThan(60);
    expect(result.tier).toBe("nao_recomendado");
  });

  it("ignora critérios não informados pelo cliente (não penaliza o que não foi preenchido)", () => {
    const result = computeMatchScore({ city: "Sorocaba" }, { city: "Sorocaba" });
    expect(result.score).toBe(100);
    const applicable = result.criteria.filter((c) => c.applicable);
    expect(applicable).toHaveLength(1);
  });

  it("retorna 0 quando nenhum critério é aplicável", () => {
    const result = computeMatchScore({}, { city: "Sorocaba" });
    expect(result.score).toBe(0);
    expect(result.tier).toBe("nao_recomendado");
  });

  it("respeita pesos customizados pelo corretor", () => {
    const result = computeMatchScore(
      { city: "Sorocaba", propertyType: "Casa" },
      { city: "Votorantim", propertyType: "Casa" },
      { location: 90, propertyType: 10, priceRange: 0, bedrooms: 0, suites: 0, parkingSpots: 0 },
    );
    // location falha (peso 90), propertyType passa (peso 10) => 10/100
    expect(result.score).toBe(10);
  });
});
