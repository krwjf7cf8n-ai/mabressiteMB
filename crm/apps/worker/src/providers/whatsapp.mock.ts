import { randomUUID } from "node:crypto";
import type { NormalizedWhatsAppMessage, WhatsAppProvider } from "./types";

/** Mock — não envia mensagens reais nem valida assinatura da Cloud API. */
export class MockWhatsAppProvider implements WhatsAppProvider {
  verifyWebhookSignature(_rawBody: string, _signatureHeader: string | null): boolean {
    console.warn("[MockWhatsAppProvider] assinatura NÃO verificada (mock) — não usar em produção.");
    return true;
  }

  parseIncomingMessages(payload: unknown): NormalizedWhatsAppMessage[] {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- payload mock, formato variável (ver docs/integration-plan.md)
    const body = payload as any;
    const messages: NormalizedWhatsAppMessage[] = [];

    for (const entry of body?.entry ?? []) {
      for (const change of entry?.changes ?? []) {
        for (const message of change?.value?.messages ?? []) {
          messages.push({
            externalId: String(message.id),
            from: String(message.from),
            timestamp: String(message.timestamp),
            type: message.type ?? "text",
            text: message.text?.body,
            mediaId: message.image?.id ?? message.document?.id ?? message.audio?.id ?? message.video?.id,
          });
        }
      }
    }

    return messages;
  }

  async sendTemplateMessage(input: {
    to: string;
    templateName: string;
    parameters: string[];
  }): Promise<{ messageId: string }> {
    console.warn(
      `[MockWhatsAppProvider] simulando envio de template "${input.templateName}" para ${input.to} (nenhuma mensagem real enviada).`,
    );
    return { messageId: `mock-${randomUUID()}` };
  }
}
