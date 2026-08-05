/**
 * Sprint 7 (infra) — Sentry é opcional e só é inicializado se SENTRY_DSN
 * estiver configurado (nunca inventamos um DSN real; sem ele, o app roda
 * normalmente, sem monitoramento externo). Roda uma única vez, na
 * inicialização do processo do servidor.
 *
 * Usamos @sentry/node (não @sentry/nextjs) deliberadamente: o pacote
 * específico do Next.js envolve o build com upload de source maps, que
 * exige credenciais de uma conta Sentry real (SENTRY_AUTH_TOKEN/ORG/PROJECT)
 * — indisponíveis nesta fase. @sentry/node captura exceções não tratadas e
 * fica disponível para captura manual, sem exigir nada além do DSN.
 */
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs" || !process.env.SENTRY_DSN) {
    return;
  }

  // webpackIgnore: @sentry/node usa módulos nativos do Node (node:child_process
  // etc.) que o bundler do Next não consegue empacotar — precisa ser um
  // import() real, resolvido pelo Node em runtime, não pelo webpack.
  const Sentry = await import(/* webpackIgnore: true */ "@sentry/node");
  Sentry.init({
    dsn: process.env.SENTRY_DSN,
    environment: process.env.NODE_ENV,
    tracesSampleRate: 0.1,
  });
}
