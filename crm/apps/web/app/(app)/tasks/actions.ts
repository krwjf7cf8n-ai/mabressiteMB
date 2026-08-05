"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "@mabres/db";
import {
  taskCancelSchema,
  taskCompleteSchema,
  taskCreateSchema,
  taskReassignSchema,
  taskUpdateSchema,
} from "@mabres/shared";
import { requirePermission } from "@/lib/session";
import { cancelTask, completeTask, createTask, reassignTask, reopenTask, updateTask } from "@/lib/task-service";

function readTaskForm(formData: FormData) {
  return {
    title: formData.get("title"),
    description: formData.get("description") || null,
    contactId: formData.get("contactId") || null,
    propertyId: formData.get("propertyId") || null,
    visitId: formData.get("visitId") || null,
    assignedUserId: formData.get("assignedUserId"),
    priority: formData.get("priority") || "MEDIA",
    dueAt: formData.get("dueAt") || null,
    reminderAt: formData.get("reminderAt") || null,
    taskType: formData.get("taskType"),
  };
}

export async function createTaskAction(formData: FormData) {
  const session = await requirePermission("tasks:create");

  const parsed = taskCreateSchema.safeParse(readTaskForm(formData));
  if (!parsed.success) {
    redirect(`/tasks/new?error=${encodeURIComponent(parsed.error.issues[0]?.message ?? "Dados inválidos")}`);
  }

  const data = parsed.data;
  const task = await createTask(prisma, data, session.user.id);

  revalidatePath("/tasks");
  redirect(`/tasks/${task.id}`);
}

export async function updateTaskAction(formData: FormData) {
  const session = await requirePermission("tasks:update");
  const id = String(formData.get("id") ?? "");

  const parsed = taskUpdateSchema.safeParse({ ...readTaskForm(formData), id });
  if (!parsed.success) {
    redirect(`/tasks/${id}?error=${encodeURIComponent(parsed.error.issues[0]?.message ?? "Dados inválidos")}`);
  }

  const data = parsed.data;
  const current = await prisma.task.findUniqueOrThrow({ where: { id: data.id } });

  await updateTask(prisma, data, current, session.user.id);

  revalidatePath(`/tasks/${data.id}`);
  revalidatePath("/tasks");
}

export async function completeTaskAction(formData: FormData) {
  const session = await requirePermission("tasks:complete");

  const parsed = taskCompleteSchema.safeParse({
    id: formData.get("id"),
    completionNotes: formData.get("completionNotes") || null,
  });
  if (!parsed.success) {
    const id = String(formData.get("id") ?? "");
    redirect(`/tasks/${id}?error=${encodeURIComponent("Dados inválidos")}`);
  }

  const { id, completionNotes } = parsed.data;
  const task = await prisma.task.findUniqueOrThrow({ where: { id } });

  // Usuário comum só conclui a própria tarefa; concluir em nome de outro exige visão de equipe.
  if (task.assignedUserId !== session.user.id && !session.user.permissions.includes("tasks:view_all")) {
    throw new Error("Você não pode concluir uma tarefa atribuída a outro usuário.");
  }

  if (task.status === "CONCLUIDA") {
    redirect(`/tasks/${id}`);
  }

  await completeTask(prisma, task, completionNotes, session.user.id);

  revalidatePath(`/tasks/${id}`);
  revalidatePath("/tasks");
}

export async function cancelTaskAction(formData: FormData) {
  const session = await requirePermission("tasks:cancel");

  const parsed = taskCancelSchema.safeParse({ id: formData.get("id"), reason: formData.get("reason") });
  if (!parsed.success) {
    const id = String(formData.get("id") ?? "");
    redirect(`/tasks/${id}?error=${encodeURIComponent(parsed.error.issues[0]?.message ?? "Informe o motivo")}`);
  }

  const { id, reason } = parsed.data;
  const task = await prisma.task.findUniqueOrThrow({ where: { id } });

  await cancelTask(prisma, task, reason, session.user.id);

  revalidatePath(`/tasks/${id}`);
  revalidatePath("/tasks");
}

export async function reopenTaskAction(formData: FormData) {
  const session = await requirePermission("tasks:update");
  const id = String(formData.get("id") ?? "");
  const task = await prisma.task.findUniqueOrThrow({ where: { id } });

  if (task.status !== "CONCLUIDA" && task.status !== "CANCELADA") {
    redirect(`/tasks/${id}`);
  }

  await reopenTask(prisma, task, session.user.id);

  revalidatePath(`/tasks/${id}`);
  revalidatePath("/tasks");
}

export async function reassignTaskAction(formData: FormData) {
  const session = await requirePermission("tasks:reassign");

  const parsed = taskReassignSchema.safeParse({
    id: formData.get("id"),
    assignedUserId: formData.get("assignedUserId"),
  });
  if (!parsed.success) {
    const id = String(formData.get("id") ?? "");
    redirect(`/tasks/${id}?error=${encodeURIComponent("Dados inválidos")}`);
  }

  const { id, assignedUserId } = parsed.data;
  const task = await prisma.task.findUniqueOrThrow({ where: { id } });

  await reassignTask(prisma, task, assignedUserId, session.user.id);

  revalidatePath(`/tasks/${id}`);
  revalidatePath("/tasks");
}
