"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createNotificationIdempotent, prisma, recordAudit } from "@mabres/db";
import {
  taskCancelSchema,
  taskCompleteSchema,
  taskCreateSchema,
  taskReassignSchema,
  taskUpdateSchema,
} from "@mabres/shared";
import { requirePermission } from "@/lib/session";

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
  const task = await prisma.task.create({
    data: {
      title: data.title,
      description: data.description || null,
      contactId: data.contactId || null,
      propertyId: data.propertyId || null,
      visitId: data.visitId || null,
      assignedUserId: data.assignedUserId,
      createdByUserId: session.user.id,
      priority: data.priority,
      dueAt: data.dueAt ?? null,
      reminderAt: data.reminderAt ?? null,
      taskType: data.taskType,
      origin: "MANUAL",
    },
  });

  await recordAudit(prisma, {
    entityType: "Task",
    entityId: task.id,
    action: "create",
    actorType: "USER",
    actorUserId: session.user.id,
    after: {
      title: task.title,
      assignedUserId: task.assignedUserId,
      taskType: task.taskType,
      status: task.status,
      dueAt: task.dueAt?.toISOString() ?? null,
      origin: task.origin,
    },
  });

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

  await prisma.task.update({
    where: { id: data.id },
    data: {
      title: data.title,
      description: data.description || null,
      contactId: data.contactId || null,
      propertyId: data.propertyId || null,
      priority: data.priority,
      dueAt: data.dueAt ?? null,
      reminderAt: data.reminderAt ?? null,
      taskType: data.taskType,
    },
  });

  await recordAudit(prisma, {
    entityType: "Task",
    entityId: data.id,
    action: "update",
    actorType: "USER",
    actorUserId: session.user.id,
    before: { title: current.title, dueAt: current.dueAt, priority: current.priority },
    after: { title: data.title, dueAt: data.dueAt ?? null, priority: data.priority },
  });

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

  await prisma.task.update({
    where: { id },
    data: {
      status: "CONCLUIDA",
      completedAt: new Date(),
      completedByUserId: session.user.id,
      description: completionNotes ? `${task.description ?? ""}\n\nConclusão: ${completionNotes}`.trim() : task.description,
    },
  });

  await recordAudit(prisma, {
    entityType: "Task",
    entityId: id,
    action: "complete",
    actorType: "USER",
    actorUserId: session.user.id,
    before: { status: task.status },
    after: { status: "CONCLUIDA", completedByUserId: session.user.id },
  });

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

  await prisma.task.update({
    where: { id },
    data: { status: "CANCELADA", cancellationReason: reason },
  });

  await recordAudit(prisma, {
    entityType: "Task",
    entityId: id,
    action: "cancel",
    actorType: "USER",
    actorUserId: session.user.id,
    before: { status: task.status },
    after: { status: "CANCELADA", reason },
  });

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

  await prisma.task.update({
    where: { id },
    data: { status: "PENDENTE", completedAt: null, completedByUserId: null, cancellationReason: null },
  });

  await recordAudit(prisma, {
    entityType: "Task",
    entityId: id,
    action: "reopen",
    actorType: "USER",
    actorUserId: session.user.id,
    before: { status: task.status },
    after: { status: "PENDENTE" },
  });

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

  await prisma.task.update({ where: { id }, data: { assignedUserId } });

  await recordAudit(prisma, {
    entityType: "Task",
    entityId: id,
    action: "reassign",
    actorType: "USER",
    actorUserId: session.user.id,
    before: { assignedUserId: task.assignedUserId },
    after: { assignedUserId },
  });

  await createNotificationIdempotent(prisma, {
    userId: assignedUserId,
    type: "responsavel_alterado",
    title: "Tarefa atribuída a você",
    body: `A tarefa "${task.title}" agora está sob sua responsabilidade.`,
    entityType: "Task",
    entityId: id,
    idempotencyKey: `task_reassigned:${id}:${assignedUserId}:${Date.now()}`,
  });

  revalidatePath(`/tasks/${id}`);
  revalidatePath("/tasks");
}
