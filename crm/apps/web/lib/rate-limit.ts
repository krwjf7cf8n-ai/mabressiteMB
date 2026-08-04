import type Redis from "ioredis";

/**
 * G22 (Marco 1.9) — rate limiting de login: no máximo `MAX_ATTEMPTS`
 * tentativas com falha por identificador (e-mail normalizado) a cada
 * `WINDOW_SECONDS`. Falha bem-sucedida reseta o contador; falha nova soma.
 *
 * Resiliente por padrão: se o Redis estiver indisponível, as funções abaixo
 * degradam para "sem limite" (fail open) em vez de derrubar o login — o
 * rate limiting é uma camada extra de defesa, não o mecanismo primário de
 * autenticação, e uma instabilidade do Redis nunca deveria virar uma
 * indisponibilidade do login em si.
 */
export const LOGIN_RATE_LIMIT_MAX_ATTEMPTS = 5;
export const LOGIN_RATE_LIMIT_WINDOW_SECONDS = 15 * 60;

function keyFor(identifier: string): string {
  return `login-rl:${identifier}`;
}

export interface LoginRateLimitStatus {
  limited: boolean;
  remaining: number;
}

/** Consulta o estado atual do limite para `identifier`, sem incrementar nada. */
export async function checkLoginRateLimit(redis: Redis | null, identifier: string): Promise<LoginRateLimitStatus> {
  if (!redis) return { limited: false, remaining: LOGIN_RATE_LIMIT_MAX_ATTEMPTS };
  try {
    const raw = await redis.get(keyFor(identifier));
    const attempts = raw ? Number(raw) : 0;
    return {
      limited: attempts >= LOGIN_RATE_LIMIT_MAX_ATTEMPTS,
      remaining: Math.max(0, LOGIN_RATE_LIMIT_MAX_ATTEMPTS - attempts),
    };
  } catch (error) {
    console.error("[rate-limit] falha ao consultar o Redis — login segue sem limite (fail open)", error);
    return { limited: false, remaining: LOGIN_RATE_LIMIT_MAX_ATTEMPTS };
  }
}

/** Registra uma tentativa de login com falha e devolve o total acumulado na janela atual. */
export async function registerFailedLoginAttempt(redis: Redis | null, identifier: string): Promise<number> {
  if (!redis) return 0;
  try {
    const key = keyFor(identifier);
    const attempts = await redis.incr(key);
    if (attempts === 1) {
      await redis.expire(key, LOGIN_RATE_LIMIT_WINDOW_SECONDS);
    }
    return attempts;
  } catch (error) {
    console.error("[rate-limit] falha ao registrar tentativa no Redis (fail open)", error);
    return 0;
  }
}

/** Login bem-sucedido: zera o contador de falhas do identificador. */
export async function resetLoginRateLimit(redis: Redis | null, identifier: string): Promise<void> {
  if (!redis) return;
  try {
    await redis.del(keyFor(identifier));
  } catch (error) {
    console.error("[rate-limit] falha ao resetar o contador no Redis (não bloqueia o login)", error);
  }
}
