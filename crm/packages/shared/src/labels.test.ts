import { describe, expect, it } from "vitest";
import {
  CONTACT_ORIGIN_LABELS,
  PROPERTY_STATUS_LABELS,
  TASK_ORIGIN_LABELS,
  TASK_PRIORITY_LABELS,
  TASK_STATUS_LABELS,
  VISIT_MODALITY_LABELS,
  VISIT_ORIGIN_LABELS,
  VISIT_STATUS_LABELS,
} from "./labels";

/**
 * G31 (Marco 1.9, Sprint 6) — cada valor de enum do schema precisa de um
 * rótulo em PT-BR; este teste trava a lista de chaves esperadas para que uma
 * mudança futura no schema (novo valor de enum) não passe silenciosamente
 * sem rótulo (o app já degrada bem com `?? valorCru`, mas isso é exatamente
 * o comportamento técnico que o G31 queria eliminar da tela).
 */
describe("labels — rótulos PT-BR dos enums exibidos ao usuário", () => {
  it("TASK_STATUS_LABELS cobre todos os valores de TaskStatus", () => {
    expect(Object.keys(TASK_STATUS_LABELS).sort()).toEqual(["CANCELADA", "CONCLUIDA", "EM_ANDAMENTO", "PENDENTE"]);
  });

  it("TASK_PRIORITY_LABELS cobre todos os valores de TaskPriority", () => {
    expect(Object.keys(TASK_PRIORITY_LABELS).sort()).toEqual(["ALTA", "BAIXA", "MEDIA", "URGENTE"]);
  });

  it("TASK_ORIGIN_LABELS cobre todos os valores de TaskOrigin", () => {
    expect(Object.keys(TASK_ORIGIN_LABELS).sort()).toEqual(["AUTOMACAO", "INTEGRACAO", "MANUAL", "VISITA"]);
  });

  it("VISIT_STATUS_LABELS cobre todos os valores de VisitStatus", () => {
    expect(Object.keys(VISIT_STATUS_LABELS).sort()).toEqual([
      "AGUARDANDO_CONFIRMACAO",
      "CANCELADA_CLIENTE",
      "CANCELADA_CORRETOR",
      "CLIENTE_NAO_COMPARECEU",
      "CONFIRMADA",
      "PROPRIETARIO_INDISPONIVEL",
      "REAGENDADA",
      "REALIZADA",
    ]);
  });

  it("VISIT_MODALITY_LABELS cobre todos os valores de VisitModality", () => {
    expect(Object.keys(VISIT_MODALITY_LABELS).sort()).toEqual(["PRESENCIAL", "VIDEO"]);
  });

  it("VISIT_ORIGIN_LABELS cobre os valores usados em Visit.origin", () => {
    expect(Object.keys(VISIT_ORIGIN_LABELS).sort()).toEqual(["automacao", "integracao", "manual"]);
  });

  it("CONTACT_ORIGIN_LABELS cobre todos os valores de ContactOrigin", () => {
    expect(Object.keys(CONTACT_ORIGIN_LABELS).sort()).toEqual([
      "IMPORTACAO",
      "INDICACAO",
      "MANUAL",
      "META_LEAD_ADS",
      "OUTRO",
      "SITE",
      "WHATSAPP",
    ]);
  });

  it("PROPERTY_STATUS_LABELS cobre todos os valores de PropertyStatus", () => {
    expect(Object.keys(PROPERTY_STATUS_LABELS).sort()).toEqual([
      "alugado",
      "ativo",
      "inativo",
      "indisponivel",
      "suspenso",
      "vendido",
    ]);
  });

  it("nenhum rótulo fica igual ao valor cru do enum (senão não é uma tradução)", () => {
    const allMaps = [
      TASK_STATUS_LABELS,
      TASK_PRIORITY_LABELS,
      TASK_ORIGIN_LABELS,
      VISIT_STATUS_LABELS,
      VISIT_MODALITY_LABELS,
      VISIT_ORIGIN_LABELS,
      CONTACT_ORIGIN_LABELS,
      PROPERTY_STATUS_LABELS,
    ];
    for (const map of allMaps) {
      for (const [key, label] of Object.entries(map)) {
        expect(label).not.toBe(key);
      }
    }
  });
});
