import { createNotificationIdempotent, type PrismaClient } from "@mabres/db";

export interface UpcomingVisitLike {
  id: string;
  scheduledAt: Date;
  brokerUserId: string;
  contactName: string;
  propertyCode: string;
}

export interface UpcomingVisitNotificationDraft {
  userId: string;
  type: "visita_proxima";
  title: string;
  body: string;
  entityType: "Visit";
  entityId: string;
  idempotencyKey: string;
}

/** Função pura — um lembrete por visita (não por hora rodada do worker). */
export function buildUpcomingVisitNotifications(visits: UpcomingVisitLike[]): UpcomingVisitNotificationDraft[] {
  return visits.map((visit) => ({
    userId: visit.brokerUserId,
    type: "visita_proxima" as const,
    title: "Visita próxima",
    body: `Visita com ${visit.contactName} (${visit.propertyCode}) às ${visit.scheduledAt.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}.`,
    entityType: "Visit" as const,
    entityId: visit.id,
    idempotencyKey: `visit_upcoming:${visit.id}`,
  }));
}

/** Notifica visitas ativas que acontecem nas próximas `windowMinutes` (padrão 60min), uma vez cada. */
export async function runUpcomingVisitsJob(prisma: PrismaClient, windowMinutes = 60): Promise<number> {
  const now = new Date();
  const windowEnd = new Date(now.getTime() + windowMinutes * 60_000);

  const visits = await prisma.visit.findMany({
    where: {
      scheduledAt: { gte: now, lte: windowEnd },
      status: { in: ["AGUARDANDO_CONFIRMACAO", "CONFIRMADA", "REAGENDADA"] },
    },
    include: { contact: true, property: true },
  });

  if (visits.length === 0) return 0;

  const drafts = buildUpcomingVisitNotifications(
    visits.map((v) => ({
      id: v.id,
      scheduledAt: v.scheduledAt,
      brokerUserId: v.brokerUserId,
      contactName: v.contact.name,
      propertyCode: v.property.internalCode,
    })),
  );

  let created = 0;
  for (const draft of drafts) {
    const result = await createNotificationIdempotent(prisma, draft);
    if (result) created += 1;
  }

  return created;
}
