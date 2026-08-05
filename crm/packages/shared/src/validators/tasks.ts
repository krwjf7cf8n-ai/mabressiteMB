import { z } from "zod";
import { optionalTrimmedString } from "./common";

export const taskCreateSchema = z.object({
  title: z.string().trim().min(2),
  description: optionalTrimmedString,
  contactId: z.string().cuid().optional().nullable(),
  propertyId: z.string().cuid().optional().nullable(),
  visitId: z.string().cuid().optional().nullable(),
  assignedUserId: z.string().cuid(),
  priority: z.enum(["BAIXA", "MEDIA", "ALTA", "URGENTE"]).default("MEDIA"),
  dueAt: z.coerce.date().optional().nullable(),
  reminderAt: z.coerce.date().optional().nullable(),
  taskType: z.string().trim().min(1),
});

export type TaskCreateInput = z.infer<typeof taskCreateSchema>;

export const taskUpdateSchema = taskCreateSchema.extend({ id: z.string().cuid() });
export type TaskUpdateInput = z.infer<typeof taskUpdateSchema>;

export const taskCompleteSchema = z.object({
  id: z.string().cuid(),
  completionNotes: optionalTrimmedString,
});
export type TaskCompleteInput = z.infer<typeof taskCompleteSchema>;

export const taskCancelSchema = z.object({
  id: z.string().cuid(),
  reason: z.string().trim().min(3, "Informe o motivo do cancelamento"),
});
export type TaskCancelInput = z.infer<typeof taskCancelSchema>;

export const taskReassignSchema = z.object({
  id: z.string().cuid(),
  assignedUserId: z.string().cuid(),
});
export type TaskReassignInput = z.infer<typeof taskReassignSchema>;

/** Tipos de tarefa (enum nesta fase — ver docs/visits-tasks.md sobre a limitação). */
export const TASK_TYPE_OPTIONS = [
  { value: "ligar", label: "Ligar" },
  { value: "enviar_whatsapp", label: "Enviar WhatsApp" },
  { value: "enviar_imovel", label: "Enviar imóvel" },
  { value: "solicitar_documentos", label: "Solicitar documentos" },
  { value: "confirmar_visita", label: "Confirmar visita" },
  { value: "retornar_apos_visita", label: "Retornar após visita" },
  { value: "retornar_proposta", label: "Retornar proposta" },
  { value: "falar_com_proprietario", label: "Falar com proprietário" },
  { value: "atualizar_anuncio", label: "Atualizar anúncio" },
  { value: "verificar_financiamento", label: "Verificar financiamento" },
  { value: "pos_venda", label: "Pós-venda" },
  { value: "outro", label: "Outro" },
] as const;

/** G31 — mesmos rótulos de TASK_TYPE_OPTIONS, como Record para lookup direto por valor. */
export const TASK_TYPE_LABELS: Record<string, string> = Object.fromEntries(
  TASK_TYPE_OPTIONS.map((o) => [o.value, o.label]),
);
