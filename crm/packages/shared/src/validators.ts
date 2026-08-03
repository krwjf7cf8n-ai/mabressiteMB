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
