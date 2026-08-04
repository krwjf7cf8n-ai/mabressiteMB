import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { ConcurrencyConflictError, prisma, updateOptimistically } from "@mabres/db";

/**
 * Testes de integração contra Postgres real para o helper genérico de
 * concorrência otimista (packages/db/src/concurrency.ts), usado por
 * visits/actions.ts, user-admin-service.ts e role-admin-service.ts.
 * Ver .github/workflows/ci.yml.
 */
describe("updateOptimistically — integração com PostgreSQL", () => {
  let roleId: string;
  let userId: string;

  beforeAll(async () => {
    const role = await prisma.role.upsert({
      where: { name: "TesteOptimisticUpdate" },
      update: {},
      create: { name: "TesteOptimisticUpdate" },
    });
    roleId = role.id;

    const user = await prisma.user.create({
      data: { name: "Usuário Teste Concorrência", email: `optimistic-${Date.now()}@example.com`, roleId },
    });
    userId = user.id;
  });

  afterAll(async () => {
    await prisma.user.deleteMany({ where: { id: userId } });
    await prisma.role.deleteMany({ where: { name: "TesteOptimisticUpdate" } });
    await prisma.$disconnect();
  });

  it("aplica a atualização quando updatedAt bate com o esperado", async () => {
    const before = await prisma.user.findUniqueOrThrow({ where: { id: userId } });

    await updateOptimistically(prisma.user, userId, before.updatedAt, { name: "Nome Atualizado" }, "Este usuário");

    const after = await prisma.user.findUniqueOrThrow({ where: { id: userId } });
    expect(after.name).toBe("Nome Atualizado");
  });

  it("lança ConcurrencyConflictError com a mensagem certa quando updatedAt não bate (0 linhas afetadas)", async () => {
    const staleDate = new Date("2000-01-01T00:00:00Z");

    await expect(updateOptimistically(prisma.user, userId, staleDate, { name: "Não Deveria Aplicar" }, "Este usuário")).rejects.toThrow(
      ConcurrencyConflictError,
    );

    const unchanged = await prisma.user.findUniqueOrThrow({ where: { id: userId } });
    expect(unchanged.name).not.toBe("Não Deveria Aplicar");
  });

  it("lança ConcurrencyConflictError para um ID inexistente", async () => {
    await expect(
      updateOptimistically(prisma.user, "id-que-nao-existe", new Date(), { name: "x" }, "Este usuário"),
    ).rejects.toThrow(ConcurrencyConflictError);
  });
});
