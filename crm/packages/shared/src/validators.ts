import { z } from "zod";

export const contactOriginSchema = z.enum([
  "META_LEAD_ADS",
  "SITE",
  "WHATSAPP",
  "MANUAL",
  "IMPORTACAO",
  "INDICACAO",
  "OUTRO",
]);

export const contactCreateSchema = z.object({
  name: z.string().trim().min(2, "Informe o nome completo"),
  phone: z.string().trim().optional().nullable(),
  whatsapp: z.string().trim().optional().nullable(),
  email: z.string().trim().email("E-mail inválido").optional().nullable().or(z.literal("")),
  city: z.string().trim().optional().nullable(),
  state: z.string().trim().length(2).optional().nullable(),
  origin: contactOriginSchema.default("MANUAL"),
  notes: z.string().trim().optional().nullable(),
  consentGiven: z.boolean().default(false),
  consentOrigin: z.string().trim().optional().nullable(),
});

export type ContactCreateInput = z.infer<typeof contactCreateSchema>;

export const stageChangeSchema = z.object({
  contactId: z.string().cuid(),
  toStageId: z.string().cuid(),
  comment: z.string().trim().optional().nullable(),
  reason: z.string().trim().optional().nullable(),
});

export type StageChangeInput = z.infer<typeof stageChangeSchema>;

export const taskCreateSchema = z.object({
  title: z.string().trim().min(2),
  description: z.string().trim().optional().nullable(),
  contactId: z.string().cuid().optional().nullable(),
  propertyId: z.string().cuid().optional().nullable(),
  assignedUserId: z.string().cuid(),
  priority: z.enum(["BAIXA", "MEDIA", "ALTA", "URGENTE"]).default("MEDIA"),
  dueAt: z.coerce.date().optional().nullable(),
  taskType: z.string().trim().min(1),
});

export type TaskCreateInput = z.infer<typeof taskCreateSchema>;

// ---------------------------------------------------------------------------
// Imóveis e proprietários (Fase 1.1)
// ---------------------------------------------------------------------------

function emptyToUndefined(value: unknown) {
  return value === "" || value === null ? undefined : value;
}

const optionalNonNegativeNumber = z.preprocess(
  emptyToUndefined,
  z.coerce.number().nonnegative("Deve ser zero ou maior").optional(),
);

const optionalNonNegativeInt = z.preprocess(
  emptyToUndefined,
  z.coerce.number().int("Deve ser um número inteiro").nonnegative("Deve ser zero ou maior").optional(),
);

export const propertyPurposeSchema = z.enum(["VENDA", "LOCACAO", "AMBAS"]);

export const propertyCreateSchema = z.object({
  purpose: propertyPurposeSchema.default("VENDA"),
  propertyType: z.string().trim().min(1, "Informe o tipo do imóvel"),
  externalRef: z.string().trim().optional().nullable(),
  addressLine: z.string().trim().optional().nullable(),
  number: z.string().trim().optional().nullable(),
  complement: z.string().trim().optional().nullable(),
  neighborhood: z.string().trim().optional().nullable(),
  city: z.string().trim().min(1, "Informe a cidade").default("Sorocaba"),
  state: z.string().trim().length(2, "Use a sigla do estado (ex.: SP)").default("SP"),
  zipCode: z.string().trim().optional().nullable(),
  condoName: z.string().trim().optional().nullable(),
  salePrice: optionalNonNegativeNumber,
  rentPrice: optionalNonNegativeNumber,
  condoFee: optionalNonNegativeNumber,
  iptu: optionalNonNegativeNumber,
  landArea: optionalNonNegativeNumber,
  builtArea: optionalNonNegativeNumber,
  bedrooms: optionalNonNegativeInt,
  suites: optionalNonNegativeInt,
  bathrooms: optionalNonNegativeInt,
  coveredParking: optionalNonNegativeInt,
  uncoveredParking: optionalNonNegativeInt,
  furnished: z.boolean().default(false),
  hasPool: z.boolean().default(false),
  hasGourmetArea: z.boolean().default(false),
  hasBackyard: z.boolean().default(false),
  acceptsFinancing: z.boolean().default(true),
  acceptsFgts: z.boolean().default(true),
  acceptsTrade: z.boolean().default(false),
  title: z.string().trim().optional().nullable(),
  shortDescription: z.string().trim().optional().nullable(),
  fullDescription: z.string().trim().optional().nullable(),
  legalNotes: z.string().trim().optional().nullable(),
  ownerId: z.string().cuid().optional().nullable(),
  photoUrls: z.array(z.string().trim().url("URL de foto inválida")).default([]),
});

export type PropertyCreateInput = z.infer<typeof propertyCreateSchema>;

export const propertyUpdateSchema = propertyCreateSchema.extend({
  id: z.string().cuid(),
  status: z.string().trim().min(1),
});

export type PropertyUpdateInput = z.infer<typeof propertyUpdateSchema>;

export const propertyInactivateSchema = z.object({
  id: z.string().cuid(),
  reason: z.string().trim().min(3, "Informe o motivo da inativação"),
});

export type PropertyInactivateInput = z.infer<typeof propertyInactivateSchema>;

export const ownerCreateSchema = z.object({
  name: z.string().trim().min(2, "Informe o nome do proprietário"),
  phone: z.string().trim().optional().nullable(),
  email: z.string().trim().email("E-mail inválido").optional().nullable().or(z.literal("")),
  document: z.string().trim().optional().nullable(),
  agreedCommissionPct: optionalNonNegativeNumber,
  adAuthorization: z.boolean().default(false),
  intermediationContract: z.boolean().default(false),
  bankData: z.string().trim().optional().nullable(),
});

export type OwnerCreateInput = z.infer<typeof ownerCreateSchema>;

// ---------------------------------------------------------------------------
// Preferências de matching (Fase 1.2)
// ---------------------------------------------------------------------------

export const requirementLevelSchema = z.enum(["obrigatoria", "desejavel", "indiferente"]);

export const contactPreferenceUpdateSchema = z.object({
  contactId: z.string().cuid(),
  intent: z.enum(["COMPRA", "VENDA", "LOCACAO", "INVESTIMENTO"]).optional().nullable(),
  desiredCity: z.string().trim().optional().nullable(),
  desiredNeighborhoods: z.array(z.string().trim()).default([]),
  propertyType: z.string().trim().optional().nullable(),
  minPrice: optionalNonNegativeNumber,
  maxPrice: optionalNonNegativeNumber,
  bedrooms: optionalNonNegativeInt,
  suites: optionalNonNegativeInt,
  parkingSpots: optionalNonNegativeInt,
  needsBackyard: z.boolean().default(false),
  needsGourmetArea: z.boolean().default(false),
  houseFormat: z.string().trim().optional().nullable(),
  condoOrOpen: z.string().trim().optional().nullable(),
  criteriaRequirements: z.record(z.string(), requirementLevelSchema).default({}),
});

export type ContactPreferenceUpdateInput = z.infer<typeof contactPreferenceUpdateSchema>;
