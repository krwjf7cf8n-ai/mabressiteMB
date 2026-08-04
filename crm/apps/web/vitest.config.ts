import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    // Os testes de integração rodam contra o mesmo Postgres real e alguns
    // (user-admin-service, role-admin-service) mexem num invariante GLOBAL
    // (quantos administradores ativos existem no sistema todo) — rodar
    // arquivos de teste em paralelo faria dois desses testes brigarem pelo
    // mesmo estado ao mesmo tempo. Mais lento, mas determinístico.
    fileParallelism: false,
  },
});
