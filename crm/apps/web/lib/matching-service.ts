import { prisma } from "@mabres/db";
import {
  computeMatch,
  isMatchStale,
  MATCH_ALGORITHM_VERSION,
  scoreTier,
  type MatchPreferenceInput,
  type MatchPropertyInput,
  type MatchResult,
} from "@mabres/shared";

/**
 * Camada única de matching usada nos dois sentidos (cliente → imóveis e
 * imóvel → clientes). A regra de cálculo em si vive inteiramente em
 * `@mabres/shared` (computeMatch) — este módulo só busca dados, converte para
 * o formato de entrada do motor, e gerencia a cache em `Match`.
 */

type ContactWithPreference = Awaited<ReturnType<typeof fetchContactWithPreference>>;
type PropertyRecord = Awaited<ReturnType<typeof fetchActiveProperties>>[number];

async function fetchContactWithPreference(contactId: string) {
  return prisma.contact.findUnique({ where: { id: contactId }, include: { preference: true } });
}

async function fetchActiveProperties() {
  return prisma.property.findMany({ where: { deletedAt: null, status: "ativo" } });
}

function contactToPreferenceInput(contact: NonNullable<ContactWithPreference>): MatchPreferenceInput {
  const preference = contact.preference;
  return {
    intent: preference?.intent ?? null,
    city: preference?.desiredCity ?? null,
    neighborhoods: preference?.desiredNeighborhoods ?? null,
    propertyType: preference?.propertyType ?? null,
    minPrice: preference?.minPrice != null ? Number(preference.minPrice) : null,
    maxPrice: preference?.maxPrice != null ? Number(preference.maxPrice) : null,
    bedrooms: preference?.bedrooms ?? null,
    suites: preference?.suites ?? null,
    parkingSpots: preference?.parkingSpots ?? null,
    needsBackyard: preference?.needsBackyard ?? null,
    needsGourmetArea: preference?.needsGourmetArea ?? null,
    houseFormat: preference?.houseFormat ?? null,
    condoOrOpen: preference?.condoOrOpen ?? null,
    requirements: (preference?.criteriaRequirements as MatchPreferenceInput["requirements"]) ?? undefined,
  };
}

function propertyToMatchInput(property: PropertyRecord): MatchPropertyInput {
  return {
    status: property.status,
    purpose: property.purpose,
    city: property.city,
    neighborhood: property.neighborhood,
    propertyType: property.propertyType,
    salePrice: property.salePrice != null ? Number(property.salePrice) : null,
    rentPrice: property.rentPrice != null ? Number(property.rentPrice) : null,
    bedrooms: property.bedrooms,
    suites: property.suites,
    coveredParking: property.coveredParking,
    uncoveredParking: property.uncoveredParking,
    hasBackyard: property.hasBackyard,
    hasGourmetArea: property.hasGourmetArea,
    houseFormat: property.houseFormat,
    condoName: property.condoName,
    acceptsFinancing: property.acceptsFinancing,
    acceptsFgts: property.acceptsFgts,
    acceptsTrade: property.acceptsTrade,
  };
}

export interface MatchEntry {
  propertyId: string;
  contactId: string;
  result: MatchResult;
  calculatedAt: Date;
}

export interface MatchSummary {
  totalEvaluated: number;
  eligible: MatchEntry[];
  eliminationReasonTally: Array<{ reason: string; count: number }>;
}

function tallyReasons(all: MatchEntry[]): Array<{ reason: string; count: number }> {
  const counts = new Map<string, number>();
  for (const entry of all) {
    for (const reason of entry.result.eliminationReasons) {
      counts.set(reason, (counts.get(reason) ?? 0) + 1);
    }
  }
  return Array.from(counts.entries())
    .map(([reason, count]) => ({ reason, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 3);
}

async function persistMatch(contactId: string, propertyId: string, result: MatchResult) {
  const saved = await prisma.match.upsert({
    where: { contactId_propertyId: { contactId, propertyId } },
    update: {
      score: result.score,
      eligible: result.eligible,
      eliminationReasons: result.eliminationReasons,
      criteria: result.criteria as unknown as object,
      algorithmVersion: result.algorithmVersion,
    },
    create: {
      contactId,
      propertyId,
      score: result.score,
      eligible: result.eligible,
      eliminationReasons: result.eliminationReasons,
      criteria: result.criteria as unknown as object,
      algorithmVersion: result.algorithmVersion,
    },
  });
  return saved.calculatedAt;
}

/** Compatibilidade de um cliente com todos os imóveis ativos — sentido cliente → imóveis. */
export async function getMatchesForContact(
  contactId: string,
  options: { forceRecalculate?: boolean } = {},
): Promise<MatchSummary> {
  const contact = await fetchContactWithPreference(contactId);
  if (!contact) return { totalEvaluated: 0, eligible: [], eliminationReasonTally: [] };

  const preferenceInput = contactToPreferenceInput(contact);
  const properties = await fetchActiveProperties();

  const existing = options.forceRecalculate
    ? []
    : await prisma.match.findMany({ where: { contactId, propertyId: { in: properties.map((p) => p.id) } } });
  const existingByProperty = new Map(existing.map((m) => [m.propertyId, m]));

  const all: MatchEntry[] = [];
  for (const property of properties) {
    const cached = existingByProperty.get(property.id);
    const propertyInput = propertyToMatchInput(property);

    if (
      cached &&
      !isMatchStale({ calculatedAt: cached.calculatedAt, algorithmVersion: cached.algorithmVersion }, contact.updatedAt, property.updatedAt)
    ) {
      all.push({
        propertyId: property.id,
        contactId,
        calculatedAt: cached.calculatedAt,
        result: {
          score: Number(cached.score),
          tier: cached.eligible ? scoreTier(Number(cached.score)) : "nao_recomendado",
          eligible: cached.eligible,
          eliminationReasons: cached.eliminationReasons,
          criteria: cached.criteria as unknown as MatchResult["criteria"],
          algorithmVersion: cached.algorithmVersion,
        },
      });
      continue;
    }

    const result = computeMatch(preferenceInput, propertyInput);
    const calculatedAt = await persistMatch(contactId, property.id, result);
    all.push({ propertyId: property.id, contactId, result, calculatedAt });
  }

  const eligible = all.filter((m) => m.result.eligible).sort((a, b) => b.result.score - a.result.score);

  return { totalEvaluated: all.length, eligible, eliminationReasonTally: tallyReasons(all) };
}

/** Compatibilidade de um imóvel com todos os clientes com preferências cadastradas — sentido imóvel → clientes. */
export async function getMatchesForProperty(
  propertyId: string,
  options: { forceRecalculate?: boolean } = {},
): Promise<MatchSummary> {
  const property = await prisma.property.findUnique({ where: { id: propertyId } });
  if (!property) return { totalEvaluated: 0, eligible: [], eliminationReasonTally: [] };

  const contacts = await prisma.contact.findMany({
    where: { deletedAt: null, preference: { isNot: null } },
    include: { preference: true },
  });

  const propertyInput = propertyToMatchInput(property);

  const existing = options.forceRecalculate
    ? []
    : await prisma.match.findMany({ where: { propertyId, contactId: { in: contacts.map((c) => c.id) } } });
  const existingByContact = new Map(existing.map((m) => [m.contactId, m]));

  const all: MatchEntry[] = [];
  for (const contact of contacts) {
    const cached = existingByContact.get(contact.id);
    const preferenceInput = contactToPreferenceInput(contact);

    if (
      cached &&
      !isMatchStale({ calculatedAt: cached.calculatedAt, algorithmVersion: cached.algorithmVersion }, contact.updatedAt, property.updatedAt)
    ) {
      all.push({
        propertyId,
        contactId: contact.id,
        calculatedAt: cached.calculatedAt,
        result: {
          score: Number(cached.score),
          tier: cached.eligible ? scoreTier(Number(cached.score)) : "nao_recomendado",
          eligible: cached.eligible,
          eliminationReasons: cached.eliminationReasons,
          criteria: cached.criteria as unknown as MatchResult["criteria"],
          algorithmVersion: cached.algorithmVersion,
        },
      });
      continue;
    }

    const result = computeMatch(preferenceInput, propertyInput);
    const calculatedAt = await persistMatch(contact.id, propertyId, result);
    all.push({ propertyId, contactId: contact.id, result, calculatedAt });
  }

  const eligible = all.filter((m) => m.result.eligible).sort((a, b) => b.result.score - a.result.score);

  return { totalEvaluated: all.length, eligible, eliminationReasonTally: tallyReasons(all) };
}


export { MATCH_ALGORITHM_VERSION };
