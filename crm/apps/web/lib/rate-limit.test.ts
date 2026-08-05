import Redis from "ioredis";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import {
  checkLoginRateLimit,
  LOGIN_RATE_LIMIT_MAX_ATTEMPTS,
  registerFailedLoginAttempt,
  resetLoginRateLimit,
} from "./rate-limit";

/**
 * G22 (Marco 1.9) — testes de integração contra Redis real (mesma
 * infraestrutura usada pelo worker). Ver .github/workflows/ci.yml.
 */
describe("rate-limit — integração com Redis", () => {
  let redis: Redis;
  const identifier = `teste-rate-limit-${Date.now()}@example.com`;

  beforeEach(async () => {
    redis = new Redis(process.env.REDIS_URL ?? "redis://localhost:6379", { maxRetriesPerRequest: null });
    await redis.del(`login-rl:${identifier}`);
  });

  afterAll(async () => {
    await redis.del(`login-rl:${identifier}`);
    await redis.quit();
  });

  it("identificador sem tentativas registradas nunca está limitado", async () => {
    const status = await checkLoginRateLimit(redis, identifier);
    expect(status).toEqual({ limited: false, remaining: LOGIN_RATE_LIMIT_MAX_ATTEMPTS });
  });

  it("`remaining` decresce a cada tentativa com falha registrada (comportamento correto)", async () => {
    for (let i = 1; i <= 3; i++) {
      const attempts = await registerFailedLoginAttempt(redis, identifier);
      expect(attempts).toBe(i);
    }

    const status = await checkLoginRateLimit(redis, identifier);
    expect(status).toEqual({ limited: false, remaining: LOGIN_RATE_LIMIT_MAX_ATTEMPTS - 3 });
  });

  it("bloqueia (limite excedido) depois de MAX_ATTEMPTS tentativas com falha", async () => {
    for (let i = 0; i < LOGIN_RATE_LIMIT_MAX_ATTEMPTS; i++) {
      await registerFailedLoginAttempt(redis, identifier);
    }

    const status = await checkLoginRateLimit(redis, identifier);
    expect(status.limited).toBe(true);
    expect(status.remaining).toBe(0);
  });

  it("continua bloqueado em tentativas além do limite (não decrementa abaixo de zero)", async () => {
    for (let i = 0; i < LOGIN_RATE_LIMIT_MAX_ATTEMPTS + 3; i++) {
      await registerFailedLoginAttempt(redis, identifier);
    }

    const status = await checkLoginRateLimit(redis, identifier);
    expect(status.limited).toBe(true);
    expect(status.remaining).toBe(0);
  });

  it("resetLoginRateLimit desbloqueia imediatamente (login bem-sucedido zera o contador)", async () => {
    for (let i = 0; i < LOGIN_RATE_LIMIT_MAX_ATTEMPTS; i++) {
      await registerFailedLoginAttempt(redis, identifier);
    }
    expect((await checkLoginRateLimit(redis, identifier)).limited).toBe(true);

    await resetLoginRateLimit(redis, identifier);

    const status = await checkLoginRateLimit(redis, identifier);
    expect(status).toEqual({ limited: false, remaining: LOGIN_RATE_LIMIT_MAX_ATTEMPTS });
  });

  it("define TTL na chave na primeira tentativa (a janela expira sozinha)", async () => {
    await registerFailedLoginAttempt(redis, identifier);
    const ttl = await redis.ttl(`login-rl:${identifier}`);
    expect(ttl).toBeGreaterThan(0);
    expect(ttl).toBeLessThanOrEqual(15 * 60);
  });
});

describe("rate-limit — fail open quando o Redis está indisponível", () => {
  it("checkLoginRateLimit nunca bloqueia quando o client é null (REDIS_URL não configurada)", async () => {
    const status = await checkLoginRateLimit(null, "qualquer@example.com");
    expect(status).toEqual({ limited: false, remaining: LOGIN_RATE_LIMIT_MAX_ATTEMPTS });
  });

  it("registerFailedLoginAttempt/resetLoginRateLimit não lançam quando o client é null", async () => {
    await expect(registerFailedLoginAttempt(null, "qualquer@example.com")).resolves.toBe(0);
    await expect(resetLoginRateLimit(null, "qualquer@example.com")).resolves.toBeUndefined();
  });
});
