import { defineConfig, devices } from "@playwright/test";

/**
 * Suíte E2E mínima do CRM Mabres. Roda contra um build de produção real
 * (`next build` + `next start`), nunca contra `next dev` — reproduz o
 * comportamento real de autenticação/sessão que a aplicação terá em staging
 * e produção.
 */
export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: 1,
  reporter: [["list"]],
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
        launchOptions: {
          executablePath: "/opt/pw-browsers/chromium",
        },
      },
    },
  ],
});
