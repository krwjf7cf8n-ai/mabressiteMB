import { randomUUID } from "node:crypto";
import type { CalendarEventInput, GmailProvider, GoogleCalendarProvider } from "./types";

/** Mock — não chama Google Calendar/Gmail API real; nenhum OAuth é realizado. */
export class MockGoogleCalendarProvider implements GoogleCalendarProvider {
  async createEvent(calendarId: string, input: CalendarEventInput): Promise<{ eventId: string }> {
    console.warn(`[MockGoogleCalendarProvider] simulando criação de evento em "${calendarId}": ${input.title}`);
    return { eventId: `mock-${randomUUID()}` };
  }

  async updateEvent(calendarId: string, eventId: string, input: CalendarEventInput): Promise<void> {
    console.warn(`[MockGoogleCalendarProvider] simulando atualização do evento ${eventId} (${input.title})`);
  }

  async deleteEvent(calendarId: string, eventId: string): Promise<void> {
    console.warn(`[MockGoogleCalendarProvider] simulando exclusão do evento ${eventId}`);
  }
}

export class MockGmailProvider implements GmailProvider {
  async sendEmail(input: { to: string; subject: string; html: string }): Promise<{ messageId: string }> {
    console.warn(`[MockGmailProvider] simulando envio de e-mail para ${input.to}: "${input.subject}"`);
    return { messageId: `mock-${randomUUID()}` };
  }
}
