import { test, expect, type Page } from "@playwright/test";
import { prisma } from "@mabres/db";
import { hashPassword } from "@mabres/shared";

/**
 * Marco 1.9 — Sprint 4 (G23): hardenings pontuais de segurança. Cada teste
 * cobre exatamente um item da lista do Marco 1.9 — nenhuma política extra
 * fora do escopo é validada aqui.
 */

const RUN_ID = `e2e-g23-${Date.now()}`;
const PASSWORD = "SenhaE2eG23!2026";

let admin: { id: string; email: string };

test.beforeAll(async () => {
  const role = await prisma.role.findFirstOrThrow({ where: { name: "Administrador" } });
  const passwordHash = await hashPassword(PASSWORD);
  admin = await prisma.user.create({
    data: { name: `${RUN_ID}-admin`, email: `${RUN_ID}-admin@mabres.local`, passwordHash, roleId: role.id, isActive: true },
  });
});

test.afterAll(async () => {
  await prisma.userSession.deleteMany({ where: { userId: admin.id } });
  // AuditLog é append-only (G17) — não é apagado no cleanup.
  await prisma.user.deleteMany({ where: { id: admin.id } });
  await prisma.$disconnect();
});

async function loginAs(page: Page, email: string) {
  await page.goto("/login");
  await page.getByLabel("E-mail").fill(email);
  await page.getByLabel("Senha").fill(PASSWORD);
  await page.getByRole("button", { name: "Entrar" }).click();
  await page.waitForURL("**/dashboard");
}

test.describe("G23 — headers de segurança residuais", () => {
  test("CSP inclui object-src, base-uri e form-action; Permissions-Policy está presente", async ({ page }) => {
    const response = await page.goto("/login");
    const headers = response?.headers() ?? {};

    expect(headers["content-security-policy"]).toContain("object-src 'none'");
    expect(headers["content-security-policy"]).toContain("base-uri 'self'");
    expect(headers["content-security-policy"]).toContain("form-action 'self'");
    expect(headers["permissions-policy"]).toContain("camera=()");
    expect(headers["permissions-policy"]).toContain("geolocation=()");
  });
});

test.describe("G23 — callbackUrl interno validado (proteção contra open redirect)", () => {
  test("callbackUrl para host externo é ignorado; login termina em /dashboard, não no host malicioso", async ({ page }) => {
    await page.goto("/login?callbackUrl=https%3A%2F%2Fevil.example.com%2Fphish");
    await page.getByLabel("E-mail").fill(admin.email);
    await page.getByLabel("Senha").fill(PASSWORD);
    await page.getByRole("button", { name: "Entrar" }).click();

    await page.waitForURL("**/dashboard");
    expect(page.url()).not.toContain("evil.example.com");
  });

  test("callbackUrl interno legítimo continua funcionando normalmente", async ({ page }) => {
    await page.goto("/login?callbackUrl=%2Fproperties");
    await page.getByLabel("E-mail").fill(admin.email);
    await page.getByLabel("Senha").fill(PASSWORD);
    await page.getByRole("button", { name: "Entrar" }).click();

    await page.waitForURL("**/properties");
  });
});

test.describe("G23 — Content-Disposition sanitizado", () => {
  test("um id malicioso na URL não injeta conteúdo no header do CSV de erros de importação", async ({ page }) => {
    await loginAs(page, admin.email);

    const maliciousId = encodeURIComponent('abc";x=1\r\nX-Injected: 1');
    const response = await page.request.get(`/imports/${maliciousId}/errors`);

    expect(response.ok()).toBe(true);
    const disposition = response.headers()["content-disposition"] ?? "";
    expect(disposition).not.toContain("X-Injected");
    expect(disposition).not.toContain("\r");
    expect(disposition).toContain('filename="importacao-arquivo-erros.csv"');
  });
});
