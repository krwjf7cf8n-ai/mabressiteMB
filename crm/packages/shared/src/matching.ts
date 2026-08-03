/**
 * Motor de matching determinístico cliente <-> imóvel (Fase 1.2).
 *
 * Usado identicamente nos dois sentidos (cliente → imóveis e imóvel →
 * clientes) — a regra de cálculo vive só aqui, a interface nunca reimplementa
 * pontuação. Ver docs/matching-algorithm.md para a especificação completa.
 */

export const MATCH_ALGORITHM_VERSION = "1.0.0";

export type RequirementLevel = "obrigatoria" | "desejavel" | "indiferente";

export const CRITERION_KEYS = [
  "priceRange",
  "city",
  "neighborhood",
  "propertyType",
  "bedrooms",
  "suites",
  "parkingSpots",
  "backyard",
  "gourmetArea",
  "houseFormat",
  "condoOrOpen",
  "acceptsFinancing",
  "acceptsFgts",
  "acceptsTrade",
] as const;

export type CriterionKey = (typeof CRITERION_KEYS)[number];

export const CRITERION_LABELS: Record<CriterionKey, string> = {
  priceRange: "Faixa de preço",
  city: "Cidade",
  neighborhood: "Bairro",
  propertyType: "Tipo de imóvel",
  bedrooms: "Dormitórios",
  suites: "Suítes",
  parkingSpots: "Vagas",
  backyard: "Quintal",
  gourmetArea: "Área gourmet",
  houseFormat: "Casa térrea ou sobrado",
  condoOrOpen: "Condomínio ou bairro aberto",
  acceptsFinancing: "Aceita financiamento",
  acceptsFgts: "Aceita FGTS",
  acceptsTrade: "Aceita permuta",
};

/** Pesos padrão (some 100, mas a normalização não depende disso). */
export const DEFAULT_CRITERIA_WEIGHTS: Record<CriterionKey, number> = {
  priceRange: 20,
  city: 15,
  neighborhood: 10,
  propertyType: 15,
  bedrooms: 10,
  suites: 5,
  parkingSpots: 10,
  backyard: 3,
  gourmetArea: 3,
  houseFormat: 3,
  condoOrOpen: 2,
  acceptsFinancing: 2,
  acceptsFgts: 1,
  acceptsTrade: 1,
};

/** Classificação padrão de exigência — o corretor pode sobrescrever por cliente. */
export const DEFAULT_REQUIREMENT_LEVELS: Record<CriterionKey, RequirementLevel> = {
  priceRange: "obrigatoria",
  city: "obrigatoria",
  neighborhood: "desejavel",
  propertyType: "obrigatoria",
  bedrooms: "desejavel",
  suites: "indiferente",
  parkingSpots: "desejavel",
  backyard: "indiferente",
  gourmetArea: "indiferente",
  houseFormat: "indiferente",
  condoOrOpen: "indiferente",
  acceptsFinancing: "indiferente",
  acceptsFgts: "indiferente",
  acceptsTrade: "indiferente",
};

export type MatchIntent = "COMPRA" | "VENDA" | "LOCACAO" | "INVESTIMENTO";
export type MatchPropertyPurpose = "VENDA" | "LOCACAO" | "AMBAS";

export interface MatchPreferenceInput {
  intent?: MatchIntent | null;
  city?: string | null;
  neighborhoods?: string[] | null;
  propertyType?: string | null;
  minPrice?: number | null;
  maxPrice?: number | null;
  bedrooms?: number | null;
  suites?: number | null;
  parkingSpots?: number | null;
  needsBackyard?: boolean | null;
  needsGourmetArea?: boolean | null;
  houseFormat?: string | null;
  condoOrOpen?: string | null;
  requirements?: Partial<Record<CriterionKey, RequirementLevel>>;
}

export interface MatchPropertyInput {
  status: string;
  purpose: MatchPropertyPurpose;
  city?: string | null;
  neighborhood?: string | null;
  propertyType?: string | null;
  salePrice?: number | null;
  rentPrice?: number | null;
  bedrooms?: number | null;
  suites?: number | null;
  coveredParking?: number | null;
  uncoveredParking?: number | null;
  hasBackyard?: boolean | null;
  hasGourmetArea?: boolean | null;
  houseFormat?: string | null;
  condoName?: string | null;
  acceptsFinancing?: boolean | null;
  acceptsFgts?: boolean | null;
  acceptsTrade?: boolean | null;
}

type CriterionState = "no_data" | "met" | "unmet";

export interface MatchCriterionResult {
  key: CriterionKey;
  label: string;
  level: RequirementLevel;
  applicable: boolean; // false = cliente não informou (estado "sem informação")
  passed: boolean; // só tem sentido quando applicable = true
  weight: number;
  eliminatory: boolean; // obrigatória, aplicável e não atendida
  note?: string;
}

export interface MatchResult {
  score: number; // 0-100, 2 casas decimais
  tier: "excelente" | "boa" | "parcial" | "nao_recomendado";
  eligible: boolean;
  eliminationReasons: string[];
  criteria: MatchCriterionResult[];
  algorithmVersion: string;
}

function normalize(value: string | null | undefined): string {
  return (value ?? "").trim().toLowerCase();
}

function isCondo(condoName: string | null | undefined): boolean {
  return Boolean(condoName && condoName.trim().length > 0);
}

function resolveRelevantPrice(
  intent: MatchIntent | null | undefined,
  property: MatchPropertyInput,
): number | null {
  if (intent === "LOCACAO") return property.rentPrice ?? null;
  return property.salePrice ?? null;
}

function checkPurposeCompatibility(
  intent: MatchIntent | null | undefined,
  purpose: MatchPropertyPurpose,
): { applicable: boolean; passed: boolean; reason?: string } {
  if (!intent) {
    return { applicable: false, passed: false, reason: "Interesse do cliente (compra/locação) não informado" };
  }
  if (intent === "VENDA") {
    return {
      applicable: false,
      passed: false,
      reason: "Cliente busca vender um imóvel — matching de aquisição não se aplica",
    };
  }
  if (intent === "LOCACAO") {
    return { applicable: true, passed: purpose === "LOCACAO" || purpose === "AMBAS" };
  }
  // COMPRA ou INVESTIMENTO
  return { applicable: true, passed: purpose === "VENDA" || purpose === "AMBAS" };
}

function evaluateCriterion(
  key: CriterionKey,
  preference: MatchPreferenceInput,
  property: MatchPropertyInput,
  level: RequirementLevel,
): { state: CriterionState; note?: string } {
  switch (key) {
    case "priceRange": {
      if (preference.minPrice == null && preference.maxPrice == null) return { state: "no_data" };
      const price = resolveRelevantPrice(preference.intent, property);
      if (price == null) return { state: "unmet", note: "Imóvel sem preço cadastrado para essa finalidade" };
      const min = preference.minPrice ?? 0;
      const max = preference.maxPrice ?? Number.POSITIVE_INFINITY;
      return { state: price >= min && price <= max ? "met" : "unmet" };
    }
    case "city": {
      if (!preference.city) return { state: "no_data" };
      return { state: normalize(preference.city) === normalize(property.city) ? "met" : "unmet" };
    }
    case "neighborhood": {
      if (!preference.neighborhoods || preference.neighborhoods.length === 0) return { state: "no_data" };
      const wanted = preference.neighborhoods.map(normalize);
      return { state: wanted.includes(normalize(property.neighborhood)) ? "met" : "unmet" };
    }
    case "propertyType": {
      if (!preference.propertyType) return { state: "no_data" };
      return { state: normalize(preference.propertyType) === normalize(property.propertyType) ? "met" : "unmet" };
    }
    case "bedrooms": {
      if (preference.bedrooms == null) return { state: "no_data" };
      return { state: (property.bedrooms ?? 0) >= preference.bedrooms ? "met" : "unmet" };
    }
    case "suites": {
      if (preference.suites == null) return { state: "no_data" };
      return { state: (property.suites ?? 0) >= preference.suites ? "met" : "unmet" };
    }
    case "parkingSpots": {
      if (preference.parkingSpots == null) return { state: "no_data" };
      const total = (property.coveredParking ?? 0) + (property.uncoveredParking ?? 0);
      return { state: total >= preference.parkingSpots ? "met" : "unmet" };
    }
    case "backyard": {
      if (preference.needsBackyard !== true) return { state: "no_data" };
      return { state: property.hasBackyard === true ? "met" : "unmet" };
    }
    case "gourmetArea": {
      if (preference.needsGourmetArea !== true) return { state: "no_data" };
      return { state: property.hasGourmetArea === true ? "met" : "unmet" };
    }
    case "houseFormat": {
      if (!preference.houseFormat) return { state: "no_data" };
      return { state: normalize(preference.houseFormat) === normalize(property.houseFormat) ? "met" : "unmet" };
    }
    case "condoOrOpen": {
      if (!preference.condoOrOpen) return { state: "no_data" };
      const wantsCondo = normalize(preference.condoOrOpen).includes("cond");
      return { state: isCondo(property.condoName) === wantsCondo ? "met" : "unmet" };
    }
    // Critérios "aceita X" não têm um valor de preferência próprio — a única forma do
    // cliente "pedir" isso é o corretor marcar o critério como obrigatório/desejável.
    // Com "indiferente" (padrão), o critério não é aplicável (sem informação).
    case "acceptsFinancing":
      if (level === "indiferente") return { state: "no_data" };
      return { state: property.acceptsFinancing === true ? "met" : "unmet" };
    case "acceptsFgts":
      if (level === "indiferente") return { state: "no_data" };
      return { state: property.acceptsFgts === true ? "met" : "unmet" };
    case "acceptsTrade":
      if (level === "indiferente") return { state: "no_data" };
      return { state: property.acceptsTrade === true ? "met" : "unmet" };
  }
}

/** Exportado para que a camada de persistência (cache de Match) reconstrua o tier sem duplicar a regra. */
export function scoreTier(score: number): MatchResult["tier"] {
  if (score >= 90) return "excelente";
  if (score >= 75) return "boa";
  if (score >= 60) return "parcial";
  return "nao_recomendado";
}

/** Verdadeiro se o match persistido precisa ser recalculado (versão velha ou entidade mudou depois do cálculo). */
export function isMatchStale(
  match: { calculatedAt: Date; algorithmVersion: string },
  contactUpdatedAt: Date,
  propertyUpdatedAt: Date,
): boolean {
  if (match.algorithmVersion !== MATCH_ALGORITHM_VERSION) return true;
  if (match.calculatedAt < contactUpdatedAt) return true;
  if (match.calculatedAt < propertyUpdatedAt) return true;
  return false;
}

/**
 * Calcula a compatibilidade entre um cliente e um imóvel. Determinístico: as
 * mesmas entradas sempre produzem o mesmo resultado (sem Date.now/random).
 */
export function computeMatch(
  preference: MatchPreferenceInput,
  property: MatchPropertyInput,
  weights: Record<CriterionKey, number> = DEFAULT_CRITERIA_WEIGHTS,
): MatchResult {
  const requirements = { ...DEFAULT_REQUIREMENT_LEVELS, ...(preference.requirements ?? {}) };
  const eliminationReasons: string[] = [];

  if (property.status !== "ativo") {
    eliminationReasons.push(`Imóvel não está ativo (status atual: "${property.status}")`);
  }

  const purposeCheck = checkPurposeCompatibility(preference.intent, property.purpose);
  if (purposeCheck.applicable && !purposeCheck.passed) {
    eliminationReasons.push("Finalidade do imóvel incompatível com o interesse do cliente");
  } else if (!purposeCheck.applicable) {
    eliminationReasons.push(purposeCheck.reason!);
  }

  const criteria: MatchCriterionResult[] = CRITERION_KEYS.map((key) => {
    const level = requirements[key];
    const { state, note } = evaluateCriterion(key, preference, property, level);
    const applicable = state !== "no_data";
    const passed = state === "met";
    const eliminatory = level === "obrigatoria" && applicable && !passed;

    if (eliminatory) {
      eliminationReasons.push(`${CRITERION_LABELS[key]} obrigatório não atendido${note ? ` (${note})` : ""}`);
    }

    return { key, label: CRITERION_LABELS[key], level, applicable, passed, weight: weights[key], eliminatory, note };
  });

  const eligible = eliminationReasons.length === 0;

  const scorable = criteria.filter((c) => c.applicable && c.level !== "indiferente");
  const totalWeight = scorable.reduce((sum, c) => sum + c.weight, 0);
  const passedWeight = scorable.filter((c) => c.passed).reduce((sum, c) => sum + c.weight, 0);
  const score = totalWeight === 0 ? 0 : Math.round((passedWeight / totalWeight) * 10000) / 100;

  return {
    score,
    tier: eligible ? scoreTier(score) : "nao_recomendado",
    eligible,
    eliminationReasons,
    criteria,
    algorithmVersion: MATCH_ALGORITHM_VERSION,
  };
}
