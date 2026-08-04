import type { Prisma, PrismaClient } from "@mabres/db";

/**
 * G29 — Lead parado: usa exclusivamente `Contact.lastContactAt` (campo já
 * existente, nunca gravado por nenhum fluxo automático nesta fase — só
 * indica visualmente quem está sem contato há mais tempo). Um lead nunca
 * contatado (`lastContactAt` null) é tratado como o caso mais urgente.
 */
export const STALE_LEAD_THRESHOLD_DAYS = 3;

/** Dias corridos entre `date` e `now` (nunca negativo). */
export function daysSince(date: Date, now: Date = new Date()): number {
  const diffMs = now.getTime() - date.getTime();
  return Math.max(0, Math.floor(diffMs / 86_400_000));
}

export interface StaleLead {
  id: string;
  name: string;
  lastContactAt: Date | null;
}

/**
 * Leads sem contato há `STALE_LEAD_THRESHOLD_DAYS`+ dias (ou nunca
 * contatados), mais urgentes primeiro (nunca contatado > contato mais
 * antigo). `scopeWhere` é o mesmo filtro de escopo por dono já usado no
 * resto do CRM (`getContactScopeWhere`) — nunca ignorado aqui.
 */
export async function getStaleLeads(client: PrismaClient, scopeWhere: Prisma.ContactWhereInput, take = 5): Promise<StaleLead[]> {
  const threshold = new Date();
  threshold.setDate(threshold.getDate() - STALE_LEAD_THRESHOLD_DAYS);

  return client.contact.findMany({
    where: {
      ...scopeWhere,
      deletedAt: null,
      OR: [{ lastContactAt: null }, { lastContactAt: { lte: threshold } }],
    },
    orderBy: [{ lastContactAt: { sort: "asc", nulls: "first" } }],
    take,
    select: { id: true, name: true, lastContactAt: true },
  });
}
