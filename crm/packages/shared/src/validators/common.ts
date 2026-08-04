import { z } from "zod";

/**
 * Campo de texto opcional/nulável — o padrão usado em quase todo formulário
 * do CRM para um campo de texto livre que não é obrigatório. Era repetido
 * inline (`z.string().trim().optional().nullable()`) dezenas de vezes.
 */
export const optionalTrimmedString = z.string().trim().optional().nullable();

export function emptyToUndefined(value: unknown) {
  return value === "" || value === null ? undefined : value;
}

export const optionalNonNegativeNumber = z.preprocess(
  emptyToUndefined,
  z.coerce.number().nonnegative("Deve ser zero ou maior").optional(),
);

export const optionalNonNegativeInt = z.preprocess(
  emptyToUndefined,
  z.coerce.number().int("Deve ser um número inteiro").nonnegative("Deve ser zero ou maior").optional(),
);

/** Toda mutação de um registro já existente carrega o updatedAt lido pela tela — usado para concorrência otimista. */
export const expectedUpdatedAtField = z.coerce.date();
