import { test, expect, type Page } from "@playwright/test";
import { prisma } from "@mabres/db";
import { hashPassword } from "@mabres/shared";

/**
 * Cobre o Sprint 1 (Marco 1.9 — Operação diária e mobile): G24 (navegação e
 * tabelas responsivas), G25 (telefone/WhatsApp clicáveis), G26 (busca e
 * paginação) e G27 (contexto operacional no detalhe). Mesmo padrão de
 * fixtures via Prisma do Sprint 0 — só a navegação/sessão passa pelo
 * navegador real, contra um build de produção.
 */

const RUN_ID = `e2e-sprint1-${Date.now()}`;
const PASSWORD = "SenhaE2eSprint1!2026";
const FILLER_COUNT = 26; // > DEFAULT_PAGE_SIZE (25), força uma segunda página

let corretorA: { id: string; email: string };
let corretorOther: { id: string; email: string };
let leadComTelefone: { id: string; name: string };
let leadSemTelefone: { id: string; name: string };
let fillerLeadIds: string[] = [];
let otherFillerLeadId: string;
let property: { id: string; internalCode: string };
let openTaskId: string;
let visitId: string;

test.beforeAll(async () => {
  const corretorRole = await prisma.role.findFirstOrThrow({ where: { name: "Corretor" } });
  const passwordHash = await hashPassword(PASSWORD);

  const [userA, userOther] = await Promise.all([
    prisma.user.create({
      data: { name: `${RUN_ID}-corretor-a`, email: `${RUN_ID}-a@mabres.local`, passwordHash, roleId: corretorRole.id, isActive: true },
    }),
    prisma.user.create({
      data: { name: `${RUN_ID}-corretor-outro`, email: `${RUN_ID}-outro@mabres.local`, passwordHash, roleId: corretorRole.id, isActive: true },
    }),
  ]);
  corretorA = userA;
  corretorOther = userOther;

  const contactWithPhone = await prisma.contact.create({
    data: {
      name: `${RUN_ID}-lead-comphone`,
      phone: "(15) 99999-1234",
      ownerUserId: corretorA.id,
      origin: "MANUAL",
      lastContactAt: new Date(),
    },
  });
  leadComTelefone = contactWithPhone;

  const contactNoPhone = await prisma.contact.create({
    data: { name: `${RUN_ID}-lead-semfone`, ownerUserId: corretorA.id, origin: "MANUAL" },
  });
  leadSemTelefone = contactNoPhone;

  const fillers = await Promise.all(
    Array.from({ length: FILLER_COUNT }, (_, i) =>
      prisma.contact.create({
        data: { name: `${RUN_ID}-filler-${String(i + 1).padStart(2, "0")}`, ownerUserId: corretorA.id, origin: "MANUAL" },
      }),
    ),
  );
  fillerLeadIds = fillers.map((f) => f.id);

  const otherFiller = await prisma.contact.create({
    data: { name: `${RUN_ID}-filler-outro-responsavel`, ownerUserId: corretorOther.id, origin: "MANUAL" },
  });
  otherFillerLeadId = otherFiller.id;

  const prop = await prisma.property.create({
    data: { internalCode: `${RUN_ID}-MB`, propertyType: "apartamento", city: "Sorocaba", state: "SP" },
  });
  property = prop;

  const visit = await prisma.visit.create({
    data: {
      contactId: leadComTelefone.id,
      propertyId: property.id,
      brokerUserId: corretorA.id,
      createdByUserId: corretorA.id,
      scheduledAt: new Date(Date.now() + 24 * 60 * 60_000),
    },
  });
  visitId = visit.id;

  const task = await prisma.task.create({
    data: {
      title: `${RUN_ID}-tarefa-aberta`,
      contactId: leadComTelefone.id,
      propertyId: property.id,
      assignedUserId: corretorA.id,
      createdByUserId: corretorA.id,
      taskType: "ligar",
    },
  });
  openTaskId = task.id;
});

test.afterAll(async () => {
  await prisma.task.deleteMany({ where: { id: openTaskId } });
  await prisma.visit.deleteMany({ where: { id: visitId } });
  await prisma.property.deleteMany({ where: { id: property.id } });
  await prisma.contact.deleteMany({
    where: { id: { in: [leadComTelefone.id, leadSemTelefone.id, otherFillerLeadId, ...fillerLeadIds] } },
  });
  // AuditLog é append-only (G17) — não é apagado no cleanup.
  await prisma.user.deleteMany({ where: { id: { in: [corretorA.id, corretorOther.id] } } });
  await prisma.$disconnect();
});

async function loginAs(page: Page, email: string) {
  await page.goto("/login");
  await page.getByLabel("E-mail").fill(email);
  await page.getByLabel("Senha").fill(PASSWORD);
  await page.getByRole("button", { name: "Entrar" }).click();
  await page.waitForURL("**/dashboard");
}

test.describe("G24 — menu mobile", () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test("botão de menu aparece em viewport de celular, abre, navega e fecha", async ({ page }) => {
    await loginAs(page, corretorA.email);

    const menuButton = page.locator('button[aria-controls="mobile-nav-menu"]');
    await expect(menuButton).toBeVisible();
    await expect(menuButton).toHaveAttribute("aria-expanded", "false");

    await menuButton.click();
    await expect(menuButton).toHaveAttribute("aria-expanded", "true");

    const nav = page.locator("#mobile-nav-menu");
    await expect(nav).toBeVisible();
    await expect(nav.getByRole("link", { name: "Leads & Clientes" })).toBeVisible();

    await nav.getByRole("link", { name: "Leads & Clientes" }).click();
    await page.waitForURL("**/leads");
    await expect(page.locator("#mobile-nav-menu")).not.toBeVisible();
  });

  test("link \"Administração\" não aparece no menu mobile para quem não tem users:view", async ({ page }) => {
    await loginAs(page, corretorA.email);
    await page.locator('button[aria-controls="mobile-nav-menu"]').click();
    await expect(page.locator("#mobile-nav-menu")).not.toContainText("Administração");
  });
});

test.describe("G24 — tabelas responsivas", () => {
  test.use({ viewport: { width: 390, height: 844 } });

  for (const path of ["/leads", "/properties", "/visits", "/tasks", "/owners"]) {
    test(`listagem ${path} tem tabela dentro de um contêiner com overflow-x-auto`, async ({ page }) => {
      await loginAs(page, corretorA.email);
      await page.goto(path);
      const wrapped = page.locator(".overflow-x-auto table");
      await expect(wrapped.first()).toBeAttached();
    });
  }
});

test.describe("G25 — telefone e WhatsApp clicáveis", () => {
  test("lead com telefone tem link tel: e wa.me normalizados", async ({ page }) => {
    await loginAs(page, corretorA.email);
    // Busca pelo nome para garantir que o lead apareça na página 1,
    // independentemente de quantos outros leads (fixtures de outros testes)
    // existam entre ele e a ordenação padrão por criação mais recente.
    await page.goto(`/leads?q=${encodeURIComponent(leadComTelefone.name)}`);

    const row = page.locator("tr", { hasText: leadComTelefone.name });
    const telLink = row.locator('a[href^="tel:"]');
    await expect(telLink).toHaveAttribute("href", "tel:+5515999991234");

    const waLink = row.locator('a[href^="https://wa.me/"]');
    await expect(waLink).toHaveAttribute("href", "https://wa.me/5515999991234");
  });

  test("lead sem telefone não gera link tel: nem wa.me quebrado", async ({ page }) => {
    await loginAs(page, corretorA.email);
    await page.goto(`/leads?q=${encodeURIComponent(leadSemTelefone.name)}`);

    const row = page.locator("tr", { hasText: leadSemTelefone.name });
    await expect(row).toBeVisible();
    await expect(row.locator('a[href^="tel:"]')).toHaveCount(0);
    await expect(row.locator('a[href^="https://wa.me/"]')).toHaveCount(0);
  });
});

test.describe("G26 — busca e paginação de Leads", () => {
  test("busca por nome retorna só os resultados esperados, preservando o escopo por dono", async ({ page }) => {
    await loginAs(page, corretorA.email);
    await page.goto(`/leads?q=${encodeURIComponent(`${RUN_ID}-filler`)}`);

    // Só os FILLER_COUNT leads de A devem contar — o filler do outro corretor
    // também bate no termo de busca, mas está fora do escopo por dono.
    await expect(page.locator("body")).toContainText(`${FILLER_COUNT} registro`);
  });

  test("paginação funcional e termo de busca preservado entre páginas", async ({ page }) => {
    await loginAs(page, corretorA.email);
    await page.goto(`/leads?q=${encodeURIComponent(`${RUN_ID}-filler`)}`);

    // página 1: 25 fillers de A (o filler do outro corretor está fora de escopo)
    await expect(page.locator("body")).not.toContainText("outro-responsavel");

    const nextLink = page.getByRole("link", { name: "Próxima" });
    await expect(nextLink).toBeVisible();
    await nextLink.click();
    await page.waitForURL(/page=2/);

    const url = new URL(page.url());
    expect(url.searchParams.get("q")).toBe(`${RUN_ID}-filler`);
    expect(url.searchParams.get("page")).toBe("2");
    await expect(page.locator("body")).not.toContainText("outro-responsavel");
  });

  test("busca sem resultados mostra mensagem adequada", async ({ page }) => {
    await loginAs(page, corretorA.email);
    await page.goto(`/leads?q=${encodeURIComponent(`${RUN_ID}-inexistente-xyz`)}`);
    await expect(page.locator("body")).toContainText("Nenhum lead encontrado");
  });

  test("parâmetro de página inválido (negativo) não quebra a página e cai em página válida", async ({ page }) => {
    await loginAs(page, corretorA.email);
    const response = await page.goto("/leads?page=-5");
    expect(response?.status()).toBe(200);
    await expect(page.locator("h1")).toContainText("Leads");
  });

  test("busca por telefone encontra o lead pelos últimos dígitos armazenados", async ({ page }) => {
    // O telefone é salvo como texto livre ("(15) 99999-1234"); a busca casa
    // com o texto armazenado (com ou sem a pontuação do próprio segmento
    // buscado) — não normaliza toda a string armazenada via SQL bruto.
    await loginAs(page, corretorA.email);
    await page.goto("/leads?q=1234");
    await expect(page.locator("body")).toContainText(leadComTelefone.name);
  });
});

test.describe("G27 — contexto operacional no detalhe", () => {
  test("detalhe do lead mostra último contato e tarefas abertas vinculadas", async ({ page }) => {
    await loginAs(page, corretorA.email);
    await page.goto(`/leads/${leadComTelefone.id}`);

    await expect(page.getByText("Último contato:")).toBeVisible();
    await expect(page.getByRole("link", { name: `${RUN_ID}-tarefa-aberta` })).toBeVisible();
    await expect(page.locator(`a[href="/tasks/new?contactId=${leadComTelefone.id}"]`)).toBeVisible();
  });

  test("lead sem contato registrado mostra indicação de 'nunca houve contato'", async ({ page }) => {
    await loginAs(page, corretorA.email);
    await page.goto(`/leads/${leadSemTelefone.id}`);
    await expect(page.locator("body")).toContainText("Nunca houve contato registrado");
  });

  test("detalhe do imóvel mostra visitas recentes e tarefas abertas vinculadas", async ({ page }) => {
    await loginAs(page, corretorA.email);
    await page.goto(`/properties/${property.id}`);

    await expect(page.getByText("Visitas recentes")).toBeVisible();
    await expect(page.getByText(leadComTelefone.name)).toBeVisible();
    await expect(page.getByRole("link", { name: `${RUN_ID}-tarefa-aberta` })).toBeVisible();
  });
});
