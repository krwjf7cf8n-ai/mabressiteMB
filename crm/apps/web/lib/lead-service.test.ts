import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@mabres/db";
import { createFollowUpTaskForNewContact } from "./lead-service";

/** Testes de integração contra Postgres real — ver .github/workflows/ci.yml. */
describe("lead-service — integração com PostgreSQL", () => {
  let roleId: string;
  let ownerId: string;
  let creatorId: string;
  let contactId: string;
  const taskIds: string[] = [];

  beforeAll(async () => {
    const role = await prisma.role.upsert({
      where: { name: "TesteLeadService" },
      update: {},
      create: { name: "TesteLeadService" },
    });
    roleId = role.id;

    const [owner, creator] = await Promise.all([
      prisma.user.create({ data: { name: "Dono do Lead", email: `lead-owner-${Date.now()}@example.com`, roleId } }),
      prisma.user.create({ data: { name: "Criador do Lead", email: `lead-creator-${Date.now()}@example.com`, roleId } }),
    ]);
    ownerId = owner.id;
    creatorId = creator.id;

    const contact = await prisma.contact.create({
      data: { name: `Lead Teste Follow-up ${Date.now()}`, ownerUserId: ownerId, origin: "MANUAL" },
    });
    contactId = contact.id;
  });

  afterAll(async () => {
    await prisma.task.deleteMany({ where: { id: { in: taskIds } } });
    await prisma.contact.deleteMany({ where: { id: contactId } });
    await prisma.user.deleteMany({ where: { id: { in: [ownerId, creatorId] } } });
    await prisma.role.deleteMany({ where: { name: "TesteLeadService" } });
    await prisma.$disconnect();
  });

  it("cria a tarefa de follow-up atribuída ao dono do lead, com origin AUTOMACAO e vencimento hoje", async () => {
    const contact = await prisma.contact.findUniqueOrThrow({ where: { id: contactId } });
    const task = await createFollowUpTaskForNewContact(prisma, {
      contactId: contact.id,
      contactName: contact.name,
      ownerUserId: contact.ownerUserId,
      createdByUserId: creatorId,
    });
    taskIds.push(task.id);

    expect(task.contactId).toBe(contactId);
    expect(task.assignedUserId).toBe(ownerId);
    expect(task.createdByUserId).toBe(creatorId);
    expect(task.origin).toBe("AUTOMACAO");
    expect(task.taskType).toBe("ligar");
    expect(task.status).toBe("PENDENTE");
    expect(task.title).toContain(contact.name);
    expect(task.dueAt).not.toBeNull();
    expect(task.dueAt!.toDateString()).toBe(new Date().toDateString());
  });

  it("usa o criador como responsável quando o lead não tem dono (ownerUserId null)", async () => {
    const orphanContact = await prisma.contact.create({
      data: { name: `Lead Sem Dono ${Date.now()}`, ownerUserId: null, origin: "MANUAL" },
    });

    const task = await createFollowUpTaskForNewContact(prisma, {
      contactId: orphanContact.id,
      contactName: orphanContact.name,
      ownerUserId: null,
      createdByUserId: creatorId,
    });
    taskIds.push(task.id);

    expect(task.assignedUserId).toBe(creatorId);

    await prisma.contact.deleteMany({ where: { id: orphanContact.id } });
  });
});
