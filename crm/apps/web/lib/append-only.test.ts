import { describe, expect, it } from "vitest";
import { prisma } from "@mabres/db";

/**
 * G17 (Marco 1.9) — o middleware append-only (packages/db/src/index.ts)
 * intercepta a ação antes de qualquer consulta chegar ao banco, então nem
 * precisa existir uma linha real para o teste ser válido: a tentativa de
 * mutação deve falhar sempre, exista ou não o registro-alvo.
 */
describe("prisma — middleware append-only (G17)", () => {
  const APPEND_ONLY_MODELS = [
    "auditLog",
    "visitEvent",
    "contactStageHistory",
    "propertyPriceHistory",
    "propertyStatusHistory",
    "proposalVersion",
    "automationLog",
    "aiUsageLog",
  ] as const;

  it.each(APPEND_ONLY_MODELS)("bloqueia update em %s", async (model) => {
    // @ts-expect-error -- acesso dinâmico só para o teste percorrer todos os modelos
    await expect(prisma[model].update({ where: { id: "id-inexistente" }, data: {} })).rejects.toThrow(
      /é append-only/,
    );
  });

  it.each(APPEND_ONLY_MODELS)("bloqueia delete em %s", async (model) => {
    // @ts-expect-error -- acesso dinâmico só para o teste percorrer todos os modelos
    await expect(prisma[model].delete({ where: { id: "id-inexistente" } })).rejects.toThrow(/é append-only/);
  });

  it.each(APPEND_ONLY_MODELS)("bloqueia deleteMany em %s", async (model) => {
    // @ts-expect-error -- acesso dinâmico só para o teste percorrer todos os modelos
    await expect(prisma[model].deleteMany({ where: {} })).rejects.toThrow(/é append-only/);
  });

  it.each(APPEND_ONLY_MODELS)("bloqueia upsert em %s", async (model) => {
    // @ts-expect-error -- acesso dinâmico só para o teste percorrer todos os modelos
    await expect(prisma[model].upsert({ where: { id: "id-inexistente" }, create: {}, update: {} })).rejects.toThrow(
      /é append-only/,
    );
  });

  it("não bloqueia modelos fora da lista (ex.: User pode ser atualizado normalmente)", async () => {
    await expect(prisma.user.update({ where: { id: "id-inexistente" }, data: {} })).rejects.not.toThrow(
      /é append-only/,
    );
  });
});
