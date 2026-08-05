import { PrismaClient } from "@prisma/client";

declare global {
  // eslint-disable-next-line no-var
  var __mabresPrisma: PrismaClient | undefined;
}

// G17 (Marco 1.9): todo modelo que representa um registro histórico/de
// auditoria imutável — nunca uma entidade "atual" que legitimamente muda de
// estado (essas têm campo `status`/são atualizadas no fluxo normal, ex.:
// WebhookEvent, ImportJob/ImportRow, Commission). Corrigir um evento errado
// significa criar um novo evento, nunca alterar/apagar o antigo.
const APPEND_ONLY_MODELS = new Set([
  "VisitEvent",
  "AuditLog",
  "ContactStageHistory",
  "PropertyPriceHistory",
  "PropertyStatusHistory",
  "ProposalVersion",
  "AutomationLog",
  "AiUsageLog",
]);
const MUTATING_ACTIONS = new Set(["update", "updateMany", "delete", "deleteMany", "upsert"]);

function createPrismaClient(): PrismaClient {
  const client = new PrismaClient({
    log: process.env.NODE_ENV === "development" ? ["warn", "error"] : ["error"],
  });

  // Linhas do tempo append-only: nunca devem ser alteradas ou apagadas depois
  // de criadas. Bloqueado aqui (não só por convenção de código) para que
  // qualquer tentativa futura de "corrigir" um registro falhe alto e claro.
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
