import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma, recordAudit, redactSensitiveFields } from "@mabres/db";

/**
 * G18 (Marco 1.9) — redactSensitiveFields é lógica pura (não depende do
 * Postgres); recordAudit precisa do banco real para confirmar que a
 * redação também é aplicada no caminho de gravação de verdade, não só na
 * função isolada. Ver .github/workflows/ci.yml.
 */
describe("redactSensitiveFields (lógica pura)", () => {
  it("redige campos sensíveis por nome (senha, token, documento, dados bancários)", () => {
    const input = {
      name: "Proprietário Teste",
      passwordHash: "$2b$12$abc...",
      accessTokenEnc: "v1.iv.tag.data",
      refreshTokenEnc: "v1.iv.tag.data",
      bankDataEncrypted: "v1.iv.tag.data",
      document: "123.456.789-00",
      pendingDocuments: "RG, comprovante de residência",
    };

    const redacted = redactSensitiveFields(input);

    expect(redacted).toMatchObject({
      name: "Proprietário Teste",
      passwordHash: "[REDACTED]",
      accessTokenEnc: "[REDACTED]",
      refreshTokenEnc: "[REDACTED]",
      bankDataEncrypted: "[REDACTED]",
      document: "[REDACTED]",
      pendingDocuments: "[REDACTED]",
    });
  });

  it("não redige campos comuns/permitidos (nome, e-mail, status, ids)", () => {
    const input = {
      name: "Contato Teste",
      email: "teste@example.com",
      status: "ativo",
      roleId: "role-123",
      stageId: "stage-456",
      salePrice: 350000,
    };

    expect(redactSensitiveFields(input)).toEqual(input);
  });

  it("redige recursivamente dentro de objetos e arrays aninhados", () => {
    const input = {
      user: { name: "Fulano", passwordHash: "segredo" },
      history: [{ token: "abc" }, { name: "ok" }],
    };

    expect(redactSensitiveFields(input)).toEqual({
      user: { name: "Fulano", passwordHash: "[REDACTED]" },
      history: [{ token: "[REDACTED]" }, { name: "ok" }],
    });
  });

  it("passa por valores primitivos e null/undefined sem alteração", () => {
    expect(redactSensitiveFields(null)).toBeNull();
    expect(redactSensitiveFields(undefined)).toBeUndefined();
  });
});

describe("recordAudit — redação aplicada na gravação real (integração com PostgreSQL)", () => {
  let userId: string;

  beforeAll(async () => {
    const role = await prisma.role.upsert({
      where: { name: "TesteAuditRedaction" },
      update: {},
      create: { name: "TesteAuditRedaction" },
    });
    const user = await prisma.user.create({
      data: { name: "Ator Auditoria", email: `audit-redaction-${Date.now()}@example.com`, roleId: role.id },
    });
    userId = user.id;
  });

  afterAll(async () => {
    // AuditLog é append-only (G17) — não é apagado no cleanup.
    await prisma.user.deleteMany({ where: { id: userId } });
    await prisma.role.deleteMany({ where: { name: "TesteAuditRedaction" } });
    await prisma.$disconnect();
  });

  it("grava [REDACTED] em vez do valor real quando o call site esquece de mascarar", async () => {
    const entry = await recordAudit(prisma, {
      entityType: "Owner",
      entityId: "owner-teste-redacao",
      action: "create",
      actorUserId: userId,
      after: { name: "Proprietário", bankDataEncrypted: "v1.iv.tag.data", document: "123.456.789-00" },
    });

    expect(entry.after).toMatchObject({
      name: "Proprietário",
      bankDataEncrypted: "[REDACTED]",
      document: "[REDACTED]",
    });
  });
});
