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
 * Cobre os dois lados de cada regra — não só "quem não pode, é bloqueado",
 * mas também "quem pode, continua acessando normalmente" — para garantir que
 * a correção não introduziu um bloqueio geral disfarçado de correção de
 * escopo.
 *
 * Dados de fixture são criados diretamente via Prisma (mesmo padrão já usado
 * nos testes de integração do projeto) — só a navegação/sessão real passa
 * pelo navegador, que é a parte que de fato precisa ser um E2E.
 */

const RUN_ID = `e2e-scope-${Date.now()}`;
const PASSWORD = "SenhaE2eScope!2026";
const CREDIT_STATUS_MARKER = `${RUN_ID}-status-credito-aprovado`;
const NONEXISTENT_ID = `${RUN_ID}-id-inexistente`;

let corretorA: { id: string; email: string; name: string };
let corretorB: { id: string; email: string; name: string };
let gestor: { id: string; email: string; name: string };
let admin: { id: string; email: string; name: string };
let leadOfA: { id: string; name: string };
let visitOfA: { id: string };
let taskOfA: { id: string };

test.beforeAll(async () => {
  const [corretorRole, gestorRole, adminRole] = await Promise.all([
    prisma.role.findFirstOrThrow({ where: { name: "Corretor" } }),
    prisma.role.findFirstOrThrow({ where: { name: "Gestor" } }),
    prisma.role.findFirstOrThrow({ where: { name: "Administrador" } }),
  ]);
  const passwordHash = await hashPassword(PASSWORD);

  const [userA, userB, userGestor, userAdmin] = await Promise.all([
    prisma.user.create({
      data: { name: `${RUN_ID}-corretor-a`, email: `${RUN_ID}-a@mabres.local`, passwordHash, roleId: corretorRole.id, isActive: true },
    }),
    prisma.user.create({
      data: { name: `${RUN_ID}-corretor-b`, email: `${RUN_ID}-b@mabres.local`, passwordHash, roleId: corretorRole.id, isActive: true },
    }),
    prisma.user.create({
      data: { name: `${RUN_ID}-gestor`, email: `${RUN_ID}-gestor@mabres.local`, passwordHash, roleId: gestorRole.id, isActive: true },
    }),
    prisma.user.create({
      data: { name: `${RUN_ID}-admin`, email: `${RUN_ID}-admin@mabres.local`, passwordHash, roleId: adminRole.id, isActive: true },
    }),
  ]);
  corretorA = userA;
  corretorB = userB;
  gestor = userGestor;
  admin = userAdmin;

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
    data: {
      contactId: contact.id,
      individualIncome: "12345.67",
      restrictedNotes: `${RUN_ID}-nota-financeira-sigilosa`,
      creditAnalysisStatus: CREDIT_STATUS_MARKER,
    },
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
  // AuditLog é append-only (G17) — não é apagado no cleanup.
  await prisma.user.deleteMany({ where: { id: { in: [corretorA.id, corretorB.id, gestor.id, admin.id] } } });
  await prisma.$disconnect();
});

async function loginAs(page: Page, email: string) {
  await page.goto("/login");
  await page.getByLabel("E-mail").fill(email);
  await page.getByLabel("Senha").fill(PASSWORD);
  await page.getByRole("button", { name: "Entrar" }).click();
  await page.waitForURL("**/dashboard");
}

test.describe("S2 + S18 — escopo por dono e dados financeiros em Leads", () => {
  test("[negativo] corretor B não vê o lead do corretor A na listagem de leads", async ({ page }) => {
    await loginAs(page, corretorB.email);
    await page.goto("/leads");
    await expect(page.locator("body")).not.toContainText(leadOfA.name);
  });

  test("[negativo] corretor B não acessa o detalhe do lead do corretor A por URL direta (IDOR)", async ({ page }) => {
    await loginAs(page, corretorB.email);
    const response = await page.goto(`/leads/${leadOfA.id}`);
    expect(response?.status(), "página deveria bloquear acesso (404/500), não retornar 200").not.toBe(200);
    await expect(page.locator("body")).not.toContainText(leadOfA.name);
  });

  test("[negativo/isolado] contacts:view_financial sozinho não contorna o escopo por dono — corretor B tem a permissão mas continua bloqueado", async ({ page }) => {
    // Corretor B tem o mesmo papel "Corretor" que Corretor A, portanto TEM
    // contacts:view_financial. Este teste prova especificamente que possuir
    // essa permissão não basta: sem contacts:view_all (ou ser o dono), o
    // acesso ao registro — e por consequência aos dados financeiros dele —
    // continua bloqueado pelo escopo por dono.
    await loginAs(page, corretorB.email);
    const response = await page.goto(`/leads/${leadOfA.id}`);
    expect(response?.status(), "corretor B possui contacts:view_financial, mas isso não deve bypassar o escopo por dono").not.toBe(200);
    await expect(page.locator("body")).not.toContainText(`${RUN_ID}-nota-financeira-sigilosa`);
    await expect(page.locator("body")).not.toContainText(CREDIT_STATUS_MARKER);
  });

  test("[não existe vs. fora de escopo] lead inexistente retorna o mesmo tipo de bloqueio que lead fora de escopo (não permite enumeração)", async ({ page }) => {
    await loginAs(page, corretorB.email);
    const responseNonexistent = await page.goto(`/leads/${NONEXISTENT_ID}`);
    const responseOutOfScope = await page.goto(`/leads/${leadOfA.id}`);
    expect(responseNonexistent?.status()).not.toBe(200);
    expect(responseOutOfScope?.status()).not.toBe(200);
    expect(responseNonexistent?.status()).toBe(responseOutOfScope?.status());
  });

  test("[positivo] corretor A (dono) acessa o próprio lead e vê os dados financeiros restritos", async ({ page }) => {
    await loginAs(page, corretorA.email);
    const response = await page.goto(`/leads/${leadOfA.id}`);
    expect(response?.status()).toBe(200);
    await expect(page.getByRole("heading", { name: leadOfA.name })).toBeVisible();
    await expect(page.getByText("Dados financeiros (restrito)")).toBeVisible();
    await expect(page.getByText(CREDIT_STATUS_MARKER)).toBeVisible();
  });

  test("[positivo] gestor com contacts:view_all acessa o lead de outro corretor na listagem e no detalhe", async ({ page }) => {
    await loginAs(page, gestor.email);
    await page.goto("/leads");
    await expect(page.locator("body")).toContainText(leadOfA.name);

    const response = await page.goto(`/leads/${leadOfA.id}`);
    expect(response?.status()).toBe(200);
    await expect(page.getByRole("heading", { name: leadOfA.name })).toBeVisible();
  });
});

test.describe("S4 — escopo por responsável em Visitas e Tarefas", () => {
  test("[negativo] corretor B não acessa o detalhe da visita do corretor A por URL direta (IDOR)", async ({ page }) => {
    await loginAs(page, corretorB.email);
    const response = await page.goto(`/visits/${visitOfA.id}`);
    expect(response?.status(), "página deveria bloquear acesso (404/500), não retornar 200").not.toBe(200);
    await expect(page.locator("body")).not.toContainText(`${RUN_ID}-nota-interna-da-visita`);
  });

  test("[positivo] corretor A (corretor responsável) acessa a própria visita", async ({ page }) => {
    await loginAs(page, corretorA.email);
    const response = await page.goto(`/visits/${visitOfA.id}`);
    expect(response?.status()).toBe(200);
    await expect(page.getByRole("heading", { name: /Visita/ })).toBeVisible();
  });

  test("[positivo] gestor com visits:view_all acessa a visita de outro corretor", async ({ page }) => {
    await loginAs(page, gestor.email);
    const response = await page.goto(`/visits/${visitOfA.id}`);
    expect(response?.status()).toBe(200);
    await expect(page.getByRole("heading", { name: /Visita/ })).toBeVisible();
  });

  test("[negativo] corretor B não acessa o detalhe da tarefa do corretor A por URL direta (IDOR)", async ({ page }) => {
    await loginAs(page, corretorB.email);
    const response = await page.goto(`/tasks/${taskOfA.id}`);
    expect(response?.status(), "página deveria bloquear acesso (404/500), não retornar 200").not.toBe(200);
    await expect(page.locator("body")).not.toContainText(`${RUN_ID}-tarefa-confidencial`);
  });

  test("[positivo] corretor A (responsável) acessa a própria tarefa", async ({ page }) => {
    await loginAs(page, corretorA.email);
    const response = await page.goto(`/tasks/${taskOfA.id}`);
    expect(response?.status()).toBe(200);
    await expect(page.getByRole("heading", { name: `${RUN_ID}-tarefa-confidencial` })).toBeVisible();
  });

  test("[positivo] gestor com tasks:view_all acessa a tarefa de outro corretor", async ({ page }) => {
    await loginAs(page, gestor.email);
    const response = await page.goto(`/tasks/${taskOfA.id}`);
    expect(response?.status()).toBe(200);
    await expect(page.getByRole("heading", { name: `${RUN_ID}-tarefa-confidencial` })).toBeVisible();
  });
});

test.describe("U2 + S3 — páginas administrativas sem checagem de permissão", () => {
  test("[negativo] corretor (sem users:view) não acessa a listagem de usuários", async ({ page }) => {
    await loginAs(page, corretorB.email);
    const response = await page.goto("/admin/users");
    expect(response?.status(), "página deveria bloquear acesso (403/404/500), não retornar 200 com a lista").not.toBe(200);
    await expect(page.locator("body")).not.toContainText(corretorA.email);
  });

  test("[negativo] corretor (sem users:reassign_records) não acessa a página de reatribuição", async ({ page }) => {
    await loginAs(page, corretorB.email);
    const response = await page.goto(`/admin/users/${corretorA.id}/reassign`);
    expect(response?.status(), "página deveria bloquear acesso (403/404/500), não retornar 200 com o formulário").not.toBe(200);
    await expect(page.locator("body")).not.toContainText("Reatribuir registros");
  });

  test("[negativo] link \"Administração\" não aparece no menu para quem não tem users:view", async ({ page }) => {
    await loginAs(page, corretorB.email);
    await page.goto("/dashboard");
    await expect(page.getByRole("navigation")).not.toContainText("Administração");
  });

  test("[positivo] usuário com users:view acessa a listagem de usuários", async ({ page }) => {
    await loginAs(page, admin.email);
    const response = await page.goto("/admin/users");
    expect(response?.status()).toBe(200);
    await expect(page.locator("body")).toContainText(corretorA.email);
  });

  test("[positivo] usuário com users:reassign_records acessa a página de reatribuição", async ({ page }) => {
    await loginAs(page, admin.email);
    const response = await page.goto(`/admin/users/${corretorA.id}/reassign`);
    expect(response?.status()).toBe(200);
    await expect(page.getByRole("heading", { name: `Reatribuir registros de ${corretorA.name}` })).toBeVisible();
  });

  test("[positivo] link \"Administração\" aparece no menu para quem tem users:view", async ({ page }) => {
    await loginAs(page, admin.email);
    await page.goto("/dashboard");
    await expect(page.getByRole("navigation")).toContainText("Administração");
  });
});
