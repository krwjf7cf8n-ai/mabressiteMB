import { test, expect } from "@playwright/test";
import { prisma } from "@mabres/db";
import { hashPassword } from "@mabres/shared";

/**
 * Marco 1.9 — Sprint 6 (G31): compartilhamento de resultados do Matching
 * (apps/web/components/share-match-results.tsx). A lógica de montagem do
 * texto já é coberta por unit test (share-match-results.test.tsx); aqui só
 * confirma que os botões aparecem de verdade na tela quando há pelo menos
 * um resultado elegível.
 */

const RUN_ID = `e2e-g31-share-${Date.now()}`;
const PASSWORD = "SenhaE2eG31Share!2026";

let corretor: { id: string; email: string };
let contactId: string;
let propertyId: string;

test.beforeAll(async () => {
  const role = await prisma.role.findFirstOrThrow({ where: { name: "Corretor" } });
  const passwordHash = await hashPassword(PASSWORD);
  corretor = await prisma.user.create({
    data: { name: `${RUN_ID}-corretor`, email: `${RUN_ID}-corretor@mabres.local`, passwordHash, roleId: role.id, isActive: true },
  });

  const property = await prisma.property.create({
    data: {
      internalCode: `${RUN_ID}-MB`,
      purpose: "VENDA",
      propertyType: "Apartamento",
      city: "Sorocaba",
      salePrice: 400000,
      status: "ativo",
    },
  });
  propertyId = property.id;

  const contact = await prisma.contact.create({
    data: {
      name: `${RUN_ID}-lead`,
      ownerUserId: corretor.id,
      preference: { create: { intent: "COMPRA", desiredCity: "Sorocaba", minPrice: 300000, maxPrice: 500000 } },
    },
  });
  contactId = contact.id;
});

test.afterAll(async () => {
  await prisma.match.deleteMany({ where: { contactId } });
  await prisma.contactPreference.deleteMany({ where: { contactId } });
  await prisma.contact.deleteMany({ where: { id: contactId } });
  await prisma.property.deleteMany({ where: { id: propertyId } });
  await prisma.user.deleteMany({ where: { id: corretor.id } });
  await prisma.$disconnect();
});

async function loginAs(page: import("@playwright/test").Page, email: string) {
  await page.goto("/login");
  await page.getByLabel("E-mail").fill(email);
  await page.getByLabel("Senha").fill(PASSWORD);
  await page.getByRole("button", { name: "Entrar" }).click();
  await page.waitForURL("**/dashboard");
}

test.describe("G31 — compartilhamento de resultados do Matching", () => {
  test("lead com imóvel compatível mostra 'Copiar resumo' e 'Compartilhar no WhatsApp'", async ({ page }) => {
    await loginAs(page, corretor.email);
    await page.goto(`/leads/${contactId}`);

    await expect(page.getByRole("link", { name: `${RUN_ID}-MB` })).toBeVisible();
    await expect(page.getByRole("button", { name: "Copiar resumo" })).toBeVisible();
    const whatsappLink = page.getByRole("link", { name: "Compartilhar no WhatsApp" });
    await expect(whatsappLink).toBeVisible();
    await expect(whatsappLink).toHaveAttribute("href", /^https:\/\/wa\.me\/\?text=/);
  });

  test("clicar em 'Copiar resumo' mostra a confirmação 'Copiado!'", async ({ page, context }) => {
    await context.grantPermissions(["clipboard-write", "clipboard-read"]);
    await loginAs(page, corretor.email);
    await page.goto(`/leads/${contactId}`);

    await page.getByRole("button", { name: "Copiar resumo" }).click();
    await expect(page.getByRole("button", { name: "Copiado!" })).toBeVisible();

    const clipboardText = await page.evaluate(() => navigator.clipboard.readText());
    expect(clipboardText).toContain(`${RUN_ID}-MB`);
  });
});
