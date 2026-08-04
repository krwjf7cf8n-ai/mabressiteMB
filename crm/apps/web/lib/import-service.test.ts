import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@mabres/db";
import type { NormalizedContactRow } from "@mabres/shared";
import { detectDuplicatesForJob, executeImportJob, rollbackImportJob, serializeNormalizedContactRow } from "./import-service";

/** Testes de integração contra Postgres real — ver .github/workflows/ci.yml. */
describe("import-service — integração com PostgreSQL", () => {
  let roleId: string;
  let userId: string;
  let existingContactId: string;

  function makeNormalizedRow(overrides: Partial<NormalizedContactRow["contact"]> = {}): NormalizedContactRow {
    return {
      contact: {
        name: "Cliente CSV",
        phone: "+5515999990000",
        whatsapp: null,
        email: null,
        city: "Sorocaba",
        state: "SP",
        origin: "IMPORTACAO",
        campaign: null,
        notes: null,
        temperature: null,
        stageId: null,
        ownerUserId: null,
        createdAt: null,
        lastContactAt: null,
        ...overrides,
      },
      preference: null,
      financial: null,
    };
  }

  async function createJobWithRows(
    rows: Array<{ validationStatus: "VALIDA" | "VALIDA_COM_AVISO" | "INVALIDA" | "DUPLICADA"; normalized?: NormalizedContactRow; duplicateMatch?: unknown }>,
  ) {
    const job = await prisma.importJob.create({
      data: {
        type: "CONTACTS",
        fileName: "teste.csv",
        fileHash: `hash-${Date.now()}-${Math.random()}`,
        fileSize: 100,
        importedByUserId: userId,
        status: "RASCUNHO",
        totalRows: rows.length,
        rows: {
          create: rows.map((r, i) => ({
            rowNumber: i + 2,
            originalData: { nome: "x" },
            normalizedData: r.normalized ? (serializeNormalizedContactRow(r.normalized) as object) : undefined,
            validationStatus: r.validationStatus,
            duplicateMatch: r.duplicateMatch as object | undefined,
          })),
        },
      },
    });
    return job;
  }

  beforeAll(async () => {
    const role = await prisma.role.upsert({
      where: { name: "TesteImportServiceRole" },
      update: {},
      create: { name: "TesteImportServiceRole" },
    });
    roleId = role.id;

    const user = await prisma.user.create({
      data: { name: "Importador Teste", email: `import-tester-${Date.now()}@example.com`, roleId },
    });
    userId = user.id;

    const existing = await prisma.contact.create({
      data: { name: "Cliente Existente", phone: "+5515988887777", ownerUserId: userId, city: "Sorocaba" },
    });
    existingContactId = existing.id;
  });

  afterAll(async () => {
    // AuditLog é append-only (G17) — não é apagado no cleanup.
    await prisma.contact.deleteMany({ where: { ownerUserId: userId } });
    await prisma.importJob.deleteMany({ where: { importedByUserId: userId } });
    await prisma.user.delete({ where: { id: userId } }).catch(() => undefined);
    await prisma.role.delete({ where: { id: roleId } }).catch(() => undefined);
    await prisma.$disconnect();
  });

  it("detectDuplicatesForJob encontra duplicidade real por telefone e ignora linha sem correspondência", async () => {
    const job = await createJobWithRows([
      { validationStatus: "VALIDA", normalized: makeNormalizedRow({ phone: "+5515988887777" }) }, // bate com existingContactId
      { validationStatus: "VALIDA", normalized: makeNormalizedRow({ phone: "+5515900001111" }) }, // sem correspondência
    ]);

    const outcomes = await detectDuplicatesForJob(job.id);
    expect(outcomes).toHaveLength(1);
    expect(outcomes[0]?.rowNumber).toBe(2);
    expect(outcomes[0]?.duplicateMatch.some((m) => m.candidateId === existingContactId)).toBe(true);
  });

  it("executeImportJob (CRIAR_SOMENTE_NOVOS) cria um novo Contact a partir de linha válida e audita", async () => {
    const job = await createJobWithRows([{ validationStatus: "VALIDA", normalized: makeNormalizedRow({ phone: "+5515911112222", name: "Novo Cliente Import" }) }]);

    await executeImportJob(job.id, {
      strategy: "CRIAR_SOMENTE_NOVOS",
      rowActionOverrides: new Map(),
      actingUserId: userId,
      canUpdateExisting: false,
      canCreateDuplicate: false,
    });

    const reloadedJob = await prisma.importJob.findUniqueOrThrow({ where: { id: job.id } });
    expect(reloadedJob.createdRows).toBe(1);
    expect(reloadedJob.status).toBe("CONCLUIDO");

    const row = await prisma.importRow.findFirstOrThrow({ where: { importJobId: job.id } });
    expect(row.action).toBe("CRIAR");
    expect(row.targetEntityId).not.toBeNull();

    const created = await prisma.contact.findUniqueOrThrow({ where: { id: row.targetEntityId! } });
    expect(created.name).toBe("Novo Cliente Import");
    expect(created.ownerUserId).toBe(userId); // sem corretor mapeado -> assume quem importou

    const audit = await prisma.auditLog.findFirst({ where: { entityType: "Contact", entityId: created.id, action: "import_create" } });
    expect(audit).not.toBeNull();
  });

  it("executeImportJob (CRIAR_SOMENTE_NOVOS) ignora linha duplicada por padrão, sem tocar no registro existente", async () => {
    const before = await prisma.contact.findUniqueOrThrow({ where: { id: existingContactId } });
    const job = await createJobWithRows([
      {
        validationStatus: "DUPLICADA",
        normalized: makeNormalizedRow({ phone: "+5515988887777", name: "Nome Diferente Vindo Do CSV" }),
        duplicateMatch: [{ candidateId: existingContactId, matchedOn: ["phone"] }],
      },
    ]);

    await executeImportJob(job.id, {
      strategy: "CRIAR_SOMENTE_NOVOS",
      rowActionOverrides: new Map(),
      actingUserId: userId,
      canUpdateExisting: true,
      canCreateDuplicate: false,
    });

    const reloadedJob = await prisma.importJob.findUniqueOrThrow({ where: { id: job.id } });
    expect(reloadedJob.skippedRows).toBe(1);
    expect(reloadedJob.createdRows).toBe(0);
    expect(reloadedJob.updatedRows).toBe(0);

    const after = await prisma.contact.findUniqueOrThrow({ where: { id: existingContactId } });
    expect(after.name).toBe(before.name); // não sobrescrito
  });

  it("executeImportJob (CRIAR_E_COMPLETAR) só preenche campos vazios do registro existente, nunca apaga um já preenchido", async () => {
    const target = await prisma.contact.create({
      data: { name: "Cliente Para Completar", phone: "+5515977776666", ownerUserId: userId, city: "Sorocaba", notes: null },
    });

    const job = await createJobWithRows([
      {
        validationStatus: "DUPLICADA",
        normalized: makeNormalizedRow({ phone: "+5515977776666", name: "Nome Novo Do CSV", city: "Votorantim", notes: "Observação vinda do CSV" }),
        duplicateMatch: [{ candidateId: target.id, matchedOn: ["phone"] }],
      },
    ]);

    await executeImportJob(job.id, {
      strategy: "CRIAR_E_COMPLETAR",
      rowActionOverrides: new Map(),
      actingUserId: userId,
      canUpdateExisting: true,
      canCreateDuplicate: false,
    });

    const updated = await prisma.contact.findUniqueOrThrow({ where: { id: target.id } });
    expect(updated.city).toBe("Sorocaba"); // já preenchido -> não sobrescreve
    expect(updated.notes).toBe("Observação vinda do CSV"); // estava vazio -> completa

    const row = await prisma.importRow.findFirstOrThrow({ where: { importJobId: job.id } });
    expect(row.action).toBe("ATUALIZAR");
    expect((row.preUpdateSnapshot as Record<string, unknown> | null)?.notes ?? null).toBeNull();
  });

  it("executeImportJob nunca altera ownerUserId nem stageId de um registro existente, mesmo com CRIAR_E_ATUALIZAR", async () => {
    const otherRole = await prisma.role.upsert({ where: { name: "TesteImportServiceRole2" }, update: {}, create: { name: "TesteImportServiceRole2" } });
    const otherUser = await prisma.user.create({ data: { name: "Outro Corretor", email: `other-${Date.now()}@example.com`, roleId: otherRole.id } });

    const target = await prisma.contact.create({
      data: { name: "Cliente Com Dono", phone: "+5515966665555", ownerUserId: otherUser.id },
    });

    const job = await createJobWithRows([
      {
        validationStatus: "DUPLICADA",
        normalized: makeNormalizedRow({ phone: "+5515966665555", ownerUserId: userId }),
        duplicateMatch: [{ candidateId: target.id, matchedOn: ["phone"] }],
      },
    ]);

    await executeImportJob(job.id, {
      strategy: "CRIAR_E_ATUALIZAR",
      rowActionOverrides: new Map(),
      actingUserId: userId,
      canUpdateExisting: true,
      canCreateDuplicate: false,
    });

    const updated = await prisma.contact.findUniqueOrThrow({ where: { id: target.id } });
    expect(updated.ownerUserId).toBe(otherUser.id); // não mudou, mesmo tendo vindo um valor diferente no CSV

    await prisma.contact.delete({ where: { id: target.id } });
    await prisma.user.delete({ where: { id: otherUser.id } });
    await prisma.role.delete({ where: { id: otherRole.id } });
  });

  it("executeImportJob processa lote parcialmente inválido: linha inválida vira falha, linhas válidas seguem criando normalmente", async () => {
    const job = await createJobWithRows([
      { validationStatus: "VALIDA", normalized: makeNormalizedRow({ phone: "+5515933332222", name: "Válido Um" }) },
      { validationStatus: "INVALIDA" },
      { validationStatus: "VALIDA", normalized: makeNormalizedRow({ phone: "+5515933332223", name: "Válido Dois" }) },
    ]);

    await executeImportJob(job.id, {
      strategy: "CRIAR_SOMENTE_NOVOS",
      rowActionOverrides: new Map(),
      actingUserId: userId,
      canUpdateExisting: false,
      canCreateDuplicate: false,
    });

    const reloadedJob = await prisma.importJob.findUniqueOrThrow({ where: { id: job.id } });
    expect(reloadedJob.createdRows).toBe(2);
    expect(reloadedJob.failedRows).toBe(1);
    expect(reloadedJob.status).toBe("CONCLUIDO_PARCIAL");
  });

  it("rollbackImportJob desfaz uma criação (soft delete) e audita", async () => {
    const job = await createJobWithRows([{ validationStatus: "VALIDA", normalized: makeNormalizedRow({ phone: "+5515922223333", name: "Cliente Para Reverter" }) }]);
    await executeImportJob(job.id, {
      strategy: "CRIAR_SOMENTE_NOVOS",
      rowActionOverrides: new Map(),
      actingUserId: userId,
      canUpdateExisting: false,
      canCreateDuplicate: false,
    });
    await prisma.importJob.update({ where: { id: job.id }, data: { status: "CONCLUIDO" } });

    const row = await prisma.importRow.findFirstOrThrow({ where: { importJobId: job.id } });
    const createdContactId = row.targetEntityId!;

    const { rolledBack, blocked } = await rollbackImportJob(job.id, userId, "teste de rollback");
    expect(rolledBack).toBe(1);
    expect(blocked).toBe(0);

    const contact = await prisma.contact.findUniqueOrThrow({ where: { id: createdContactId } });
    expect(contact.deletedAt).not.toBeNull(); // soft delete, nunca exclusão física

    const reloadedJob = await prisma.importJob.findUniqueOrThrow({ where: { id: job.id } });
    expect(reloadedJob.status).toBe("DESFEITO");

    const audit = await prisma.auditLog.findFirst({ where: { entityType: "Contact", entityId: createdContactId, action: "import_rollback_create" } });
    expect(audit).not.toBeNull();
  });

  it("rollbackImportJob restaura os campos alterados por uma atualização (usa o preUpdateSnapshot)", async () => {
    const target = await prisma.contact.create({ data: { name: "Nome Original", phone: "+5515911119999", ownerUserId: userId } });
    const job = await createJobWithRows([
      {
        validationStatus: "DUPLICADA",
        normalized: makeNormalizedRow({ phone: "+5515911119999", name: "Nome Sobrescrito Pelo CSV" }),
        duplicateMatch: [{ candidateId: target.id, matchedOn: ["phone"] }],
      },
    ]);

    await executeImportJob(job.id, {
      strategy: "CRIAR_E_ATUALIZAR",
      rowActionOverrides: new Map(),
      actingUserId: userId,
      canUpdateExisting: true,
      canCreateDuplicate: false,
    });
    await prisma.importJob.update({ where: { id: job.id }, data: { status: "CONCLUIDO" } });

    const updated = await prisma.contact.findUniqueOrThrow({ where: { id: target.id } });
    expect(updated.name).toBe("Nome Sobrescrito Pelo CSV");

    const { rolledBack } = await rollbackImportJob(job.id, userId, "teste de rollback de atualização");
    expect(rolledBack).toBe(1);

    const restored = await prisma.contact.findUniqueOrThrow({ where: { id: target.id } });
    expect(restored.name).toBe("Nome Original");
  });

  it("rollbackImportJob bloqueia (não reverte) um registro alterado manualmente depois da importação", async () => {
    const target = await prisma.contact.create({ data: { name: "Nome Antes", phone: "+5515900009999", ownerUserId: userId } });
    const job = await createJobWithRows([
      {
        validationStatus: "DUPLICADA",
        normalized: makeNormalizedRow({ phone: "+5515900009999", name: "Nome Do CSV" }),
        duplicateMatch: [{ candidateId: target.id, matchedOn: ["phone"] }],
      },
    ]);

    await executeImportJob(job.id, {
      strategy: "CRIAR_E_ATUALIZAR",
      rowActionOverrides: new Map(),
      actingUserId: userId,
      canUpdateExisting: true,
      canCreateDuplicate: false,
    });
    await prisma.importJob.update({ where: { id: job.id }, data: { status: "CONCLUIDO" } });

    // simula uma edição manual do usuário depois da importação
    await prisma.contact.update({ where: { id: target.id }, data: { notes: "Editado manualmente depois da importação" } });

    const { rolledBack, blocked } = await rollbackImportJob(job.id, userId, "tentativa de rollback após edição manual");
    expect(rolledBack).toBe(0);
    expect(blocked).toBe(1);

    const stillEdited = await prisma.contact.findUniqueOrThrow({ where: { id: target.id } });
    expect(stillEdited.name).toBe("Nome Do CSV"); // rollback bloqueado, nada foi revertido
    expect(stillEdited.notes).toBe("Editado manualmente depois da importação");

    const reloadedJob = await prisma.importJob.findUniqueOrThrow({ where: { id: job.id } });
    expect(reloadedJob.status).toBe("DESFEITO_PARCIAL");
  });
});
