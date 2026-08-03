import { describe, expect, it } from "vitest";
import {
  canTransitionVisit,
  computeVisitEndsAt,
  findVisitConflicts,
  isVisitTerminal,
  VISIT_TERMINAL_STATUSES,
  type VisitConflictCandidate,
} from "./visit-domain";

describe("canTransitionVisit — máquina de estados", () => {
  it.each([
    ["AGUARDANDO_CONFIRMACAO", "CONFIRMADA"],
    ["AGUARDANDO_CONFIRMACAO", "CANCELADA_CLIENTE"],
    ["CONFIRMADA", "REALIZADA"],
    ["CONFIRMADA", "REAGENDADA"],
    ["CONFIRMADA", "CLIENTE_NAO_COMPARECEU"],
    ["REAGENDADA", "CONFIRMADA"],
    ["CLIENTE_NAO_COMPARECEU", "REAGENDADA"],
    ["PROPRIETARIO_INDISPONIVEL", "REAGENDADA"],
  ] as const)("permite %s -> %s", (from, to) => {
    expect(canTransitionVisit(from, to)).toBe(true);
  });

  it.each([
    ["REALIZADA", "CONFIRMADA"],
    ["CANCELADA_CLIENTE", "CONFIRMADA"],
    ["CANCELADA_CORRETOR", "AGUARDANDO_CONFIRMACAO"],
    ["AGUARDANDO_CONFIRMACAO", "REALIZADA"], // não pode pular direto para realizada
  ] as const)("bloqueia %s -> %s sem exceção", (from, to) => {
    expect(canTransitionVisit(from, to)).toBe(false);
  });

  it("não permite transição para o mesmo status", () => {
    expect(canTransitionVisit("CONFIRMADA", "CONFIRMADA")).toBe(false);
  });

  it("estados terminais só saem com allowException explícito", () => {
    expect(canTransitionVisit("REALIZADA", "CONFIRMADA")).toBe(false);
    expect(canTransitionVisit("REALIZADA", "CONFIRMADA", { allowException: true })).toBe(true);
    expect(canTransitionVisit("CANCELADA_CLIENTE", "AGUARDANDO_CONFIRMACAO", { allowException: true })).toBe(true);
  });

  it("VISIT_TERMINAL_STATUSES lista exatamente os 3 estados finais esperados", () => {
    expect(VISIT_TERMINAL_STATUSES.sort()).toEqual(["CANCELADA_CLIENTE", "CANCELADA_CORRETOR", "REALIZADA"].sort());
    expect(isVisitTerminal("REALIZADA")).toBe(true);
    expect(isVisitTerminal("CONFIRMADA")).toBe(false);
  });
});

describe("computeVisitEndsAt", () => {
  it("soma a duração em minutos ao horário de início", () => {
    const start = new Date("2026-03-10T14:00:00.000Z");
    expect(computeVisitEndsAt(start, 45).toISOString()).toBe("2026-03-10T14:45:00.000Z");
  });

  it("atravessa a virada do dia corretamente", () => {
    const start = new Date("2026-03-10T23:40:00.000Z");
    expect(computeVisitEndsAt(start, 30).toISOString()).toBe("2026-03-11T00:10:00.000Z");
  });
});

describe("findVisitConflicts", () => {
  const base: VisitConflictCandidate = {
    id: undefined,
    contactId: "contact-1",
    propertyId: "property-1",
    brokerUserId: "broker-1",
    scheduledAt: new Date("2026-03-10T14:00:00.000Z"),
    durationMinutes: 45,
    status: "AGUARDANDO_CONFIRMACAO",
  };

  it("detecta conflito de corretor em horário idêntico", () => {
    const existing: VisitConflictCandidate = {
      ...base,
      id: "v1",
      contactId: "contact-2",
      propertyId: "property-2",
    };
    const reasons = findVisitConflicts(base, [existing]);
    expect(reasons).toEqual([{ visitId: "v1", type: "corretor" }]);
  });

  it("detecta conflito de cliente e de imóvel simultaneamente quando aplicável", () => {
    const existing: VisitConflictCandidate = { ...base, id: "v1", brokerUserId: "broker-2" };
    const reasons = findVisitConflicts(base, [existing]);
    const types = reasons.map((r) => r.type).sort();
    expect(types).toEqual(["cliente", "imovel"]);
  });

  it("detecta sobreposição parcial (visita existente termina depois que a nova começa)", () => {
    const existing: VisitConflictCandidate = {
      ...base,
      id: "v1",
      scheduledAt: new Date("2026-03-10T13:30:00.000Z"), // termina 14:15, candidata começa 14:00
    };
    const reasons = findVisitConflicts(base, [existing]);
    expect(reasons.length).toBeGreaterThan(0);
  });

  it("não detecta conflito quando os horários não se sobrepõem", () => {
    const existing: VisitConflictCandidate = {
      ...base,
      id: "v1",
      scheduledAt: new Date("2026-03-10T15:00:00.000Z"), // 1h depois, sem sobreposição
    };
    expect(findVisitConflicts(base, [existing])).toHaveLength(0);
  });

  it("respeita intervalo mínimo configurável entre visitas do mesmo corretor", () => {
    const existing: VisitConflictCandidate = {
      ...base,
      id: "v1",
      contactId: "contact-2",
      propertyId: "property-2",
      scheduledAt: new Date("2026-03-10T14:45:00.000Z"), // começa exatamente quando a candidata termina
    };
    expect(findVisitConflicts(base, [existing], 0)).toHaveLength(0);
    expect(findVisitConflicts(base, [existing], 15)).toHaveLength(1); // com 15 min de intervalo mínimo, conflita
  });

  it("ignora a própria visita ao reagendar (não conflita consigo mesma)", () => {
    const self: VisitConflictCandidate = { ...base, id: "v1" };
    const candidate: VisitConflictCandidate = { ...base, id: "v1", scheduledAt: new Date("2026-03-10T14:10:00.000Z") };
    expect(findVisitConflicts(candidate, [self])).toHaveLength(0);
  });

  it("ignora visitas canceladas ou já realizadas ao calcular conflito", () => {
    const cancelled: VisitConflictCandidate = { ...base, id: "v1", status: "CANCELADA_CLIENTE" };
    const done: VisitConflictCandidate = { ...base, id: "v2", status: "REALIZADA" };
    expect(findVisitConflicts(base, [cancelled, done])).toHaveLength(0);
  });

  it("visita atravessando a meia-noite ainda é comparada corretamente", () => {
    const lateCandidate: VisitConflictCandidate = {
      ...base,
      scheduledAt: new Date("2026-03-10T23:50:00.000Z"),
      durationMinutes: 30, // termina 00:20 do dia seguinte
    };
    const conflicting: VisitConflictCandidate = {
      ...base,
      id: "v1",
      scheduledAt: new Date("2026-03-11T00:05:00.000Z"),
    };
    const nonConflicting: VisitConflictCandidate = {
      ...base,
      id: "v2",
      scheduledAt: new Date("2026-03-11T01:00:00.000Z"),
    };
    // corretor, cliente e imóvel coincidem nesse cenário (todos herdados de `base`) — as 3 dimensões conflitam
    expect(findVisitConflicts(lateCandidate, [conflicting]).length).toBeGreaterThan(0);
    expect(findVisitConflicts(lateCandidate, [nonConflicting])).toHaveLength(0);
  });
});
