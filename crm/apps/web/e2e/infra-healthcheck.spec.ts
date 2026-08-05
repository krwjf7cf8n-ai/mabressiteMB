import { test, expect } from "@playwright/test";

/**
 * Sprint 7 (infra) — /api/health precisa responder sem sessão autenticada
 * (é isso que o HEALTHCHECK do Docker e monitoramento externo usam), então
 * a cobertura relevante aqui é justamente que o middleware NÃO redireciona
 * essa rota para /login como faria com qualquer outra página protegida.
 */
test.describe("GET /api/health — acessível sem autenticação", () => {
  test("responde 200 com o corpo esperado, sem redirecionar para /login", async ({ page }) => {
    const response = await page.request.get("/api/health");
    expect(response.status()).toBe(200);
    expect(await response.json()).toEqual({ status: "ok" });
  });
});
