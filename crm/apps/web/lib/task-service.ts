import { createNotificationIdempotent, recordAudit, type PrismaClient } from "@mabres/db";
import type { TaskCreateInput, TaskUpdateInput } from "@mabres/shared";

export async function createTask(client: PrismaClient, data: TaskCreateInput, actorUserId: string) {
  const task = await client.task.create({
    data: {
      title: data.title,
      description: data.description || null,
      contactId: data.contactId || null,
      propertyId: data.propertyId || null,
      visitId: data.visitId || null,
      assignedUserId: data.assignedUserId,
      createdByUserId: actorUserId,
      priority: data.priority,
      dueAt: data.dueAt ?? null,
      reminderAt: data.reminderAt ?? null,
      taskType: data.taskType,
      origin: "MANUAL",
    },
  });

  await recordAudit(client, {
    entityType: "Task",
    entityId: task.id,
    action: "create",
    actorType: "USER",
    actorUserId,
    after: {
      title: task.title,
      assignedUserId: task.assignedUserId,
      taskType: task.taskType,
      status: task.status,
      dueAt: task.dueAt?.toISOString() ?? null,
      origin: task.origin,
    },
  });

  return task;
}

export async function updateTask(
  client: PrismaClient,
  data: TaskUpdateInput,
  current: { title: string; dueAt: Date | null; priority: string },
  actorUserId: string,
) {
  await client.task.update({
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

  await recordAudit(client, {
    entityType: "Task",
    entityId: data.id,
    action: "update",
    actorType: "USER",
    actorUserId,
    before: { title: current.title, dueAt: current.dueAt, priority: current.priority },
    after: { title: data.title, dueAt: data.dueAt ?? null, priority: data.priority },
  });
}

export async function completeTask(
  client: PrismaClient,
  task: { id: string; status: string; description: string | null },
  completionNotes: string | null | undefined,
  actorUserId: string,
) {
  await client.task.update({
    where: { id: task.id },
    data: {
      status: "CONCLUIDA",
      completedAt: new Date(),
      completedByUserId: actorUserId,
      description: completionNotes ? `${task.description ?? ""}\n\nConclusão: ${completionNotes}`.trim() : task.description,
    },
  });

  await recordAudit(client, {
    entityType: "Task",
    entityId: task.id,
    action: "complete",
    actorType: "USER",
    actorUserId,
    before: { status: task.status },
    after: { status: "CONCLUIDA", completedByUserId: actorUserId },
  });
}

export async function cancelTask(
  client: PrismaClient,
  task: { id: string; status: string },
  reason: string,
  actorUserId: string,
) {
  await client.task.update({ where: { id: task.id }, data: { status: "CANCELADA", cancellationReason: reason } });

  await recordAudit(client, {
    entityType: "Task",
    entityId: task.id,
    action: "cancel",
    actorType: "USER",
    actorUserId,
    before: { status: task.status },
    after: { status: "CANCELADA", reason },
  });
}

export async function reopenTask(client: PrismaClient, task: { id: string; status: string }, actorUserId: string) {
  await client.task.update({
    where: { id: task.id },
    data: { status: "PENDENTE", completedAt: null, completedByUserId: null, cancellationReason: null },
  });

  await recordAudit(client, {
    entityType: "Task",
    entityId: task.id,
    action: "reopen",
    actorType: "USER",
    actorUserId,
    before: { status: task.status },
    after: { status: "PENDENTE" },
  });
}

export async function reassignTask(
  client: PrismaClient,
  task: { id: string; title: string; assignedUserId: string },
  assignedUserId: string,
  actorUserId: string,
) {
  await client.task.update({ where: { id: task.id }, data: { assignedUserId } });

  await recordAudit(client, {
    entityType: "Task",
    entityId: task.id,
    action: "reassign",
    actorType: "USER",
    actorUserId,
    before: { assignedUserId: task.assignedUserId },
    after: { assignedUserId },
  });

  await createNotificationIdempotent(client, {
    userId: assignedUserId,
    type: "responsavel_alterado",
    title: "Tarefa atribuída a você",
    body: `A tarefa "${task.title}" agora está sob sua responsabilidade.`,
    entityType: "Task",
    entityId: task.id,
    idempotencyKey: `task_reassigned:${task.id}:${assignedUserId}:${Date.now()}`,
  });
}
