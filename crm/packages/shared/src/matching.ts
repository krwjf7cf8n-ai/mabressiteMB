/**
 * Motor de matching determinístico cliente <-> imóvel (seção 8 do briefing).
 * Toda pontuação é explicável: cada critério aplicado é retornado com seu
 * peso e resultado, nunca "caixa-preta" de IA.
 */

export interface MatchWeights {
  location: number;
  propertyType: number;
  priceRange: number;
  bedrooms: number;
  suites: number;
  parkingSpots: number;
}

export const DEFAULT_MATCH_WEIGHTS: MatchWeights = {
  location: 25,
  propertyType: 20,
  priceRange: 25,
  bedrooms: 10,
  suites: 10,
  parkingSpots: 10,
};

export interface PreferenceInput {
  city?: string | null;
  neighborhoods?: string[] | null;
  propertyType?: string | null;
  minPrice?: number | null;
  maxPrice?: number | null;
  bedrooms?: number | null;
  suites?: number | null;
  parkingSpots?: number | null;
}

export interface PropertyMatchInput {
  city?: string | null;
  neighborhood?: string | null;
  propertyType?: string | null;
  price?: number | null; // salePrice ou rentPrice conforme a finalidade buscada
  bedrooms?: number | null;
  suites?: number | null;
  parkingSpots?: number | null;
}

export interface MatchCriterionResult {
  criterion: keyof MatchWeights;
  applicable: boolean;
  passed: boolean;
  weight: number;
}

export interface MatchResult {
  score: number; // 0-100
  criteria: MatchCriterionResult[];
  tier: "excelente" | "boa" | "parcial" | "nao_recomendado";
}

export function computeMatchScore(
  preference: PreferenceInput,
  property: PropertyMatchInput,
  weights: MatchWeights = DEFAULT_MATCH_WEIGHTS,
): MatchResult {
  const criteria: MatchCriterionResult[] = [];

  // Localização: bate se cidade igual e (sem lista de bairros desejados OU bairro do imóvel está na lista)
  const hasLocationPreference = Boolean(preference.city);
  if (hasLocationPreference) {
    const cityMatches = normalize(preference.city) === normalize(property.city);
    const neighborhoodOk =
      !preference.neighborhoods ||
      preference.neighborhoods.length === 0 ||
      preference.neighborhoods.some((n) => normalize(n) === normalize(property.neighborhood));
    criteria.push({
      criterion: "location",
      applicable: true,
      passed: cityMatches && neighborhoodOk,
      weight: weights.location,
    });
  } else {
    criteria.push({ criterion: "location", applicable: false, passed: false, weight: weights.location });
  }

  const hasTypePreference = Boolean(preference.propertyType);
  criteria.push({
    criterion: "propertyType",
    applicable: hasTypePreference,
    passed: hasTypePreference && normalize(preference.propertyType) === normalize(property.propertyType),
    weight: weights.propertyType,
  });

  const hasPriceRange = preference.minPrice != null || preference.maxPrice != null;
  if (hasPriceRange && property.price != null) {
    const min = preference.minPrice ?? 0;
    const max = preference.maxPrice ?? Number.POSITIVE_INFINITY;
    criteria.push({
      criterion: "priceRange",
      applicable: true,
      passed: property.price >= min && property.price <= max,
      weight: weights.priceRange,
    });
  } else {
    criteria.push({ criterion: "priceRange", applicable: false, passed: false, weight: weights.priceRange });
  }

  criteria.push(compareMinimum("bedrooms", preference.bedrooms, property.bedrooms, weights.bedrooms));
  criteria.push(compareMinimum("suites", preference.suites, property.suites, weights.suites));
  criteria.push(
    compareMinimum("parkingSpots", preference.parkingSpots, property.parkingSpots, weights.parkingSpots),
  );

  const applicableCriteria = criteria.filter((c) => c.applicable);
  const totalWeight = applicableCriteria.reduce((sum, c) => sum + c.weight, 0);
  const passedWeight = applicableCriteria.filter((c) => c.passed).reduce((sum, c) => sum + c.weight, 0);

  const score = totalWeight === 0 ? 0 : Math.round((passedWeight / totalWeight) * 100 * 100) / 100;

  return { score, criteria, tier: scoreTier(score) };
}

function compareMinimum(
  criterion: keyof MatchWeights,
  desired: number | null | undefined,
  actual: number | null | undefined,
  weight: number,
): MatchCriterionResult {
  const applicable = desired != null && actual != null;
  return {
    criterion,
    applicable,
    passed: applicable && (actual as number) >= (desired as number),
    weight,
  };
}

function scoreTier(score: number): MatchResult["tier"] {
  if (score >= 90) return "excelente";
  if (score >= 75) return "boa";
  if (score >= 60) return "parcial";
  return "nao_recomendado";
}

function normalize(value: string | null | undefined): string {
  return (value ?? "").trim().toLowerCase();
}
