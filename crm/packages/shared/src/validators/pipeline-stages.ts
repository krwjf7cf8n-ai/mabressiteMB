import { z } from "zod";

/** G30 (Marco 1.9, Sprint 6) — administração das etapas do funil. */
export const stageReasonRequirementSchema = z.enum(["NONE", "LOSS", "PAUSE"]);

const HEX_COLOR = /^#[0-9a-fA-F]{6}$/;

export const stageCreateSchema = z.object({
  name: z.string().trim().min(2, "Informe o nome da etapa"),
  order: z.coerce.number().int("A ordem deve ser um número inteiro").positive("A ordem deve ser maior que zero"),
  requiresReasonOn: stageReasonRequirementSchema.default("NONE"),
  color: z
    .string()
    .trim()
    .regex(HEX_COLOR, "Use uma cor no formato hexadecimal (ex.: #22C55E)")
    .optional()
    .or(z.literal(""))
    .transform((v) => (v ? v : null)),
});
export type StageCreateInput = z.infer<typeof stageCreateSchema>;

export const stageUpdateSchema = stageCreateSchema.extend({
  id: z.string().cuid(),
  expectedUpdatedAt: z.coerce.date(),
  isActive: z.boolean().default(true),
});
export type StageUpdateInput = z.infer<typeof stageUpdateSchema>;
