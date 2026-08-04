import { test, expect, type Page } from "@playwright/test";
import { prisma, createNotificationIdempotent } from "@mabres/db";
import { hashPassword } from "@mabres/shared";

/**
 * Cobre o Sprint 2 (Marco 1.9 — G28 Notificações + G29 Gestão diária).
 * Mesmo padrão de fixtures via Prisma dos sprints anteriores, contra um
 * build de produção real.
 */

const RUN_ID = `e2e-sprint2-${Date.now()}`;
const PASSWORD = "SenhaE2eSprint2!2026";

let corretorA: { id: string; email: string };
let corretorB: { id: string; email: string };
let corretorSemNotificacoes: { id: string; email: string };
let taskForNotification: { id: string };
let visitForNotification: { id: string };
let unreadNotificationId: string;
let readNotificationId: string;
let otherUserNotificationId: string;

let leadNuncaContatado: { id: string; name: string };
let leadParadoAntigo: { id: string; name: string };
let leadContatoRecente: { id: string; name: string };

let taskHoje: { id: string; title: string };
let taskAtrasada: { id: string; title: string };
let taskFutura: { id: string; title: string };

let propertyId: string;

test.beforeAll(async () => {
  const corretorRole = await prisma.role.findFirstOrThrow({ where: { name: "Corretor" } });
  const passwordHash = await hashPassword(PASSWORD);

  const [userA, userB, userC] = await Promise.all([
    prisma.user.create({
      data: { name: `${RUN_ID}-corretor-a`, email: `${RUN_ID}-a@mabres.local`, passwordHash, roleId: corretorRole.id, isActive: true },
    }),
    prisma.user.create({
      data: { name: `${RUN_ID}-corretor-b`, email: `${RUN_ID}-b@mabres.local`, passwordHash, roleId: corretorRole.id, isActive: true },
    }),
    prisma.user.create({
      data: { name: `${RUN_ID}-corretor-sem-notif`, email: `${RUN_ID}-c@mabres.local`, passwordHash, roleId: corretorRole.id, isActive: true },
    }),
  ]);
  corretorA = userA;
  corretorB = userB;
  corretorSemNotificacoes = userC;

  const property = await prisma.property.create({
    data: { internalCode: `${RUN_ID}-MB`, propertyType: "apartamento", city: "Sorocaba", state: "SP" },
  });
  propertyId = property.id;

  const contactForFixtures = await prisma.contact.create({
    // lastContactAt "agora" para não ser pego pelo card "Leads parados"
    // (não é o que este contato de apoio está testando — evita colidir com
    // a asserção de "Nunca houve contato registrado" nos testes do G29).
    data: { name: `${RUN_ID}-lead-base`, ownerUserId: corretorA.id, origin: "MANUAL", lastContactAt: new Date() },
  });

  const task = await prisma.task.create({
    data: {
      title: `${RUN_ID}-tarefa-notif`,
      contactId: contactForFixtures.id,
      assignedUserId: corretorA.id,
      createdByUserId: corretorA.id,
      taskType: "ligar",
    },
  });
  taskForNotification = task;

  const visit = await prisma.visit.create({
    data: {
      contactId: contactForFixtures.id,
      propertyId: property.id,
      brokerUserId: corretorA.id,
      createdByUserId: corretorA.id,
      scheduledAt: new Date(Date.now() + 24 * 60 * 60_000),
    },
  });
  visitForNotification = visit;

  const [unread, read, otherUsers] = await Promise.all([
    createNotificationIdempotent(prisma, {
      userId: corretorA.id,
      type: "tarefa_vencida",
      title: `${RUN_ID}-notif-nao-lida`,
      body: "Corpo da notificação não lida",
      entityType: "Task",
      entityId: task.id,
      idempotencyKey: `${RUN_ID}:unread`,
    }),
    createNotificationIdempotent(prisma, {
      userId: corretorA.id,
      type: "visita_proxima",
      title: `${RUN_ID}-notif-lida`,
      entityType: "Visit",
      entityId: visit.id,
      idempotencyKey: `${RUN_ID}:read`,
    }),
    createNotificationIdempotent(prisma, {
      userId: corretorB.id,
      type: "tarefa_vencida",
      title: `${RUN_ID}-notif-outro-usuario`,
      entityType: "Task",
      entityId: task.id,
      idempotencyKey: `${RUN_ID}:otheruser`,
    }),
  ]);
  unreadNotificationId = unread!.id;
  readNotificationId = read!.id;
  otherUserNotificationId = otherUsers!.id;
  await prisma.notification.update({ where: { id: readNotificationId }, data: { readAt: new Date() } });

  // G29 — Lead parado
  const staleDate = new Date();
  staleDate.setDate(staleDate.getDate() - 10);
  const recentDate = new Date();
  recentDate.setDate(recentDate.getDate() - 1);

  const [neverContacted, staleContacted, recentlyContacted] = await Promise.all([
    prisma.contact.create({ data: { name: `${RUN_ID}-lead-nunca-contatado`, ownerUserId: corretorA.id, origin: "MANUAL", lastContactAt: null } }),
    prisma.contact.create({ data: { name: `${RUN_ID}-lead-parado-antigo`, ownerUserId: corretorA.id, origin: "MANUAL", lastContactAt: staleDate } }),
    prisma.contact.create({ data: { name: `${RUN_ID}-lead-contato-recente`, ownerUserId: corretorA.id, origin: "MANUAL", lastContactAt: recentDate } }),
  ]);
  leadNuncaContatado = neverContacted;
  leadParadoAntigo = staleContacted;
  leadContatoRecente = recentlyContacted;

  // G29 — Tasks Hoje/Atrasadas
  const inTwoHours = new Date(Date.now() + 2 * 60 * 60_000);
  const yesterday = new Date(Date.now() - 24 * 60 * 60_000);
  const nextWeek = new Date(Date.now() + 7 * 24 * 60 * 60_000);

  const [hoje, atrasada, futura] = await Promise.all([
    prisma.task.create({
      data: { title: `${RUN_ID}-tarefa-hoje`, assignedUserId: corretorA.id, createdByUserId: corretorA.id, taskType: "ligar", dueAt: inTwoHours },
    }),
    prisma.task.create({
      data: { title: `${RUN_ID}-tarefa-atrasada`, assignedUserId: corretorA.id, createdByUserId: corretorA.id, taskType: "ligar", dueAt: yesterday },
    }),
    prisma.task.create({
      data: { title: `${RUN_ID}-tarefa-futura`, assignedUserId: corretorA.id, createdByUserId: corretorA.id, taskType: "ligar", dueAt: nextWeek },
    }),
  ]);
  taskHoje = hoje;
  taskAtrasada = atrasada;
  taskFutura = futura;
});

test.afterAll(async () => {
  await prisma.notification.deleteMany({
    where: { id: { in: [unreadNotificationId, readNotificationId, otherUserNotificationId] } },
  });
  await prisma.task.deleteMany({
    where: {
      id: { in: [taskForNotification.id, taskHoje.id, taskAtrasada.id, taskFutura.id] },
    },
  });
  await prisma.task.deleteMany({ where: { title: { contains: `${RUN_ID}-lead-novo` } } });
  await prisma.visit.deleteMany({ where: { id: visitForNotification.id } });
  await prisma.property.deleteMany({ where: { id: propertyId } });
  await prisma.contact.deleteMany({
    where: { name: { startsWith: RUN_ID } },
  });
  await prisma.auditLog.deleteMany({ where: { actorUserId: { in: [corretorA.id, corretorB.id, corretorSemNotificacoes.id] } } });
  await prisma.user.deleteMany({ where: { id: { in: [corretorA.id, corretorB.id, corretorSemNotificacoes.id] } } });
  await prisma.$disconnect();
});

async function loginAs(page: Page, email: string) {
  await page.goto("/login");
  await page.getByLabel("E-mail").fill(email);
  await page.getByLabel("Senha").fill(PASSWORD);
  await page.getByRole("button", { name: "Entrar" }).click();
  await page.waitForURL("**/dashboard");
}

const bellButton = (page: Page) => page.locator('button[aria-controls="notifications-panel"]');
const panel = (page: Page) => page.locator("#notifications-panel");

test.describe("G28 — sino de notificações", () => {
  test("mostra o contador de não lidas e é um botão real com aria-expanded/aria-controls", async ({ page }) => {
    await loginAs(page, corretorA.email);
    const button = bellButton(page);
    await expect(button).toBeVisible();
    await expect(button).toHaveAttribute("aria-controls", "notifications-panel");
    await expect(button).toHaveAttribute("aria-expanded", "false");
    await expect(button.locator("span", { hasText: "1" })).toBeVisible();
  });

  test("abre a lista, mostra as próprias notificações (lida e não lida) e nenhuma de outro usuário", async ({ page }) => {
    await loginAs(page, corretorA.email);
    await bellButton(page).click();
    await expect(bellButton(page)).toHaveAttribute("aria-expanded", "true");

    await expect(panel(page).getByText(`${RUN_ID}-notif-nao-lida`)).toBeVisible();
    await expect(panel(page).getByText(`${RUN_ID}-notif-lida`)).toBeVisible();
    await expect(panel(page)).not.toContainText(`${RUN_ID}-notif-outro-usuario`);
  });

  test("estado vazio: usuário sem nenhuma notificação vê a mensagem correspondente", async ({ page }) => {
    await loginAs(page, corretorSemNotificacoes.email);
    await expect(bellButton(page).locator("span")).toHaveCount(0);
    await bellButton(page).click();
    await expect(panel(page).getByText("Nenhuma notificação.")).toBeVisible();
  });

  test("marcar como lida decrementa o contador", async ({ page }) => {
    await loginAs(page, corretorA.email);
    await bellButton(page).click();
    await panel(page).getByText(`${RUN_ID}-notif-nao-lida`).waitFor();

    await expect(bellButton(page).locator("span", { hasText: "1" })).toBeVisible();

    const item = panel(page).locator("li", { hasText: `${RUN_ID}-notif-nao-lida` });
    await item.getByRole("button", { name: "Marcar como lida" }).click();

    await expect(bellButton(page).locator("span")).toHaveCount(0);
  });

  test("clicar numa notificação com entidade Task navega para a tarefa relacionada", async ({ page }) => {
    await loginAs(page, corretorA.email);
    await bellButton(page).click();
    await panel(page).getByText(`${RUN_ID}-notif-nao-lida`).waitFor();

    await panel(page).getByText(`${RUN_ID}-notif-nao-lida`).click();
    await page.waitForURL(`**/tasks/${taskForNotification.id}`);
  });

  test("clicar numa notificação com entidade Visit navega para a visita relacionada", async ({ page }) => {
    await loginAs(page, corretorA.email);
    await bellButton(page).click();
    await panel(page).getByText(`${RUN_ID}-notif-lida`).waitFor();

    await panel(page).getByText(`${RUN_ID}-notif-lida`).click();
    await page.waitForURL(`**/visits/${visitForNotification.id}`);
  });

  test("comportamento mobile: painel não ultrapassa a largura da viewport", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await loginAs(page, corretorA.email);
    await bellButton(page).click();
    const box = await panel(page).boundingBox();
    expect(box).not.toBeNull();
    expect(box!.x).toBeGreaterThanOrEqual(0);
    expect(box!.x + box!.width).toBeLessThanOrEqual(390 + 1);
  });
});

test.describe("G29 — Lead parado no dashboard", () => {
  test("mostra leads nunca contatados e parados há 3+ dias, com dias e link, mas não os contatados recentemente", async ({ page }) => {
    await loginAs(page, corretorA.email);
    await page.goto("/dashboard");

    await expect(page.getByText("Leads parados")).toBeVisible();
    await expect(page.getByRole("link", { name: leadNuncaContatado.name })).toBeVisible();
    await expect(page.getByRole("link", { name: leadParadoAntigo.name })).toBeVisible();
    await expect(page.getByText("Nunca houve contato registrado")).toBeVisible();
    // A aritmética exata de dias já é coberta pelo teste unitário de
    // daysSince (lib/dashboard-service.test.ts) — aqui só confirma que o
    // valor chega renderizado na tela, sem travar num número exato.
    await expect(page.getByText(/\d+ dia\(s\) sem contato/)).toBeVisible();
    await expect(page.locator("body")).not.toContainText(leadContatoRecente.name);
  });
});

test.describe("G29 — filtros rápidos de Tarefas", () => {
  test("view=hoje mostra a tarefa de hoje, não mostra a atrasada nem a futura", async ({ page }) => {
    await loginAs(page, corretorA.email);
    await page.goto("/tasks?view=hoje");

    await expect(page.getByRole("link", { name: taskHoje.title })).toBeVisible();
    await expect(page.locator("body")).not.toContainText(taskAtrasada.title);
    await expect(page.locator("body")).not.toContainText(taskFutura.title);
  });

  test("view=atrasadas mostra a tarefa atrasada, não mostra a de hoje nem a futura", async ({ page }) => {
    await loginAs(page, corretorA.email);
    await page.goto("/tasks?view=atrasadas");

    await expect(page.getByRole("link", { name: taskAtrasada.title })).toBeVisible();
    await expect(page.locator("body")).not.toContainText(taskHoje.title);
    await expect(page.locator("body")).not.toContainText(taskFutura.title);
  });
});

test.describe("G29 — Lead novo cria tarefa de follow-up automaticamente", () => {
  test("ao cadastrar um lead pela UI, a tarefa \"Primeiro contato\" é criada e aparece no detalhe do lead", async ({ page }) => {
    await loginAs(page, corretorA.email);
    await page.goto("/leads/new");
    await page.fill('input[name="name"]', `${RUN_ID}-lead-novo-e2e`);
    await page.getByRole("button", { name: "Cadastrar lead" }).click();

    await page.waitForURL((url) => /^\/leads\/(?!new$)[^/]+$/.test(url.pathname));

    await expect(page.getByRole("heading", { name: "Tarefas abertas" })).toBeVisible();
    await expect(page.getByText(`Primeiro contato — ${RUN_ID}-lead-novo-e2e`)).toBeVisible();
  });
});
