import { existsSync } from "node:fs";
import { defineConfig, devices } from "@playwright/test";

/**
 * Suíte E2E mínima do CRM Mabres. Roda contra um build de produção real
 * (`next build` + `next start`), nunca contra `next dev` — reproduz o
 * comportamento real de autenticação/sessão que a aplicação terá em staging
 * e produção.
 *
 * O executável do Chromium é resolvido em ordem de prioridade:
 * 1. PLAYWRIGHT_CHROMIUM_PATH, se definida explicitamente;
 * 2. o caminho pré-instalado usado neste ambiente de desenvolvimento
 *    (só é usado se existir no disco — nunca existe no runner do GitHub
 *    Actions);
 * 3. undefined, deixando o Playwright resolver o Chromium instalado via
 *    `playwright install` (é o que acontece em CI).
 */
const SANDBOX_CHROMIUM_PATH = "/opt/pw-browsers/chromium";
const chromiumExecutablePath =
  process.env.PLAYWRIGHT_CHROMIUM_PATH ?? (existsSync(SANDBOX_CHROMIUM_PATH) ? SANDBOX_CHROMIUM_PATH : undefined);

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: 1,
  reporter: process.env.CI ? [["list"], ["github"]] : [["list"]],
  use: {
    baseURL: process.env.E2E_BASE_URL ?? "http://localhost:3000",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  projects: [
    {
      name: "chromium",
      use: {
        ...devices["Desktop Chrome"],
        ...(chromiumExecutablePath ? { launchOptions: { executablePath: chromiumExecutablePath } } : {}),
      },
    },
  ],
});
