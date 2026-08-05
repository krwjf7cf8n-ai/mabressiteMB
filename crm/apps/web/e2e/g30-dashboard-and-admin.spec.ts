import { test, expect } from "@playwright/test";
import { prisma } from "@mabres/db";
import { hashPassword } from "@mabres/shared";

/**
 * Marco 1.9 — Sprint 6 (G30): cards do dashboard passam a ser links para a
 * listagem já filtrada equivalente, em vez de números estáticos.
 */

const RUN_ID = `e2e-g30-${Date.now()}`;
const PASSWORD = "SenhaE2eG30!2026";

let corretor: { id: string; email: string };
let admin: { id: string; email: string };
let leadHoje: { id: string; name: string };
let leadAntigo: { id: string; name: string };
let taskHoje: { id: string; title: string };
let taskFutura: { id: string; title: string };
let visitAguardando: { id: string };
let propertyId: string;

function daysAgoDate(days: number): Date {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return d;
}

test.beforeAll(async () => {
  const [corretorRole, adminRole] = await Promise.all([
    prisma.role.findFirstOrThrow({ where: { name: "Corretor" } }),
    prisma.role.findFirstOrThrow({ where: { name: "Administrador" } }),
  ]);
  const passwordHash = await hashPassword(PASSWORD);
  corretor = await prisma.user.create({
    data: { name: `${RUN_ID}-corretor`, email: `${RUN_ID}-corretor@mabres.local`, passwordHash, roleId: corretorRole.id, isActive: true },
  });
  admin = await prisma.user.create({
    data: { name: `${RUN_ID}-admin`, email: `${RUN_ID}-admin@mabres.local`, passwordHash, roleId: adminRole.id, isActive: true },
  });

  const property = await prisma.property.create({
    data: { internalCode: `${RUN_ID}-MB`, propertyType: "apartamento", city: "Sorocaba", state: "SP" },
  });
  propertyId = property.id;

  const [lh, la] = await Promise.all([
    prisma.contact.create({
      data: { name: `${RUN_ID}-lead-hoje`, phone: "15999990001", ownerUserId: corretor.id, origin: "MANUAL", createdAt: new Date() },
    }),
    prisma.contact.create({
      data: {
        name: `${RUN_ID}-lead-antigo`,
        phone: "15999990002",
        ownerUserId: corretor.id,
        origin: "MANUAL",
        createdAt: daysAgoDate(120),
      },
    }),
  ]);
  leadHoje = lh;
  leadAntigo = la;

  const now = new Date();
  const [th, tf] = await Promise.all([
    prisma.task.create({
      data: {
        title: `${RUN_ID}-tarefa-hoje`,
        contactId: leadHoje.id,
        assignedUserId: corretor.id,
        createdByUserId: corretor.id,
        taskType: "ligar",
        dueAt: now,
      },
    }),
    prisma.task.create({
      data: {
        title: `${RUN_ID}-tarefa-futura`,
        contactId: leadHoje.id,
        assignedUserId: corretor.id,
        createdByUserId: corretor.id,
        taskType: "ligar",
        dueAt: new Date(now.getTime() + 3 * 24 * 60 * 60_000),
      },
    }),
  ]);
  taskHoje = th;
  taskFutura = tf;

  visitAguardando = await prisma.visit.create({
    data: {
      contactId: leadHoje.id,
      propertyId,
      brokerUserId: corretor.id,
      createdByUserId: corretor.id,
      scheduledAt: new Date(now.getTime() + 24 * 60 * 60_000),
      status: "AGUARDANDO_CONFIRMACAO",
    },
  });
});

test.afterAll(async () => {
  await prisma.task.deleteMany({ where: { id: { in: [taskHoje.id, taskFutura.id] } } });
  await prisma.visit.deleteMany({ where: { id: visitAguardando.id } });
  await prisma.contact.deleteMany({ where: { id: { in: [leadHoje.id, leadAntigo.id] } } });
  await prisma.property.deleteMany({ where: { id: propertyId } });
  await prisma.pipelineStage.deleteMany({ where: { order: { gte: 91000 } } });
  await prisma.user.deleteMany({ where: { id: { in: [corretor.id, admin.id] } } });
  await prisma.$disconnect();
});

async function loginAs(page: import("@playwright/test").Page, email: string) {
  await page.goto("/login");
  await page.getByLabel("E-mail").fill(email);
  await page.getByLabel("Senha").fill(PASSWORD);
  await page.getByRole("button", { name: "Entrar" }).click();
  await page.waitForURL("**/dashboard");
}

test.describe("G30 — dashboard clicável", () => {
  test("card 'Leads hoje' leva para /leads?view=hoje mostrando só o lead de hoje", async ({ page }) => {
    await loginAs(page, corretor.email);
    await page.getByRole("link", { name: /Leads hoje/ }).click();
    await page.waitForURL("**/leads?view=hoje");
    await expect(page.getByText(leadHoje.name)).toBeVisible();
    await expect(page.locator("body")).not.toContainText(leadAntigo.name);
  });

  test("card 'Tarefas para hoje' leva para /tasks?view=hoje mostrando só a tarefa de hoje", async ({ page }) => {
    await loginAs(page, corretor.email);
    await page.getByRole("link", { name: /Tarefas para hoje/ }).click();
    await page.waitForURL("**/tasks?view=hoje");
    await expect(page.getByText(taskHoje.title)).toBeVisible();
    await expect(page.locator("body")).not.toContainText(taskFutura.title);
  });

  test("card 'Aguardando confirmação' (visitas) leva para a lista já filtrada por status", async ({ page }) => {
    await loginAs(page, corretor.email);
    await page.getByRole("link", { name: /Aguardando confirmação/ }).click();
    await page.waitForURL((url) => url.pathname === "/visits" && url.searchParams.get("status") === "AGUARDANDO_CONFIRMACAO");
    await expect(page.getByText("Aguardando confirmação")).toBeVisible();
  });

  test("'Próximas visitas' no dashboard é um link real para o detalhe da visita", async ({ page }) => {
    await loginAs(page, corretor.email);
    // Combina nome do lead + código do imóvel (o texto exato da linha em
    // "Próximas visitas") para não colidir com o link do mesmo lead em
    // "Leads parados" (leadHoje não tem lastContactAt, então aparece lá também).
    const link = page.getByRole("link", { name: `${leadHoje.name} — ${RUN_ID}-MB` });
    await expect(link).toBeVisible();
    await link.click();
    await page.waitForURL(`**/visits/${visitAguardando.id}`);
  });
});

test.describe("G30 — administração das etapas do funil", () => {
  test("aba 'Etapas do funil' aparece na navegação administrativa", async ({ page }) => {
    await loginAs(page, admin.email);
    await page.goto("/admin/users");
    await page.getByRole("link", { name: "Etapas do funil" }).click();
    await page.waitForURL("**/admin/stages");
    await expect(page.getByRole("heading", { name: "Etapas do funil" })).toBeVisible();
  });

  test("cria uma etapa, edita e desativa", async ({ page }) => {
    await loginAs(page, admin.email);
    await page.goto("/admin/stages/new");
    await page.fill('input[name="name"]', `${RUN_ID}-etapa-teste`);
    await page.fill('input[name="order"]', "91001");
    await page.getByRole("button", { name: "Criar etapa" }).click();

    await page.waitForURL("**/admin/stages");
    await expect(page.getByText(`${RUN_ID}-etapa-teste`)).toBeVisible();

    await page.getByRole("link", { name: `${RUN_ID}-etapa-teste` }).click();
    await expect(page.locator('input[name="name"]')).toHaveValue(`${RUN_ID}-etapa-teste`);

    await page.fill('input[name="name"]', `${RUN_ID}-etapa-renomeada`);
    await page.locator('input[name="isActive"]').uncheck();
    await page.getByRole("button", { name: "Salvar alterações" }).click();

    await expect(page.getByRole("heading", { name: `${RUN_ID}-etapa-renomeada` })).toBeVisible();
    await expect(page.getByText("status Inativa")).toBeVisible();
  });

  test("recusa criar uma etapa com ordem já usada por outra", async ({ page }) => {
    await loginAs(page, admin.email);
    const existing = await prisma.pipelineStage.create({
      data: { name: `${RUN_ID}-etapa-existente`, order: 91002, requiresReasonOn: "NONE" },
    });

    await page.goto("/admin/stages/new");
    await page.fill('input[name="name"]', `${RUN_ID}-etapa-conflitante`);
    await page.fill('input[name="order"]', "91002");
    await page.getByRole("button", { name: "Criar etapa" }).click();

    await expect(page.getByText(/já está em uso/)).toBeVisible();

    await prisma.pipelineStage.deleteMany({ where: { id: existing.id } });
  });

  test("corretor sem stages:view não acessa a administração de etapas", async ({ page }) => {
    await loginAs(page, corretor.email);
    const response = await page.goto("/admin/stages");
    expect(response?.status(), "página deveria bloquear acesso, não retornar 200").not.toBe(200);
  });
});
