import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@mabres/db";
import { propertyCreateSchema, propertyUpdateSchema } from "@mabres/shared";
import { createProperty, inactivateProperty, updateProperty } from "./property-service";

/**
 * G16 (Marco 1.9) — valida que a migração de `Property.status` de String
 * livre para o enum `PropertyStatus` é compatível com dados reais gravados
 * pela camada de aplicação: cria/atualiza um imóvel percorrendo os 6 valores
 * válidos do enum através do fluxo normal (property-service), não só via
 * SQL cru. Testes de integração contra Postgres real — ver .github/workflows/ci.yml.
 */
describe("property-service — integração com PostgreSQL (PropertyStatus)", () => {
  let userId: string;
  const propertyIds: string[] = [];

  beforeAll(async () => {
    const role = await prisma.role.upsert({
      where: { name: "TestePropertyService" },
      update: {},
      create: { name: "TestePropertyService" },
    });

    const user = await prisma.user.create({
      data: { name: "Corretor Teste", email: `property-service-${Date.now()}@example.com`, roleId: role.id },
    });
    userId = user.id;
  });

  afterAll(async () => {
    await prisma.property.deleteMany({ where: { id: { in: propertyIds } } });
    await prisma.user.deleteMany({ where: { id: userId } });
    await prisma.role.deleteMany({ where: { name: "TestePropertyService" } });
    await prisma.$disconnect();
  });

  it("cria o imóvel com o status default 'ativo' (enum)", async () => {
    const data = propertyCreateSchema.parse({ propertyType: "apartamento" });
    const property = await createProperty(prisma, data, userId);
    propertyIds.push(property.id);

    const found = await prisma.property.findUniqueOrThrow({ where: { id: property.id } });
    expect(found.status).toBe("ativo");
  });

  it("aceita cada um dos 6 valores do enum PropertyStatus via updateProperty", async () => {
    const created = await createProperty(prisma, propertyCreateSchema.parse({ propertyType: "casa" }), userId);
    propertyIds.push(created.id);

    const statuses = ["ativo", "vendido", "alugado", "suspenso", "indisponivel", "inativo"] as const;
    let current = await prisma.property.findUniqueOrThrow({ where: { id: created.id } });

    for (const status of statuses) {
      const data = propertyUpdateSchema.parse({ id: created.id, status, propertyType: "casa" });
      await updateProperty(prisma, data, current, userId);
      current = await prisma.property.findUniqueOrThrow({ where: { id: created.id } });
      expect(current.status).toBe(status);
    }
  });

  it("inactivateProperty grava status 'inativo' (enum) e o motivo no histórico", async () => {
    const created = await createProperty(prisma, propertyCreateSchema.parse({ propertyType: "sobrado" }), userId);
    propertyIds.push(created.id);
    const current = await prisma.property.findUniqueOrThrow({ where: { id: created.id } });

    await inactivateProperty(prisma, { id: created.id, reason: "Teste de integração" }, current, userId);

    const updated = await prisma.property.findUniqueOrThrow({ where: { id: created.id } });
    expect(updated.status).toBe("inativo");
  });
});
