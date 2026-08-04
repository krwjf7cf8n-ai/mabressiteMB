import { test, expect, type Page } from "@playwright/test";
import { prisma } from "@mabres/db";
import { hashPassword } from "@mabres/shared";

/**
 * Reproduz e depois prova a correção dos achados S2, S3, S4, S18 (Auditoria 3
 * — Segurança) e U2 (Auditoria 8 — Usabilidade), todos da mesma causa raiz:
 * páginas que leem dados sem aplicar o escopo por dono (Leads/Visitas/
 * Tarefas) ou sem checar permissão de leitura (listagem de usuários, página
 * de reatribuição).
 *
 * Dados de fixture são criados diretamente via Prisma (mesmo padrão já usado
 * nos testes de integração do projeto) — só a navegação/sessão real passa
 * pelo navegador, que é a parte que de fato precisa ser um E2E.
 */

const RUN_ID = `e2e-scope-${Date.now()}`;
const PASSWORD = "SenhaE2eScope!2026";

let corretorA: { id: string; email: string };
let corretorB: { id: string; email: string };
let leadOfA: { id: string; name: string };
let visitOfA: { id: string };
let taskOfA: { id: string };

test.beforeAll(async () => {
  const corretorRole = await prisma.role.findFirstOrThrow({ where: { name: "Corretor" } });
  const passwordHash = await hashPassword(PASSWORD);

  const [userA, userB] = await Promise.all([
    prisma.user.create({
      data: { name: `${RUN_ID}-corretor-a`, email: `${RUN_ID}-a@mabres.local`, passwordHash, roleId: corretorRole.id, isActive: true },
    }),
    prisma.user.create({
      data: { name: `${RUN_ID}-corretor-b`, email: `${RUN_ID}-b@mabres.local`, passwordHash, roleId: corretorRole.id, isActive: true },
    }),
  ]);
  corretorA = userA;
  corretorB = userB;

  const contact = await prisma.contact.create({
    data: {
      name: `${RUN_ID}-lead-confidencial`,
      phone: "15999990000",
      ownerUserId: corretorA.id,
      origin: "MANUAL",
    },
  });
  leadOfA = contact;

  await prisma.contactFinancialInfo.create({
    data: { contactId: contact.id, individualIncome: "12345.67", restrictedNotes: `${RUN_ID}-nota-financeira-sigilosa` },
  });

  const property = await prisma.property.create({
    data: { internalCode: `${RUN_ID}-MB`, propertyType: "apartamento", city: "Sorocaba", state: "SP" },
  });

  const visit = await prisma.visit.create({
    data: {
      contactId: contact.id,
      propertyId: property.id,
      brokerUserId: corretorA.id,
      createdByUserId: corretorA.id,
      scheduledAt: new Date(Date.now() + 24 * 60 * 60_000),
      internalNotes: `${RUN_ID}-nota-interna-da-visita`,
    },
  });
  visitOfA = visit;

  const task = await prisma.task.create({
    data: {
      title: `${RUN_ID}-tarefa-confidencial`,
      contactId: contact.id,
      assignedUserId: corretorA.id,
      createdByUserId: corretorA.id,
      taskType: "ligar",
    },
  });
  taskOfA = task;
});

test.afterAll(async () => {
  await prisma.task.deleteMany({ where: { id: taskOfA.id } });
  // VisitEvent é append-only (middleware bloqueia delete direto); a exclusão
  // do Visit abaixo já apaga em cascata qualquer evento associado a nível de banco.
  await prisma.visit.deleteMany({ where: { id: visitOfA.id } });
  await prisma.property.deleteMany({ where: { internalCode: `${RUN_ID}-MB` } });
  await prisma.contactFinancialInfo.deleteMany({ where: { contactId: leadOfA.id } });
  await prisma.contact.deleteMany({ where: { id: leadOfA.id } });
  await prisma.auditLog.deleteMany({ where: { actorUserId: { in: [corretorA.id, corretorB.id] } } });
  await prisma.user.deleteMany({ where: { id: { in: [corretorA.id, corretorB.id] } } });
  await prisma.$disconnect();
});

async function loginAs(page: Page, email: string) {
  await page.goto("/login");
  await page.fill("#email", email);
  await page.fill("#password", PASSWORD);
  await page.click('button[type="submit"]');
  await page.waitForURL("**/dashboard");
}

test.describe("S2 + S18 — escopo por dono e dados financeiros em Leads", () => {
  test("corretor B não vê o lead do corretor A na listagem de leads", async ({ page }) => {
    await loginAs(page, corretorB.email);
    await page.goto("/leads");
    await expect(page.locator("body")).not.toContainText(leadOfA.name);
  });

  test("corretor B não acessa o detalhe do lead do corretor A nem seus dados financeiros por URL direta", async ({ page }) => {
    await loginAs(page, corretorB.email);
    const response = await page.goto(`/leads/${leadOfA.id}`);
    expect(response?.status(), "página deveria bloquear acesso (404/500), não retornar 200").not.toBe(200);
    await expect(page.locator("body")).not.toContainText(leadOfA.name);
    await expect(page.locator("body")).not.toContainText(`${RUN_ID}-nota-financeira-sigilosa`);
  });
});

test.describe("S4 — escopo por responsável em Visitas e Tarefas", () => {
  test("corretor B não acessa o detalhe da visita do corretor A por URL direta", async ({ page }) => {
    await loginAs(page, corretorB.email);
    const response = await page.goto(`/visits/${visitOfA.id}`);
    expect(response?.status(), "página deveria bloquear acesso (404/500), não retornar 200").not.toBe(200);
    await expect(page.locator("body")).not.toContainText(`${RUN_ID}-nota-interna-da-visita`);
  });

  test("corretor B não acessa o detalhe da tarefa do corretor A por URL direta", async ({ page }) => {
    await loginAs(page, corretorB.email);
    const response = await page.goto(`/tasks/${taskOfA.id}`);
    expect(response?.status(), "página deveria bloquear acesso (404/500), não retornar 200").not.toBe(200);
    await expect(page.locator("body")).not.toContainText(`${RUN_ID}-tarefa-confidencial`);
  });
});

test.describe("U2 + S3 — páginas administrativas sem checagem de permissão", () => {
  test("corretor (sem users:view) não acessa a listagem de usuários", async ({ page }) => {
    await loginAs(page, corretorB.email);
    const response = await page.goto("/admin/users");
    expect(response?.status(), "página deveria bloquear acesso (403/404/500), não retornar 200 com a lista").not.toBe(200);
    await expect(page.locator("body")).not.toContainText(corretorA.email);
  });

  test("corretor (sem users:reassign_records) não acessa a página de reatribuição", async ({ page }) => {
    await loginAs(page, corretorB.email);
    const response = await page.goto(`/admin/users/${corretorA.id}/reassign`);
    expect(response?.status(), "página deveria bloquear acesso (403/404/500), não retornar 200 com o formulário").not.toBe(200);
    await expect(page.locator("body")).not.toContainText("Reatribuir registros");
  });

  test("link \"Administração\" não aparece no menu para quem não tem users:view", async ({ page }) => {
    await loginAs(page, corretorB.email);
    await page.goto("/dashboard");
    await expect(page.locator("header nav")).not.toContainText("Administração");
  });
});
