import { Queue, Worker } from "bullmq";
import IORedis from "ioredis";
import { prisma } from "@mabres/db";
import { getProviderStatus } from "./providers";
import { runOverdueTasksJob } from "./jobs/overdue-tasks";
import { runUpcomingVisitsJob } from "./jobs/upcoming-visits";

const REDIS_URL = process.env.REDIS_URL;

if (!REDIS_URL) {
  console.error("REDIS_URL não definido. Configure a variável de ambiente antes de iniciar o worker.");
  process.exit(1);
}

const connection = new IORedis(REDIS_URL, { maxRetriesPerRequest: null });

const SCHEDULED_JOBS_QUEUE = "scheduled-jobs";
const queue = new Queue(SCHEDULED_JOBS_QUEUE, { connection });

const worker = new Worker(
  SCHEDULED_JOBS_QUEUE,
  async (job) => {
    if (job.name === "check-overdue-tasks") {
      const created = await runOverdueTasksJob(prisma);
      console.log(`[worker] check-overdue-tasks: ${created} notificação(ões) criada(s).`);
    }
    if (job.name === "check-upcoming-visits") {
      const created = await runUpcomingVisitsJob(prisma);
      console.log(`[worker] check-upcoming-visits: ${created} notificação(ões) criada(s).`);
    }
  },
  { connection },
);

worker.on("failed", (job, err) => {
  console.error(`[worker] job "${job?.name}" falhou:`, err.message);
});

async function bootstrap() {
  await queue.add(
    "check-overdue-tasks",
    {},
    { repeat: { every: 15 * 60 * 1000 }, removeOnComplete: true, removeOnFail: 50 },
  );

  await queue.add(
    "check-upcoming-visits",
    {},
    { repeat: { every: 10 * 60 * 1000 }, removeOnComplete: true, removeOnFail: 50 },
  );

  console.log("[worker] Mabres CRM worker iniciado.");
  console.log("[worker] Status das integrações (todas mock/desativadas nesta fase):", getProviderStatus());
}

bootstrap().catch((error) => {
  console.error("[worker] falha ao iniciar:", error);
  process.exit(1);
});

process.on("SIGTERM", async () => {
  await worker.close();
  await queue.close();
  await connection.quit();
  process.exit(0);
});
