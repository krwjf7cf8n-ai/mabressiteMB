import { z } from "zod";
import { optionalNonNegativeNumber, optionalTrimmedString } from "./common";

export const ownerCreateSchema = z.object({
  name: z.string().trim().min(2, "Informe o nome do proprietário"),
  phone: optionalTrimmedString,
  email: z.string().trim().email("E-mail inválido").optional().nullable().or(z.literal("")),
  document: optionalTrimmedString,
  agreedCommissionPct: optionalNonNegativeNumber,
  adAuthorization: z.boolean().default(false),
  intermediationContract: z.boolean().default(false),
  bankData: optionalTrimmedString,
});

export type OwnerCreateInput = z.infer<typeof ownerCreateSchema>;
