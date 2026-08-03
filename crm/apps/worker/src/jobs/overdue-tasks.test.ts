import { describe, expect, it } from "vitest";
import { buildOverdueTaskNotifications } from "./overdue-tasks";

describe("buildOverdueTaskNotifications", () => {
  const tasks = [
    { id: "t1", title: "Ligar para cliente", assignedUserId: "u1", dueAt: new Date("2026-01-01") },
    { id: "t2", title: "Enviar proposta", assignedUserId: "u2", dueAt: new Date("2026-01-02") },
  ];

  it("gera notificação apenas para tarefas ainda não notificadas", () => {
    const drafts = buildOverdueTaskNotifications(tasks, new Set(["t1"]));
    expect(drafts).toHaveLength(1);
    expect(drafts[0]).toMatchObject({ taskId: "t2", userId: "u2", type: "tarefa_vencida" });
  });

  it("não gera nada quando todas já foram notificadas", () => {
    const drafts = buildOverdueTaskNotifications(tasks, new Set(["t1", "t2"]));
    expect(drafts).toHaveLength(0);
  });

  it("gera para todas quando nenhuma foi notificada ainda", () => {
    const drafts = buildOverdueTaskNotifications(tasks, new Set());
    expect(drafts).toHaveLength(2);
  });
});
