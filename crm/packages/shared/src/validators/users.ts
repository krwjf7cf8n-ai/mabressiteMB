import { z } from "zod";
import { optionalTrimmedString } from "./common";

export const passwordPolicySchema = z
  .string()
  .min(10, "A senha deve ter pelo menos 10 caracteres")
  .regex(/[a-zA-Z]/, "A senha deve conter ao menos uma letra")
  .regex(/[0-9]/, "A senha deve conter ao menos um número");

export const userCreateSchema = z.object({
  name: z.string().trim().min(2, "Informe o nome completo"),
  email: z.string().trim().toLowerCase().email("E-mail inválido"),
  phone: optionalTrimmedString,
  roleId: z.string().cuid("Selecione um papel"),
});
export type UserCreateInput = z.infer<typeof userCreateSchema>;

export const userUpdateSchema = z.object({
  id: z.string().cuid(),
  name: z.string().trim().min(2, "Informe o nome completo"),
  phone: optionalTrimmedString,
});
export type UserUpdateInput = z.infer<typeof userUpdateSchema>;

/** O próprio usuário só pode alterar nome/telefone — nunca papel, status ou permissões. */
export const selfProfileUpdateSchema = z.object({
  name: z.string().trim().min(2, "Informe o nome completo"),
  phone: optionalTrimmedString,
});
export type SelfProfileUpdateInput = z.infer<typeof selfProfileUpdateSchema>;

export const userDisableSchema = z.object({
  id: z.string().cuid(),
  reason: z.string().trim().min(3, "Informe o motivo da desativação"),
});
export type UserDisableInput = z.infer<typeof userDisableSchema>;

export const userReactivateSchema = z.object({ id: z.string().cuid() });

export const adminResetPasswordSchema = z.object({
  id: z.string().cuid(),
  forceChange: z.boolean().default(true),
});

export const selfChangePasswordSchema = z.object({
  currentPassword: z.string().min(1, "Informe a senha atual"),
  newPassword: passwordPolicySchema,
});
export type SelfChangePasswordInput = z.infer<typeof selfChangePasswordSchema>;

export const sessionTerminateSchema = z.object({
  sessionId: z.string().cuid(),
  userId: z.string().cuid(),
});

export const reassignRecordsSchema = z.object({
  fromUserId: z.string().cuid(),
  toUserId: z.string().cuid(),
  reassignContacts: z.boolean().default(false),
  reassignTasks: z.boolean().default(false),
  reassignVisits: z.boolean().default(false),
  reassignProperties: z.boolean().default(false),
});
export type ReassignRecordsInput = z.infer<typeof reassignRecordsSchema>;
