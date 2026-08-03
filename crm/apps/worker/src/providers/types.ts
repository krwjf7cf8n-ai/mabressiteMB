/**
 * Contratos das integrações externas. Nenhuma chamada real a uma API externa
 * deve acontecer nesta fase — apenas os tipos e implementações "mock" abaixo,
 * usadas para validar o fluxo interno (webhooks -> fila -> CRM) sem depender
 * de credenciais reais. A implementação real de cada provider entra na fase
 * correspondente (Meta: Fase 3, WhatsApp: Fase 4, Google: Fase 5, e-Móvel:
 * Fase 6, condicionada à confirmação oficial de API pelo suporte).
 */

export interface NormalizedLeadEvent {
  externalId: string; // leadgen_id da Meta
  pageId: string;
  formId: string;
  campaignId?: string;
  adSetId?: string;
  adId?: string;
  createdTime: string;
  fieldData: Record<string, string>;
}

export interface MetaLeadAdsProvider {
  verifyWebhookSignature(rawBody: string, signatureHeader: string | null): boolean;
  parseLeadgenNotification(payload: unknown): NormalizedLeadEvent[];
}

export interface NormalizedWhatsAppMessage {
  externalId: string;
  from: string;
  timestamp: string;
  type: "text" | "image" | "video" | "audio" | "document";
  text?: string;
  mediaId?: string;
}

export interface WhatsAppProvider {
  verifyWebhookSignature(rawBody: string, signatureHeader: string | null): boolean;
  parseIncomingMessages(payload: unknown): NormalizedWhatsAppMessage[];
  sendTemplateMessage(input: {
    to: string;
    templateName: string;
    parameters: string[];
  }): Promise<{ messageId: string }>;
}

export interface CalendarEventInput {
  title: string;
  description?: string;
  location?: string;
  startsAt: Date;
  endsAt: Date;
  attendeeEmails?: string[];
}

export interface GoogleCalendarProvider {
  createEvent(calendarId: string, input: CalendarEventInput): Promise<{ eventId: string }>;
  updateEvent(calendarId: string, eventId: string, input: CalendarEventInput): Promise<void>;
  deleteEvent(calendarId: string, eventId: string): Promise<void>;
}

export interface GmailProvider {
  sendEmail(input: { to: string; subject: string; html: string }): Promise<{ messageId: string }>;
}

/** Interface reservada — implementação depende de confirmação oficial do suporte e-Móvel Brokers. */
export interface EmovelProvider {
  createProperty(input: unknown): Promise<{ externalId: string }>;
  updateProperty(externalId: string, input: unknown): Promise<void>;
  updatePrice(externalId: string, salePrice: number | null, rentPrice: number | null): Promise<void>;
  updateAvailability(externalId: string, available: boolean): Promise<void>;
  inactivateProperty(externalId: string, reason: string): Promise<void>;
  getSyncStatus(externalId: string): Promise<{ status: string; lastSyncedAt: Date | null }>;
}
