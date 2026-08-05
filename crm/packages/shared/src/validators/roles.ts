import { z } from "zod";
import { optionalTrimmedString } from "./common";

export const roleCreateSchema = z.object({
  name: z.string().trim().min(2, "Informe o nome do papel"),
  description: optionalTrimmedString,
  permissionKeys: z.array(z.string()).default([]),
});
export type RoleCreateInput = z.infer<typeof roleCreateSchema>;

export const roleUpdateSchema = z.object({
  id: z.string().cuid(),
  expectedUpdatedAt: z.coerce.date(),
  name: z.string().trim().min(2, "Informe o nome do papel"),
  description: optionalTrimmedString,
  permissionKeys: z.array(z.string()).default([]),
});
export type RoleUpdateInput = z.infer<typeof roleUpdateSchema>;

export const roleAssignSchema = z.object({
  userId: z.string().cuid(),
  roleId: z.string().cuid(),
  expectedUpdatedAt: z.coerce.date(),
});
export type RoleAssignInput = z.infer<typeof roleAssignSchema>;
