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
  visitId: z.string().cuid().optional().nullable(),
  assignedUserId: z.string().cuid(),
  priority: z.enum(["BAIXA", "MEDIA", "ALTA", "URGENTE"]).default("MEDIA"),
  dueAt: z.coerce.date().optional().nullable(),
  reminderAt: z.coerce.date().optional().nullable(),
  taskType: z.string().trim().min(1),
});

export type TaskCreateInput = z.infer<typeof taskCreateSchema>;

export const taskUpdateSchema = taskCreateSchema.extend({ id: z.string().cuid() });
export type TaskUpdateInput = z.infer<typeof taskUpdateSchema>;

export const taskCompleteSchema = z.object({
  id: z.string().cuid(),
  completionNotes: z.string().trim().optional().nullable(),
});
export type TaskCompleteInput = z.infer<typeof taskCompleteSchema>;

export const taskCancelSchema = z.object({
  id: z.string().cuid(),
  reason: z.string().trim().min(3, "Informe o motivo do cancelamento"),
});
export type TaskCancelInput = z.infer<typeof taskCancelSchema>;

export const taskReassignSchema = z.object({
  id: z.string().cuid(),
  assignedUserId: z.string().cuid(),
});
export type TaskReassignInput = z.infer<typeof taskReassignSchema>;

/** Tipos de tarefa (enum nesta fase — ver docs/visits-tasks.md sobre a limitação). */
export const TASK_TYPE_OPTIONS = [
  { value: "ligar", label: "Ligar" },
  { value: "enviar_whatsapp", label: "Enviar WhatsApp" },
  { value: "enviar_imovel", label: "Enviar imóvel" },
  { value: "solicitar_documentos", label: "Solicitar documentos" },
  { value: "confirmar_visita", label: "Confirmar visita" },
  { value: "retornar_apos_visita", label: "Retornar após visita" },
  { value: "retornar_proposta", label: "Retornar proposta" },
  { value: "falar_com_proprietario", label: "Falar com proprietário" },
  { value: "atualizar_anuncio", label: "Atualizar anúncio" },
  { value: "verificar_financiamento", label: "Verificar financiamento" },
  { value: "pos_venda", label: "Pós-venda" },
  { value: "outro", label: "Outro" },
] as const;

// ---------------------------------------------------------------------------
// Visitas (Fase 1.3)
// ---------------------------------------------------------------------------

export const visitModalitySchema = z.enum(["PRESENCIAL", "VIDEO"]);

export const visitStatusSchema = z.enum([
  "AGUARDANDO_CONFIRMACAO",
  "CONFIRMADA",
  "REAGENDADA",
  "REALIZADA",
  "CANCELADA_CLIENTE",
  "CANCELADA_CORRETOR",
  "CLIENTE_NAO_COMPARECEU",
  "PROPRIETARIO_INDISPONIVEL",
]);

export const visitCreateSchema = z.object({
  contactId: z.string().cuid(),
  propertyId: z.string().cuid(),
  brokerUserId: z.string().cuid(),
  scheduledAt: z.coerce.date(),
  durationMinutes: z.coerce.number().int().positive().default(45),
  modality: visitModalitySchema.default("PRESENCIAL"),
  meetingPoint: z.string().trim().optional().nullable(),
  internalNotes: z.string().trim().optional().nullable(),
  clientInstructions: z.string().trim().optional().nullable(),
  confirmConflict: z.boolean().default(false),
  conflictJustification: z.string().trim().optional().nullable(),
  createConfirmationTask: z.boolean().default(true),
});
export type VisitCreateInput = z.infer<typeof visitCreateSchema>;

export const visitRescheduleSchema = z.object({
  id: z.string().cuid(),
  scheduledAt: z.coerce.date(),
  durationMinutes: z.coerce.number().int().positive().default(45),
  reason: z.string().trim().min(3, "Informe o motivo do reagendamento"),
  confirmConflict: z.boolean().default(false),
  conflictJustification: z.string().trim().optional().nullable(),
});
export type VisitRescheduleInput = z.infer<typeof visitRescheduleSchema>;

export const visitStatusChangeSchema = z.object({
  id: z.string().cuid(),
  toStatus: visitStatusSchema,
  reason: z.string().trim().optional().nullable(),
  allowException: z.boolean().default(false),
});
export type VisitStatusChangeInput = z.infer<typeof visitStatusChangeSchema>;

export const visitOutcomeSchema = z.object({
  id: z.string().cuid(),
  interestLevel: z.enum(["baixo", "medio", "alto"]).optional().nullable(),
  positivePoints: z.string().trim().optional().nullable(),
  objections: z.string().trim().optional().nullable(),
  rejectionReason: z.string().trim().optional().nullable(),
  intendsToPropose: z.boolean().optional().nullable(),
  needsFinancingReview: z.boolean().optional().nullable(),
  wantsToSeeOtherProperties: z.boolean().optional().nullable(),
  recommendedReturnAt: z.coerce.date().optional().nullable(),
  outcomeNotes: z.string().trim().optional().nullable(),
  clientRating: z.coerce.number().int().min(1).max(5).optional().nullable(),
  nextAction: z.string().trim().optional().nullable(),
  createFollowUpTask: z.boolean().default(false),
});
export type VisitOutcomeInput = z.infer<typeof visitOutcomeSchema>;

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
