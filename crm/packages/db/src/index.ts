import { PrismaClient } from "@prisma/client";

declare global {
  // eslint-disable-next-line no-var
  var __mabresPrisma: PrismaClient | undefined;
}

export const prisma =
  global.__mabresPrisma ??
  new PrismaClient({
    log: process.env.NODE_ENV === "development" ? ["warn", "error"] : ["error"],
  });

if (process.env.NODE_ENV !== "production") {
  global.__mabresPrisma = prisma;
}

export * from "@prisma/client";
export * from "./audit";
export * from "./notifications";
