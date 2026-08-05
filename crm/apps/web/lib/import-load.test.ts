import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma, Prisma } from "@mabres/db";
import { suggestColumnMapping, type ImportContactMapping } from "@mabres/shared";
import {
  buildContactImportLookups,
  detectDuplicatesForJob,
  executeImportJob,
  serializeNormalizedContactRow,
  validateAndParseUpload,
  validateContactRows,
} from "./import-service";

/**
 * G13 (Marco 1.9, Sprint 5) — teste de carga real da importação de CSV,
 * ponta a ponta (parse do arquivo → validação de todas as linhas → criação
 * do ImportJob com todas as ImportRow → detecção de duplicidade → execução
 * em lotes), até o limite oficial de `IMPORT_MAX_ROWS` (5.000 — ver
 * packages/shared/src/import-limits.ts). Roda contra Postgres real, os
 * mesmos caminhos de código usados por `uploadImportFileAction` /
 * `detectDuplicatesAction` / `executeImportAction` (só sem o wrapper de
 * sessão/redirect, que não faz sentido fora de uma requisição HTTP real).
 *
 * Não roda no `pnpm test`/CI padrão — é lento por natureza (é um teste de
 * carga, não de regressão) e seu objetivo é medir e documentar, não
 * bloquear todo PR. Rodar manualmente com:
 *
 *   RUN_IMPORT_LOAD_TEST=1 pnpm --filter @mabres/web exec vitest run lib/import-load.test.ts
 *
 * Os números medidos na sessão em que este teste foi escrito estão
 * documentados em docs/import-load-test.md, junto com a conclusão sobre se
 * a arquitetura atual (execução síncrona em lotes dentro da própria
 * server action) segue adequada até 5.000 linhas.
 */
const RUN_LOAD_TEST = process.env.RUN_IMPORT_LOAD_TEST === "1";

describe.skipIf(!RUN_LOAD_TEST)("import-service — teste de carga (G13, até 5.000 linhas)", () => {
  const ROW_COUNT = 5000;
  const EXISTING_CONTACT_COUNT = 250; // uma fração vira duplicidade real contra o banco
  const RUN_ID = `g13-load-${Date.now()}`;

  let roleId: string;
  let userId: string;
  let existingContactIds: string[] = [];
  let jobId: string;
  let createdContactIds: string[] = [];

  const timings: Record<string, number> = {};

  async function timed<T>(label: string, fn: () => Promise<T>): Promise<T> {
    const start = performance.now();
    const result = await fn();
    timings[label] = Math.round(performance.now() - start);
    return result;
  }

  beforeAll(async () => {
    const role = await prisma.role.upsert({
      where: { name: "TesteImportLoadRole" },
      update: {},
      create: { name: "TesteImportLoadRole" },
    });
    roleId = role.id;

    const user = await prisma.user.create({
      data: { name: "Importador Teste de Carga", email: `${RUN_ID}-importador@example.com`, roleId },
    });
    userId = user.id;

    // Contatos pré-existentes que uma fração das linhas do CSV vai colidir
    // (mesmo telefone) — para o teste exercitar a detecção de duplicidade
    // contra dados reais, não só contra o próprio lote.
    const existing = await Promise.all(
      Array.from({ length: EXISTING_CONTACT_COUNT }, (_, i) =>
        prisma.contact.create({
          data: {
            name: `${RUN_ID} Existente ${i}`,
            phone: `+551599${String(900000 + i).padStart(6, "0")}`,
            ownerUserId: userId,
            city: "Sorocaba",
            state: "SP",
          },
        }),
      ),
    );
    existingContactIds = existing.map((c) => c.id);
  }, 60_000);

  afterAll(async () => {
    if (jobId) {
      await prisma.importRow.deleteMany({ where: { importJobId: jobId } });
      await prisma.importJob.delete({ where: { id: jobId } }).catch(() => undefined);
    }
    if (createdContactIds.length > 0) {
      await prisma.contact.deleteMany({ where: { id: { in: createdContactIds } } });
    }
    await prisma.contact.deleteMany({ where: { id: { in: existingContactIds } } });
    await prisma.user.delete({ where: { id: userId } }).catch(() => undefined);
    await prisma.role.delete({ where: { id: roleId } }).catch(() => undefined);
    await prisma.$disconnect();

    // eslint-disable-next-line no-console
    console.log(`\n[G13] Tempos medidos (importação de ${ROW_COUNT} linhas):`, timings, "\n");
  }, 120_000);

  it(
    "importa 5.000 linhas ponta a ponta (parse → validação → duplicidade → execução em lotes) sem falhas",
    async () => {
      // 1) Gera o CSV em memória — 250 linhas colidem de propósito com os
      // contatos pré-existentes acima; o resto é único.
      const headers = ["nome", "telefone", "email", "cidade", "estado", "origem"];
      const csvLines = [headers.join(",")];
      for (let i = 0; i < ROW_COUNT; i++) {
        const isDuplicate = i < EXISTING_CONTACT_COUNT;
        const phone = isDuplicate ? `551599${String(900000 + i).padStart(6, "0")}` : `1598${String(1000000 + i).padStart(7, "0")}`;
        csvLines.push(
          [`${RUN_ID} Linha ${i}`, phone, `${RUN_ID.toLowerCase()}-linha-${i}@example.com`, "Sorocaba", "SP", "IMPORTACAO"].join(","),
        );
      }
      const buffer = Buffer.from(csvLines.join("\n"), "utf8");

      // 2) validação/parse do arquivo bruto
      const parseResult = await timed("1_parse_arquivo", async () =>
        validateAndParseUpload(buffer, `${RUN_ID}.csv`, "text/csv"),
      );
      expect(parseResult.ok).toBe(true);
      if (!parseResult.ok) throw new Error("parse falhou inesperadamente");
      expect(parseResult.parsed.rows.length).toBe(ROW_COUNT);

      // 3) monta lookups (etapas/corretores) e valida cada linha
      const lookups = await timed("2_build_lookups", () => buildContactImportLookups());
      const mapping: ImportContactMapping = {
        nome: "name",
        telefone: "phone",
        email: "email",
        cidade: "city",
        estado: "state",
        origem: "origin",
      };
      expect(suggestColumnMapping(headers)).toBeTruthy(); // confirma que o header é reconhecível de verdade, mesmo usando o mapping manual acima
      const outcomes = await timed("3_validar_linhas", async () =>
        validateContactRows(parseResult.parsed.headers, parseResult.parsed.rows, mapping, lookups),
      );
      expect(outcomes.every((o) => o.validationStatus !== "INVALIDA")).toBe(true);

      // 4) cria o ImportJob com as 5.000 ImportRow de uma vez (nested create)
      const job = await timed("4_criar_import_job_com_linhas", () =>
        prisma.importJob.create({
          data: {
            type: "CONTACTS",
            fileName: `${RUN_ID}.csv`,
            fileHash: `hash-${RUN_ID}`,
            fileSize: buffer.byteLength,
            delimiter: parseResult.parsed.delimiter,
            hadBom: parseResult.parsed.hadBom,
            importedByUserId: userId,
            status: "RASCUNHO",
            mapping: mapping as Prisma.InputJsonValue,
            totalRows: outcomes.length,
            validRows: outcomes.length,
            invalidRows: 0,
            rows: {
              create: outcomes.map((o) => ({
                rowNumber: o.rowNumber,
                originalData: o.originalData as Prisma.InputJsonValue,
                normalizedData: o.normalizedData ? (serializeNormalizedContactRow(o.normalizedData) as Prisma.InputJsonValue) : Prisma.JsonNull,
                validationStatus: o.validationStatus,
              })),
            },
          },
        }),
      );
      jobId = job.id;

      // 5) detecta duplicidade contra o banco real (deve achar as 250 de propósito)
      const duplicateOutcomes = await timed("5_detectar_duplicidade", () => detectDuplicatesForJob(jobId));
      expect(duplicateOutcomes.length).toBe(EXISTING_CONTACT_COUNT);

      await timed("6_persistir_duplicidade", () =>
        prisma.$transaction(
          duplicateOutcomes.map((o) =>
            prisma.importRow.update({
              where: { importJobId_rowNumber: { importJobId: jobId, rowNumber: o.rowNumber } },
              data: { validationStatus: "DUPLICADA", duplicateMatch: o.duplicateMatch as Prisma.InputJsonValue },
            }),
          ),
        ),
      );

      // 6) executa a importação (estratégia mais simples: cria só os novos, pula duplicados)
      await timed("7_executar_importacao", () =>
        executeImportJob(jobId, {
          strategy: "CRIAR_SOMENTE_NOVOS",
          rowActionOverrides: new Map(),
          actingUserId: userId,
          canUpdateExisting: false,
          canCreateDuplicate: false,
        }),
      );

      const finishedJob = await prisma.importJob.findUniqueOrThrow({ where: { id: jobId } });
      expect(finishedJob.status).toBe("CONCLUIDO");
      expect(finishedJob.createdRows).toBe(ROW_COUNT - EXISTING_CONTACT_COUNT);
      expect(finishedJob.skippedRows).toBe(EXISTING_CONTACT_COUNT);
      expect(finishedJob.failedRows).toBe(0);

      // Busca por telefone (não por nome): o nome passa por
      // normalizeProperCase() na validação e pode mudar de capitalização
      // (ex.: "g13-load-..." vira "G13-load-..."), enquanto o prefixo do
      // telefone gerado só para as linhas não-duplicadas é estável.
      const created = await prisma.contact.findMany({
        where: { phone: { startsWith: "+551598" } },
        select: { id: true },
      });
      createdContactIds = created.map((c) => c.id);
      expect(createdContactIds.length).toBe(ROW_COUNT - EXISTING_CONTACT_COUNT);

      const totalMs = Object.values(timings).reduce((sum, v) => sum + v, 0);
      // Limite generoso só para pegar uma regressão catastrófica (ex.: virou
      // O(n²) sem querer) — não é o número documentado no relatório, que usa
      // os tempos reais medidos acima.
      expect(totalMs).toBeLessThan(120_000);
    },
    180_000,
  );
});
