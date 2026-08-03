import { PrismaClient } from "@prisma/client";

declare global {
  // eslint-disable-next-line no-var
  var __mabresPrisma: PrismaClient | undefined;
}

const APPEND_ONLY_MODELS = new Set(["VisitEvent"]);
const MUTATING_ACTIONS = new Set(["update", "updateMany", "delete", "deleteMany", "upsert"]);

function createPrismaClient(): PrismaClient {
  const client = new PrismaClient({
    log: process.env.NODE_ENV === "development" ? ["warn", "error"] : ["error"],
  });

  // VisitEvent é a linha do tempo append-only da visita: nunca deve ser alterado
  // ou apagado depois de criado. Bloqueado aqui (não só por convenção de código)
  // para que qualquer tentativa futura de "corrigir" um evento falhe alto e claro.
  client.$use(async (params, next) => {
    if (APPEND_ONLY_MODELS.has(params.model ?? "") && MUTATING_ACTIONS.has(params.action)) {
      throw new Error(
        `${params.model} é append-only: a ação "${params.action}" não é permitida. Crie um novo evento em vez de alterar um existente.`,
      );
    }
    return next(params);
  });

  return client;
}

export const prisma = global.__mabresPrisma ?? createPrismaClient();

if (process.env.NODE_ENV !== "production") {
  global.__mabresPrisma = prisma;
}

export * from "@prisma/client";
export * from "./audit";
export * from "./notifications";
export * from "./concurrency";
