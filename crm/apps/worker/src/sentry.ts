import * as Sentry from "@sentry/node";

/**
 * Sprint 7 (infra) — mesmo raciocínio do apps/web/instrumentation.ts:
 * opcional, só ativa se SENTRY_DSN existir (nunca inventamos um DSN real).
 */
export function initSentry(): void {
  if (!process.env.SENTRY_DSN) {
    return;
  }
  Sentry.init({
    dsn: process.env.SENTRY_DSN,
    environment: process.env.NODE_ENV,
    tracesSampleRate: 0.1,
  });
}

export { Sentry };
