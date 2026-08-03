import { randomBytes } from "node:crypto";

/** Gera um código interno legível para um novo imóvel, ex.: "MB-7F3K9A". */
export function generatePropertyCode(): string {
  const suffix = randomBytes(4).toString("hex").toUpperCase().slice(0, 6);
  return `MB-${suffix}`;
}
