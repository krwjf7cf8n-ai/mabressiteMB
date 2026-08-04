import { z } from "zod";
import { optionalTrimmedString } from "./common";

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
  phone: optionalTrimmedString,
  whatsapp: optionalTrimmedString,
  email: z.string().trim().email("E-mail inválido").optional().nullable().or(z.literal("")),
  city: optionalTrimmedString,
  state: z.string().trim().length(2).optional().nullable(),
  origin: contactOriginSchema.default("MANUAL"),
  notes: optionalTrimmedString,
  consentGiven: z.boolean().default(false),
  consentOrigin: optionalTrimmedString,
});

export type ContactCreateInput = z.infer<typeof contactCreateSchema>;

export const stageChangeSchema = z.object({
  contactId: z.string().cuid(),
  toStageId: z.string().cuid(),
  comment: optionalTrimmedString,
  reason: optionalTrimmedString,
});

export type StageChangeInput = z.infer<typeof stageChangeSchema>;
