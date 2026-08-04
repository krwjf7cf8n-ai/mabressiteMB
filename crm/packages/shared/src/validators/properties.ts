import { z } from "zod";
import { optionalNonNegativeInt, optionalNonNegativeNumber, optionalTrimmedString } from "./common";

export const propertyPurposeSchema = z.enum(["VENDA", "LOCACAO", "AMBAS"]);

export const propertyCreateSchema = z.object({
  purpose: propertyPurposeSchema.default("VENDA"),
  propertyType: z.string().trim().min(1, "Informe o tipo do imóvel"),
  externalRef: optionalTrimmedString,
  addressLine: optionalTrimmedString,
  number: optionalTrimmedString,
  complement: optionalTrimmedString,
  neighborhood: optionalTrimmedString,
  city: z.string().trim().min(1, "Informe a cidade").default("Sorocaba"),
  state: z.string().trim().length(2, "Use a sigla do estado (ex.: SP)").default("SP"),
  zipCode: optionalTrimmedString,
  condoName: optionalTrimmedString,
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
  title: optionalTrimmedString,
  shortDescription: optionalTrimmedString,
  fullDescription: optionalTrimmedString,
  legalNotes: optionalTrimmedString,
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
