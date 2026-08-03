import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@mabres/db";
import { getMatchesForContact, getMatchesForProperty } from "./matching-service";

/**
 * Testes de integração contra Postgres real (requer DATABASE_URL migrado —
 * ver .github/workflows/ci.yml, job test-and-migrations). Confirmam que o
 * mesmo motor de matching produz o mesmo resultado nos dois sentidos, e que
 * uma alteração relevante no imóvel invalida o resultado em cache.
 */
describe("matching-service — integração cliente <-> imóvel", () => {
  let roleId: string;
  let userId: string;
  let contactId: string;
  let propertyId: string;

  beforeAll(async () => {
    const role = await prisma.role.upsert({
      where: { name: "TesteMatchingRole" },
      update: {},
      create: { name: "TesteMatchingRole" },
    });
    roleId = role.id;

    const user = await prisma.user.create({
      data: {
        name: "Corretor Teste Matching",
        email: `matching-test-${Date.now()}@example.com`,
        roleId,
      },
    });
    userId = user.id;

    const property = await prisma.property.create({
      data: {
        internalCode: `TEST-${Date.now()}`,
        purpose: "VENDA",
        propertyType: "Apartamento",
        city: "Sorocaba",
        neighborhood: "Campolim",
        salePrice: 400000,
        bedrooms: 3,
        status: "ativo",
      },
    });
    propertyId = property.id;

    const contact = await prisma.contact.create({
      data: {
        name: "Cliente Teste Matching",
        ownerUserId: userId,
        preference: {
          create: {
            intent: "COMPRA",
            desiredCity: "Sorocaba",
            propertyType: "Apartamento",
            minPrice: 300000,
            maxPrice: 500000,
            bedrooms: 2,
          },
        },
      },
    });
    contactId = contact.id;
  });

  afterAll(async () => {
    await prisma.match.deleteMany({ where: { OR: [{ contactId }, { propertyId }] } });
    await prisma.contactPreference.deleteMany({ where: { contactId } });
    await prisma.contact.delete({ where: { id: contactId } }).catch(() => undefined);
    await prisma.property.delete({ where: { id: propertyId } }).catch(() => undefined);
    await prisma.user.delete({ where: { id: userId } }).catch(() => undefined);
    await prisma.role.delete({ where: { id: roleId } }).catch(() => undefined);
    await prisma.$disconnect();
  });

  it("cliente → imóveis encontra o imóvel compatível", async () => {
    const summary = await getMatchesForContact(contactId, { forceRecalculate: true });
    expect(summary.eligible.some((m) => m.propertyId === propertyId)).toBe(true);
  });

  it("imóvel → clientes usa a mesma regra e produz o mesmo score que cliente → imóveis", async () => {
    const contactDirection = await getMatchesForContact(contactId, { forceRecalculate: true });
    const propertyDirection = await getMatchesForProperty(propertyId, { forceRecalculate: true });

    const fromContact = contactDirection.eligible.find((m) => m.propertyId === propertyId);
    const fromProperty = propertyDirection.eligible.find((m) => m.contactId === contactId);

    expect(fromContact).toBeDefined();
    expect(fromProperty).toBeDefined();
    expect(fromContact!.result.score).toBe(fromProperty!.result.score);
    expect(fromContact!.result.eligible).toBe(fromProperty!.result.eligible);
    expect(fromContact!.result.criteria).toEqual(fromProperty!.result.criteria);
  });

  it("recalcula automaticamente quando o preço do imóvel muda depois do último cálculo", async () => {
    const before = await getMatchesForContact(contactId, { forceRecalculate: true });
    expect(before.eligible.find((m) => m.propertyId === propertyId)?.result.score).toBe(100);

    await prisma.property.update({ where: { id: propertyId }, data: { salePrice: 900000 } });

    // Sem forceRecalculate: a checagem de "stale" (calculatedAt vs. property.updatedAt) deve
    // perceber sozinha que o cache está desatualizado e recalcular.
    const after = await getMatchesForContact(contactId);
    const afterEntry = after.eligible.find((m) => m.propertyId === propertyId);
    expect(afterEntry).toBeUndefined(); // agora fora da faixa de preço obrigatória -> eliminado

    await prisma.property.update({ where: { id: propertyId }, data: { salePrice: 400000 } });
  });
});
