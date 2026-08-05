import { describe, expect, it } from "vitest";
import { buildUpcomingVisitNotifications } from "./upcoming-visits";

describe("buildUpcomingVisitNotifications", () => {
  it("gera uma notificação por visita com chave de idempotência estável (não por hora do worker)", () => {
    const visits = [
      { id: "v1", scheduledAt: new Date("2026-01-15T14:00:00Z"), brokerUserId: "u1", contactName: "Ana", propertyCode: "MB-1" },
    ];
    const drafts = buildUpcomingVisitNotifications(visits);
    expect(drafts).toHaveLength(1);
    expect(drafts[0]).toMatchObject({ userId: "u1", entityType: "Visit", entityId: "v1", idempotencyKey: "visit_upcoming:v1" });
  });

  it("chave de idempotência não muda entre chamadas para a mesma visita (evita duplicar a cada execução do job)", () => {
    const visit = { id: "v1", scheduledAt: new Date(), brokerUserId: "u1", contactName: "Ana", propertyCode: "MB-1" };
    const first = buildUpcomingVisitNotifications([visit]);
    const second = buildUpcomingVisitNotifications([visit]);
    expect(first[0]?.idempotencyKey).toBe(second[0]?.idempotencyKey);
  });
});
