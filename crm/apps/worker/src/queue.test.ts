import { randomUUID } from "node:crypto";
import { Queue, Worker, type Job } from "bullmq";
import IORedis from "ioredis";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

/**
 * G15 (Auditoria 6 — "Adicionar teste de integração BullMQ/Redis
 * posteriormente"): até aqui a fila do worker (apps/worker/src/index.ts)
 * nunca foi exercitada contra um Redis real em teste automatizado — só
 * manualmente. Este teste não importa index.ts diretamente (ele tem efeitos
 * colaterais no nível do módulo: abre conexão, chama process.exit se
 * REDIS_URL faltar, registra handlers de SIGTERM — inadequado para rodar
 * dentro do processo do Vitest). Em vez disso, valida o mesmo mecanismo
 * (Queue + Worker do BullMQ sobre uma conexão ioredis real) numa fila de
 * teste isolada, provando que o enfileiramento e o processamento de fato
 * funcionam de ponta a ponta contra o Redis, e não só como funções puras.
 */
describe("worker — integração com Redis/BullMQ", () => {
  const QUEUE_NAME = `test-queue-${randomUUID()}`;
  let connection: IORedis;
  let queue: Queue;
  let worker: Worker;

  beforeAll(() => {
    const redisUrl = process.env.REDIS_URL;
    if (!redisUrl) {
      throw new Error("REDIS_URL não definido — necessário para o teste de integração com Redis.");
    }
    connection = new IORedis(redisUrl, { maxRetriesPerRequest: null });
    queue = new Queue(QUEUE_NAME, { connection });
  });

  afterAll(async () => {
    await worker?.close();
    await queue.obliterate({ force: true });
    await queue.close();
    await connection.quit();
  });

  it("um job enfileirado é processado pelo worker e chega ao handler com os dados corretos", async () => {
    const processed: unknown[] = [];

    worker = new Worker(
      QUEUE_NAME,
      async (job: Job) => {
        processed.push(job.data);
      },
      { connection },
    );

    await queue.add("job-de-teste", { hello: "world" });

    await expect.poll(() => processed.length, { timeout: 10_000 }).toBe(1);
    expect(processed[0]).toEqual({ hello: "world" });
  });

  it("um job cujo handler lança erro é reportado como falho, não fica preso silenciosamente", async () => {
    await worker.close();

    const failures: string[] = [];
    worker = new Worker(
      QUEUE_NAME,
      async (): Promise<void> => {
        throw new Error("falha proposital do teste");
      },
      { connection },
    );
    worker.on("failed", (job) => {
      if (job) failures.push(job.id ?? "");
    });

    const job = await queue.add("job-que-falha", {});

    await expect.poll(() => failures.includes(job.id ?? ""), { timeout: 10_000 }).toBe(true);
  });
});
