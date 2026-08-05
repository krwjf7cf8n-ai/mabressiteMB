import Redis from "ioredis";

declare global {
  // eslint-disable-next-line no-var
  var __mabresRedis: Redis | undefined;
}

let warnedMissingUrl = false;

/**
 * G22 (Marco 1.9) — reaproveita a mesma infraestrutura Redis já usada pelo
 * worker (BullMQ), via a mesma variável `REDIS_URL` — nenhuma infraestrutura
 * nova. Cliente resolvido de forma preguiçosa (só na primeira chamada real),
 * nunca no carregamento do módulo: `auth.ts` é importado por praticamente
 * toda página autenticada, e login não deve quebrar por causa de uma
 * variável só necessária para o rate limiting.
 *
 * Devolve `null` (em vez de lançar) quando `REDIS_URL` não está configurada
 * — quem chama trata isso como "rate limiting indisponível, seguir sem
 * limite" (fail open), nunca como motivo para bloquear o login.
 */
export function getRedisClient(): Redis | null {
  if (global.__mabresRedis) return global.__mabresRedis;

  const url = process.env.REDIS_URL;
  if (!url) {
    if (!warnedMissingUrl) {
      console.warn("[rate-limit] REDIS_URL não definido — login segue sem rate limiting (fail open).");
      warnedMissingUrl = true;
    }
    return null;
  }

  global.__mabresRedis = new Redis(url, { maxRetriesPerRequest: null });
  return global.__mabresRedis;
}
