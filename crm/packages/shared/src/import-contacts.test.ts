import { describe, expect, it } from "vitest";
import {
  findMappingConflicts,
  suggestColumnMapping,
  validateAndNormalizeContactRow,
  type ContactImportLookups,
} from "./import-contacts";

const emptyLookups: ContactImportLookups = {
  stagesByName: new Map(),
  usersByNameOrEmail: new Map(),
};

describe("suggestColumnMapping", () => {
  it("sugere mapeamento automático a partir de cabeçalhos comuns", () => {
    const mapping = suggestColumnMapping(["Nome", "Telefone", "E-mail", "Cidade", "Corretor Responsável"]);
    expect(mapping.Nome).toBe("name");
    expect(mapping.Telefone).toBe("phone");
    expect(mapping["E-mail"]).toBe("email");
    expect(mapping.Cidade).toBe("city");
    expect(mapping["Corretor Responsável"]).toBe("ownerUserName");
  });

  it("não mapeia coluna não reconhecida", () => {
    const mapping = suggestColumnMapping(["Coluna Estranha XYZ"]);
    expect(mapping["Coluna Estranha XYZ"]).toBeUndefined();
  });

  it("não atribui duas colunas de origem ao mesmo campo de destino automaticamente", () => {
    const mapping = suggestColumnMapping(["Telefone", "Fone"]);
    const targets = Object.values(mapping);
    expect(targets.filter((t) => t === "phone")).toHaveLength(1);
  });
});

describe("findMappingConflicts", () => {
  it("detecta quando duas colunas apontam para o mesmo campo de destino", () => {
    const conflicts = findMappingConflicts({ ColunaA: "phone", ColunaB: "phone" });
    expect(conflicts).toEqual([{ target: "phone", sourceColumns: ["ColunaA", "ColunaB"] }]);
  });

  it("não reporta conflito quando o mapeamento é 1:1", () => {
    expect(findMappingConflicts({ ColunaA: "phone", ColunaB: "email" })).toEqual([]);
  });
});

describe("validateAndNormalizeContactRow", () => {
  const mapping = { Nome: "name", Telefone: "phone", Email: "email" } as const;

  it("aceita linha válida com telefone", () => {
    const result = validateAndNormalizeContactRow(
      { Nome: "joão silva", Telefone: "15999998888", Email: "" },
      mapping,
      emptyLookups,
    );
    expect(result.errors).toEqual([]);
    expect(result.normalized?.contact.name).toBe("João Silva");
    expect(result.normalized?.contact.phone).toBe("+5515999998888");
  });

  it("rejeita linha sem nome", () => {
    const result = validateAndNormalizeContactRow({ Nome: "", Telefone: "15999998888" }, mapping, emptyLookups);
    expect(result.normalized).toBeNull();
    expect(result.errors.some((e) => e.field === "name")).toBe(true);
  });

  it("rejeita linha sem nenhum canal de contato (telefone/whatsapp/email)", () => {
    const result = validateAndNormalizeContactRow({ Nome: "João Silva", Telefone: "" }, mapping, emptyLookups);
    expect(result.errors.some((e) => e.message.includes("telefone, WhatsApp ou e-mail"))).toBe(true);
  });

  it("rejeita e-mail inválido", () => {
    const result = validateAndNormalizeContactRow(
      { Nome: "João Silva", Telefone: "", Email: "não-é-email" },
      mapping,
      emptyLookups,
    );
    expect(result.errors.some((e) => e.field === "email")).toBe(true);
  });

  it("rejeita telefone incompleto", () => {
    const result = validateAndNormalizeContactRow({ Nome: "João Silva", Telefone: "999" }, mapping, emptyLookups);
    expect(result.errors.some((e) => e.field === "phone")).toBe(true);
  });

  it("resolve etapa do funil por nome (lookup) e rejeita etapa desconhecida", () => {
    const lookups: ContactImportLookups = {
      stagesByName: new Map([["novolead", "stage-1"]]),
      usersByNameOrEmail: new Map(),
    };
    const okMapping = { Nome: "name", Telefone: "phone", Etapa: "stageName" } as const;
    const ok = validateAndNormalizeContactRow({ Nome: "João", Telefone: "15999998888", Etapa: "Novo Lead" }, okMapping, lookups);
    expect(ok.normalized?.contact.stageId).toBe("stage-1");

    const bad = validateAndNormalizeContactRow({ Nome: "João", Telefone: "15999998888", Etapa: "Etapa Inexistente" }, okMapping, lookups);
    expect(bad.errors.some((e) => e.field === "stageName")).toBe(true);
  });

  it("resolve corretor responsável por nome (lookup) e rejeita corretor inexistente", () => {
    const lookups: ContactImportLookups = {
      stagesByName: new Map(),
      usersByNameOrEmail: new Map([["brendalocampos", "user-1"]]),
    };
    const okMapping = { Nome: "name", Telefone: "phone", Corretor: "ownerUserName" } as const;
    const ok = validateAndNormalizeContactRow({ Nome: "João", Telefone: "15999998888", Corretor: "Brenda Lo Campos" }, okMapping, lookups);
    expect(ok.normalized?.contact.ownerUserId).toBe("user-1");

    const bad = validateAndNormalizeContactRow({ Nome: "João", Telefone: "15999998888", Corretor: "Fulano Inexistente" }, okMapping, lookups);
    expect(bad.errors.some((e) => e.field === "ownerUserName")).toBe(true);
  });

  it("não inventa dados para campos ausentes: preferências e financeiro ficam null quando não mapeados", () => {
    const result = validateAndNormalizeContactRow({ Nome: "João", Telefone: "15999998888" }, mapping, emptyLookups);
    expect(result.normalized?.preference).toBeNull();
    expect(result.normalized?.financial).toBeNull();
  });

  it("monta preferências e dados financeiros quando mapeados e válidos", () => {
    const fullMapping = {
      Nome: "name",
      Telefone: "phone",
      Bairro: "desiredNeighborhood",
      FaixaMin: "minPrice",
      FaixaMax: "maxPrice",
      Renda: "individualIncome",
    } as const;
    const result = validateAndNormalizeContactRow(
      { Nome: "João", Telefone: "15999998888", Bairro: "Jardim América, Centro", FaixaMin: "300000", FaixaMax: "R$ 500.000", Renda: "8.500,00" },
      fullMapping,
      emptyLookups,
    );
    expect(result.normalized?.preference).toEqual({
      propertyType: null,
      desiredNeighborhoods: ["Jardim América", "Centro"],
      minPrice: 300000,
      maxPrice: 500000,
    });
    expect(result.normalized?.financial?.individualIncome).toBe(8500);
  });

  it("rejeita valor monetário incompatível", () => {
    const moneyMapping = { Nome: "name", Telefone: "phone", FaixaMin: "minPrice" } as const;
    const result = validateAndNormalizeContactRow(
      { Nome: "João", Telefone: "15999998888", FaixaMin: "a combinar" },
      moneyMapping,
      emptyLookups,
    );
    expect(result.errors.some((e) => e.field === "minPrice")).toBe(true);
  });
});
