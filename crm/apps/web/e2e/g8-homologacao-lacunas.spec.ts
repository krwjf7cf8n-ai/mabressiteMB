import { test, expect, type Page } from "@playwright/test";
import { prisma } from "@mabres/db";
import { hashPassword } from "@mabres/shared";

/**
 * Sprint 8 (homologação do Marco 1) — dois itens do checklist funcional
 * ("CRUD de Proprietários" e "Logout") tinham a funcionalidade implementada
 * mas nenhum teste automatizado cobrindo o fluxo pela UI: Proprietários só
 * tinha o algoritmo de deduplicação testado isoladamente (dedup.test.ts,
 * G20), sem nenhum E2E como o que já existe para Leads/Imóveis/Visitas/
 * Tarefas (g3-service-layer-flows.spec.ts); Logout só era exercitado
 * indiretamente via revogação de sessão no servidor (auth-security-flows.spec.ts),
 * nunca clicando no botão "Sair" de verdade.
 */

const RUN_ID = `e2e-g8-${Date.now()}`;
const PASSWORD = "SenhaE2eG8Homolog!2026";

let corretor: { id: string; email: string };
let existingOwner: { id: string };

test.beforeAll(async () => {
  const corretorRole = await prisma.role.findFirstOrThrow({ where: { name: "Corretor" } });
  const passwordHash = await hashPassword(PASSWORD);

  corretor = await prisma.user.create({
    data: { name: `${RUN_ID}-corretor`, email: `${RUN_ID}-corretor@mabres.local`, passwordHash, roleId: corretorRole.id, isActive: true },
  });

  existingOwner = await prisma.owner.create({
    data: { name: `${RUN_ID}-proprietario-existente`, phone: "15997284640" },
  });
});

test.afterAll(async () => {
  await prisma.owner.deleteMany({ where: { name: { startsWith: RUN_ID } } });
  await prisma.userSession.deleteMany({ where: { userId: corretor.id } });
  // AuditLog é append-only (G17) — não é apagado no cleanup.
  await prisma.user.deleteMany({ where: { id: corretor.id } });
  await prisma.$disconnect();
});

async function loginAs(page: Page, email: string) {
  await page.goto("/login");
  await page.getByLabel("E-mail").fill(email);
  await page.getByLabel("Senha").fill(PASSWORD);
  await page.getByRole("button", { name: "Entrar" }).click();
  await page.waitForURL("**/dashboard");
}

test.describe("CRUD de Proprietários (checklist funcional — Sprint 8)", () => {
  test("cadastrar proprietário pela UI cria o registro e leva à listagem", async ({ page }) => {
    await loginAs(page, corretor.email);
    await page.goto("/owners/new");

    await page.fill('input[name="name"]', `${RUN_ID}-novo-proprietario`);
    await page.fill('input[name="phone"]', "15988887777");
    await page.getByRole("button", { name: "Cadastrar proprietário" }).click();

    await page.waitForURL("**/owners");
    await expect(page.getByText(`${RUN_ID}-novo-proprietario`)).toBeVisible();
  });

  test("telefone repetido mostra aviso de duplicidade antes de confirmar o cadastro", async ({ page }) => {
    await loginAs(page, corretor.email);
    await page.goto("/owners/new");

    await page.fill('input[name="name"]', `${RUN_ID}-possivel-duplicado`);
    await page.fill('input[name="phone"]', "15997284640"); // mesmo telefone de existingOwner
    await page.getByRole("button", { name: "Cadastrar proprietário" }).click();

    await expect(page.getByText("Possível duplicidade encontrada")).toBeVisible();

    // "Cadastrar mesmo assim" só marca a confirmação (input hidden) — o
    // envio de fato acontece ao clicar em "Cadastrar proprietário" de novo,
    // agora com confirmed=true (mesmo padrão do formulário de Leads).
    await page.getByRole("button", { name: "Cadastrar mesmo assim" }).click();
    await page.getByRole("button", { name: "Cadastrar proprietário" }).click();
    await page.waitForURL("**/owners");
    await expect(page.getByText(`${RUN_ID}-possivel-duplicado`)).toBeVisible();
  });
});

test.describe("Logout (checklist funcional — Sprint 8)", () => {
  test("clicar em 'Sair' encerra a sessão e volta para /login; a sessão anterior não acessa mais páginas protegidas", async ({ page }) => {
    await loginAs(page, corretor.email);
    await page.goto("/dashboard");

    await page.getByRole("button", { name: "Sair" }).click();
    await page.waitForURL("**/login");

    // A mesma aba, sem sessão, tentando voltar para uma página protegida —
    // precisa continuar redirecionando para /login, não mostrar o dashboard
    // a partir de algum cache do navegador.
    await page.goto("/dashboard");
    await expect(page).toHaveURL(/\/login/);
  });
});
