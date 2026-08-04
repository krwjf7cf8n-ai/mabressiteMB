import { z } from "zod";
import { expectedUpdatedAtField, optionalTrimmedString } from "./common";

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
  meetingPoint: optionalTrimmedString,
  internalNotes: optionalTrimmedString,
  clientInstructions: optionalTrimmedString,
  confirmConflict: z.boolean().default(false),
  conflictJustification: optionalTrimmedString,
  createConfirmationTask: z.boolean().default(true),
});
export type VisitCreateInput = z.infer<typeof visitCreateSchema>;

export const visitRescheduleSchema = z.object({
  id: z.string().cuid(),
  expectedUpdatedAt: expectedUpdatedAtField,
  scheduledAt: z.coerce.date(),
  durationMinutes: z.coerce.number().int().positive().default(45),
  reason: z.string().trim().min(3, "Informe o motivo do reagendamento"),
  confirmConflict: z.boolean().default(false),
  conflictJustification: optionalTrimmedString,
});
export type VisitRescheduleInput = z.infer<typeof visitRescheduleSchema>;

export const visitStatusChangeSchema = z.object({
  id: z.string().cuid(),
  expectedUpdatedAt: expectedUpdatedAtField,
  toStatus: visitStatusSchema,
  reason: optionalTrimmedString,
  allowException: z.boolean().default(false),
});
export type VisitStatusChangeInput = z.infer<typeof visitStatusChangeSchema>;

export const visitOutcomeSchema = z.object({
  id: z.string().cuid(),
  expectedUpdatedAt: expectedUpdatedAtField,
  interestLevel: z.enum(["baixo", "medio", "alto"]).optional().nullable(),
  positivePoints: optionalTrimmedString,
  objections: optionalTrimmedString,
  rejectionReason: optionalTrimmedString,
  intendsToPropose: z.boolean().optional().nullable(),
  needsFinancingReview: z.boolean().optional().nullable(),
  wantsToSeeOtherProperties: z.boolean().optional().nullable(),
  recommendedReturnAt: z.coerce.date().optional().nullable(),
  outcomeNotes: optionalTrimmedString,
  clientRating: z.coerce.number().int().min(1).max(5).optional().nullable(),
  nextAction: optionalTrimmedString,
  createFollowUpTask: z.boolean().default(false),
});
export type VisitOutcomeInput = z.infer<typeof visitOutcomeSchema>;

export const visitReassignSchema = z.object({
  id: z.string().cuid(),
  expectedUpdatedAt: expectedUpdatedAtField,
  brokerUserId: z.string().cuid(),
});
export type VisitReassignInput = z.infer<typeof visitReassignSchema>;
