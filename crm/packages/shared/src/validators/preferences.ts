import { z } from "zod";
import { optionalNonNegativeInt, optionalNonNegativeNumber, optionalTrimmedString } from "./common";

export const requirementLevelSchema = z.enum(["obrigatoria", "desejavel", "indiferente"]);

export const contactPreferenceUpdateSchema = z.object({
  contactId: z.string().cuid(),
  intent: z.enum(["COMPRA", "VENDA", "LOCACAO", "INVESTIMENTO"]).optional().nullable(),
  desiredCity: optionalTrimmedString,
  desiredNeighborhoods: z.array(z.string().trim()).default([]),
  propertyType: optionalTrimmedString,
  minPrice: optionalNonNegativeNumber,
  maxPrice: optionalNonNegativeNumber,
  bedrooms: optionalNonNegativeInt,
  suites: optionalNonNegativeInt,
  parkingSpots: optionalNonNegativeInt,
  needsBackyard: z.boolean().default(false),
  needsGourmetArea: z.boolean().default(false),
  houseFormat: optionalTrimmedString,
  condoOrOpen: optionalTrimmedString,
  criteriaRequirements: z.record(z.string(), requirementLevelSchema).default({}),
});

export type ContactPreferenceUpdateInput = z.infer<typeof contactPreferenceUpdateSchema>;
