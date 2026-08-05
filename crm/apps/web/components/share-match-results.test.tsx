import { describe, expect, it } from "vitest";
import type { MatchListItem } from "./match-results-list";
import { buildSummaryText } from "./share-match-results";

function makeItem(overrides: Partial<MatchListItem> = {}): MatchListItem {
  return {
    id: "1",
    title: "AP-001 — Apartamento",
    subtitle: "Sorocaba — Campolim",
    href: "/properties/1",
    calculatedAt: new Date("2026-08-05T12:00:00Z"),
    result: {
      score: 87.5,
      tier: "boa",
      eligible: true,
      eliminationReasons: [],
      criteria: [],
      algorithmVersion: "1.0.0",
    },
    ...overrides,
  };
}

/** G31 (Marco 1.9, Sprint 6) — texto usado para "Copiar resumo"/"Compartilhar no WhatsApp". */
describe("buildSummaryText — resumo de compartilhamento do Matching", () => {
  it("inclui o rótulo de contexto e a contagem de resultados", () => {
    const text = buildSummaryText("Imóveis compatíveis com Ana", [makeItem()]);
    expect(text).toContain("Imóveis compatíveis com Ana — 1 resultado(s) compatível(is):");
  });

  it("lista cada item numerado com título, subtítulo, score e tier", () => {
    const text = buildSummaryText("Contexto", [makeItem({ title: "AP-001", subtitle: "Sorocaba" })]);
    expect(text).toContain("1. AP-001 (Sorocaba) — 88% · Boa compatibilidade");
  });

  it("numera múltiplos itens em ordem", () => {
    const text = buildSummaryText("Contexto", [
      makeItem({ id: "1", title: "Primeiro" }),
      makeItem({ id: "2", title: "Segundo" }),
    ]);
    expect(text).toContain("1. Primeiro");
    expect(text).toContain("2. Segundo");
  });

  it("usa o rótulo do tier correspondente para cada nível", () => {
    const excelente = buildSummaryText("C", [makeItem({ result: { ...makeItem().result, tier: "excelente" } })]);
    const naoRecomendado = buildSummaryText("C", [makeItem({ result: { ...makeItem().result, tier: "nao_recomendado" } })]);
    expect(excelente).toContain("Excelente compatibilidade");
    expect(naoRecomendado).toContain("Não recomendado");
  });
});
