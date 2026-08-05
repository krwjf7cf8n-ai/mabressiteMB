import { test, expect } from "@playwright/test";
import { prisma } from "@mabres/db";
import { hashPassword } from "@mabres/shared";

/**
 * Marco 1.9 — Sprint 6 (G31): indicador visual das fases da importação
 * (apps/web/components/import-stepper.tsx), na tela de detalhe de uma
 * importação. Cria os ImportJob de fixture direto via Prisma (o foco aqui é
 * o estado visual do stepper para cada status, não o upload em si — o
 * upload real já é validado manualmente e não tem cobertura E2E própria).
 */

const RUN_ID = `e2e-g31-import-${Date.now()}`;
const PASSWORD = "SenhaE2eG31Import!2026";

let admin: { id: string; email: string };
let rascunhoJobId: string;
let concluidoJobId: string;

test.beforeAll(async () => {
  const role = await prisma.role.findFirstOrThrow({ where: { name: "Administrador" } });
  const passwordHash = await hashPassword(PASSWORD);
  admin = await prisma.user.create({
    data: { name: `${RUN_ID}-admin`, email: `${RUN_ID}-admin@mabres.local`, passwordHash, roleId: role.id, isActive: true },
  });

  const [rascunho, concluido] = await Promise.all([
    prisma.importJob.create({
      data: { fileName: `${RUN_ID}-rascunho.csv`, fileHash: `${RUN_ID}-hash-1`, fileSize: 100, importedByUserId: admin.id, status: "RASCUNHO" },
    }),
    prisma.importJob.create({
      data: {
        fileName: `${RUN_ID}-concluido.csv`,
        fileHash: `${RUN_ID}-hash-2`,
        fileSize: 100,
        importedByUserId: admin.id,
        status: "CONCLUIDO",
        finishedAt: new Date(),
      },
    }),
  ]);
  rascunhoJobId = rascunho.id;
  concluidoJobId = concluido.id;
});

test.afterAll(async () => {
  await prisma.importJob.deleteMany({ where: { id: { in: [rascunhoJobId, concluidoJobId] } } });
  await prisma.user.deleteMany({ where: { id: admin.id } });
  await prisma.$disconnect();
});

async function loginAs(page: import("@playwright/test").Page, email: string) {
  await page.goto("/login");
  await page.getByLabel("E-mail").fill(email);
  await page.getByLabel("Senha").fill(PASSWORD);
  await page.getByRole("button", { name: "Entrar" }).click();
  await page.waitForURL("**/dashboard");
}

test.describe("G31 — fluxo passo-a-passo da importação", () => {
  test("importação em RASCUNHO mostra 'Mapeamento e duplicidade' como etapa atual", async ({ page }) => {
    await loginAs(page, admin.email);
    await page.goto(`/imports/${rascunhoJobId}`);

    const current = page.locator('[aria-current="step"]');
    await expect(current).toHaveText(/Mapeamento e duplicidade/);
  });

  test("importação CONCLUIDA mostra 'Concluído' como etapa atual, com as anteriores marcadas", async ({ page }) => {
    await loginAs(page, admin.email);
    await page.goto(`/imports/${concluidoJobId}`);

    const current = page.locator('[aria-current="step"]');
    await expect(current).toHaveText(/Concluído/);
    // As três etapas anteriores devem estar marcadas como concluídas (✓).
    await expect(page.getByText("✓")).toHaveCount(3);
  });
});
