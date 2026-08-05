import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@mabres/db";
import { daysSince, getStaleLeads, STALE_LEAD_THRESHOLD_DAYS } from "./dashboard-service";

describe("daysSince", () => {
  it("calcula dias corridos entre duas datas", () => {
    const now = new Date("2026-08-10T12:00:00Z");
    expect(daysSince(new Date("2026-08-07T12:00:00Z"), now)).toBe(3);
    expect(daysSince(new Date("2026-08-10T06:00:00Z"), now)).toBe(0);
  });

  it("nunca retorna negativo (data no futuro)", () => {
    const now = new Date("2026-08-10T12:00:00Z");
    expect(daysSince(new Date("2026-08-15T12:00:00Z"), now)).toBe(0);
  });
});

/** Testes de integração contra Postgres real — ver .github/workflows/ci.yml. */
describe("getStaleLeads — integração com PostgreSQL", () => {
  let roleId: string;
  let ownerAId: string;
  let ownerBId: string;
  const contactIds: string[] = [];

  beforeAll(async () => {
    const role = await prisma.role.upsert({
      where: { name: "TesteDashboardService" },
      update: {},
      create: { name: "TesteDashboardService" },
    });
    roleId = role.id;

    const [ownerA, ownerB] = await Promise.all([
      prisma.user.create({ data: { name: "Dono A Dashboard", email: `dash-owner-a-${Date.now()}@example.com`, roleId } }),
      prisma.user.create({ data: { name: "Dono B Dashboard", email: `dash-owner-b-${Date.now()}@example.com`, roleId } }),
    ]);
    ownerAId = ownerA.id;
    ownerBId = ownerB.id;

    const oldDate = new Date();
    oldDate.setDate(oldDate.getDate() - 10);
    const recentDate = new Date();
    recentDate.setDate(recentDate.getDate() - 1);

    const [neverContacted, staleContacted, recentlyContacted, otherOwnerStale] = await Promise.all([
      prisma.contact.create({ data: { name: `Lead Nunca Contatado ${Date.now()}`, ownerUserId: ownerAId, origin: "MANUAL", lastContactAt: null } }),
      prisma.contact.create({ data: { name: `Lead Parado Antigo ${Date.now()}`, ownerUserId: ownerAId, origin: "MANUAL", lastContactAt: oldDate } }),
      prisma.contact.create({ data: { name: `Lead Contatado Recentemente ${Date.now()}`, ownerUserId: ownerAId, origin: "MANUAL", lastContactAt: recentDate } }),
      prisma.contact.create({ data: { name: `Lead Parado Outro Dono ${Date.now()}`, ownerUserId: ownerBId, origin: "MANUAL", lastContactAt: oldDate } }),
    ]);
    contactIds.push(neverContacted.id, staleContacted.id, recentlyContacted.id, otherOwnerStale.id);
  });

  afterAll(async () => {
    await prisma.contact.deleteMany({ where: { id: { in: contactIds } } });
    await prisma.user.deleteMany({ where: { id: { in: [ownerAId, ownerBId] } } });
    await prisma.role.deleteMany({ where: { name: "TesteDashboardService" } });
    await prisma.$disconnect();
  });

  it(`inclui leads nunca contatados e parados há ${STALE_LEAD_THRESHOLD_DAYS}+ dias, exclui os contatados recentemente`, async () => {
    const stale = await getStaleLeads(prisma, { ownerUserId: ownerAId });
    const names = stale.map((l) => l.name);

    expect(names.some((n) => n.startsWith("Lead Nunca Contatado"))).toBe(true);
    expect(names.some((n) => n.startsWith("Lead Parado Antigo"))).toBe(true);
    expect(names.some((n) => n.startsWith("Lead Contatado Recentemente"))).toBe(false);
  });

  it("respeita o escopo (where) recebido — não vaza leads parados de outro dono", async () => {
    const stale = await getStaleLeads(prisma, { ownerUserId: ownerAId });
    expect(stale.some((l) => l.name.startsWith("Lead Parado Outro Dono"))).toBe(false);
  });

  it("mostra o lead nunca contatado antes do lead com contato antigo (mais urgente primeiro)", async () => {
    const stale = await getStaleLeads(prisma, { ownerUserId: ownerAId });
    const neverContactedIndex = stale.findIndex((l) => l.name.startsWith("Lead Nunca Contatado"));
    const staleContactedIndex = stale.findIndex((l) => l.name.startsWith("Lead Parado Antigo"));
    expect(neverContactedIndex).toBeGreaterThanOrEqual(0);
    expect(staleContactedIndex).toBeGreaterThanOrEqual(0);
    expect(neverContactedIndex).toBeLessThan(staleContactedIndex);
  });

  it("respeita o limite `take`", async () => {
    const stale = await getStaleLeads(prisma, { ownerUserId: ownerAId }, 1);
    expect(stale).toHaveLength(1);
  });
});
