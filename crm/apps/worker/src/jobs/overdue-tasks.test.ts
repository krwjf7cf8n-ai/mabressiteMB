import { describe, expect, it } from "vitest";
import { buildOverdueTaskNotifications } from "./overdue-tasks";

describe("buildOverdueTaskNotifications", () => {
  const today = new Date("2026-01-15T12:00:00.000Z");
  const tasks = [
    { id: "t1", title: "Ligar para cliente", assignedUserId: "u1", dueAt: new Date("2026-01-01") },
    { id: "t2", title: "Enviar proposta", assignedUserId: "u2", dueAt: new Date("2026-01-02") },
  ];

  it("gera um rascunho de notificação por tarefa vencida", () => {
    const drafts = buildOverdueTaskNotifications(tasks, today);
    expect(drafts).toHaveLength(2);
    expect(drafts[0]).toMatchObject({ userId: "u1", type: "tarefa_vencida", entityType: "Task", entityId: "t1" });
  });

  it("chave de idempotência inclui a tarefa e o dia (uma notificação por tarefa/dia)", () => {
    const drafts = buildOverdueTaskNotifications(tasks, today);
    expect(drafts[0]?.idempotencyKey).toBe("task_overdue:t1:2026-01-15");
    expect(drafts[1]?.idempotencyKey).toBe("task_overdue:t2:2026-01-15");
  });

  it("chaves diferentes em dias diferentes — permite nova notificação no dia seguinte", () => {
    const day1 = buildOverdueTaskNotifications([tasks[0]!], new Date("2026-01-15T08:00:00.000Z"));
    const day2 = buildOverdueTaskNotifications([tasks[0]!], new Date("2026-01-16T08:00:00.000Z"));
    expect(day1[0]?.idempotencyKey).not.toBe(day2[0]?.idempotencyKey);
  });

  it("retorna vazio quando não há tarefas vencidas", () => {
    expect(buildOverdueTaskNotifications([], today)).toHaveLength(0);
  });
});
