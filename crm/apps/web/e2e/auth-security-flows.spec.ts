import { test, expect } from "@playwright/test";
import { prisma } from "@mabres/db";
import { hashPassword } from "@mabres/shared";

/**
 * Marco 1.9 — Sprint 3 (G15): caminhos negativos de autenticação que ainda
 * não tinham nenhum teste automatizado — login inválido, usuário
 * desativado e sessão revogada. `authorize()`/os callbacks `jwt`/`session`
 * do NextAuth (apps/web/lib/auth.ts) só existem dentro do fluxo real de
 * login/requisição — não são unitariamente testáveis isolados do NextAuth
 * (mesmo precedente já adotado nos demais *-service.test.ts que dependem de
 * sessão) —, então esta cobertura é E2E, contra um build de produção real.
 */

const RUN_ID = `e2e-auth-${Date.now()}`;
const PASSWORD = "SenhaE2eAuth!2026";

let activeUser: { id: string; email: string };
let disabledUser: { id: string; email: string };

test.beforeAll(async () => {
  const role = await prisma.role.findFirstOrThrow({ where: { name: "Corretor" } });
  const passwordHash = await hashPassword(PASSWORD);

  const [user, disabled] = await Promise.all([
    prisma.user.create({
      data: { name: `${RUN_ID}-ativo`, email: `${RUN_ID}-ativo@mabres.local`, passwordHash, roleId: role.id, isActive: true },
    }),
    prisma.user.create({
      data: {
        name: `${RUN_ID}-desativado`,
        email: `${RUN_ID}-desativado@mabres.local`,
        passwordHash,
        roleId: role.id,
        isActive: false,
        disabledAt: new Date(),
      },
    }),
  ]);
  activeUser = user;
  disabledUser = disabled;
});

test.afterAll(async () => {
  await prisma.userSession.deleteMany({ where: { userId: { in: [activeUser.id, disabledUser.id] } } });
  // AuditLog é append-only (G17) — não é apagado no cleanup.
  await prisma.user.deleteMany({ where: { id: { in: [activeUser.id, disabledUser.id] } } });
  await prisma.$disconnect();
});

test.describe("G15 — login inválido", () => {
  test("senha incorreta mostra erro genérico e não autentica", async ({ page }) => {
    await page.goto("/login");
    await page.getByLabel("E-mail").fill(activeUser.email);
    await page.getByLabel("Senha").fill("senha-errada-qualquer");
    await page.getByRole("button", { name: "Entrar" }).click();

    await expect(page.getByText("E-mail ou senha inválidos.")).toBeVisible();
    await expect(page).toHaveURL(/\/login/);
  });

  test("e-mail inexistente mostra a mesma mensagem genérica (não revela se o e-mail existe)", async ({ page }) => {
    await page.goto("/login");
    await page.getByLabel("E-mail").fill(`${RUN_ID}-nao-existe@mabres.local`);
    await page.getByLabel("Senha").fill("qualquer-coisa");
    await page.getByRole("button", { name: "Entrar" }).click();

    await expect(page.getByText("E-mail ou senha inválidos.")).toBeVisible();
    await expect(page).toHaveURL(/\/login/);
  });
});

test.describe("G15 — usuário desativado", () => {
  test("usuário desativado não consegue logar mesmo com a senha correta", async ({ page }) => {
    await page.goto("/login");
    await page.getByLabel("E-mail").fill(disabledUser.email);
    await page.getByLabel("Senha").fill(PASSWORD);
    await page.getByRole("button", { name: "Entrar" }).click();

    await expect(page.getByText("E-mail ou senha inválidos.")).toBeVisible();
    await expect(page).toHaveURL(/\/login/);

    const sessions = await prisma.userSession.count({ where: { userId: disabledUser.id } });
    expect(sessions).toBe(0);
  });
});

test.describe("G15 — sessão revogada", () => {
  test("revogar a sessão ativa bloqueia o acesso a páginas protegidas na próxima requisição", async ({ page }) => {
    await page.goto("/login");
    await page.getByLabel("E-mail").fill(activeUser.email);
    await page.getByLabel("Senha").fill(PASSWORD);
    await page.getByRole("button", { name: "Entrar" }).click();
    await page.waitForURL("**/dashboard");

    const session = await prisma.userSession.findFirstOrThrow({
      where: { userId: activeUser.id, revokedAt: null },
      orderBy: { createdAt: "desc" },
    });

    // O JWT em si continua criptograficamente válido — a revogação só é
    // detectada porque o callback jwt() do NextAuth revalida a UserSession
    // no banco a cada requisição (ver auth.ts). O middleware (que só checa
    // se existe um token) não pega isso; requireSession() sim.
    await prisma.userSession.update({ where: { id: session.id }, data: { revokedAt: new Date() } });

    await page.goto("/dashboard");
    await expect(page).toHaveURL(/\/login/);
  });
});
