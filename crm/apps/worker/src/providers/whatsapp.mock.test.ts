import { describe, expect, it } from "vitest";
import { MockWhatsAppProvider } from "./whatsapp.mock";

describe("MockWhatsAppProvider", () => {
  it("sempre verifica a assinatura do webhook como válida (mock)", () => {
    const provider = new MockWhatsAppProvider();
    expect(provider.verifyWebhookSignature("qualquer corpo", "qualquer-assinatura")).toBe(true);
    expect(provider.verifyWebhookSignature("", null)).toBe(true);
  });

  it("extrai mensagens de texto de um payload de webhook de exemplo", () => {
    const provider = new MockWhatsAppProvider();
    const payload = {
      entry: [
        {
          changes: [
            {
              value: {
                messages: [
                  { id: "msg-1", from: "5515999990000", timestamp: "1700000000", type: "text", text: { body: "Olá" } },
                ],
              },
            },
          ],
        },
      ],
    };

    const messages = provider.parseIncomingMessages(payload);
    expect(messages).toHaveLength(1);
    expect(messages[0]).toMatchObject({ externalId: "msg-1", from: "5515999990000", type: "text", text: "Olá" });
  });

  it("extrai o mediaId de mensagens de imagem/documento/áudio/vídeo", () => {
    const provider = new MockWhatsAppProvider();
    const payload = {
      entry: [
        {
          changes: [
            {
              value: {
                messages: [
                  { id: "msg-2", from: "5515999990000", timestamp: "1700000001", type: "image", image: { id: "media-1" } },
                ],
              },
            },
          ],
        },
      ],
    };

    const messages = provider.parseIncomingMessages(payload);
    expect(messages[0]).toMatchObject({ externalId: "msg-2", type: "image", mediaId: "media-1" });
  });

  it("ignora entradas/changes sem mensagens (payload malformado ou vazio)", () => {
    const provider = new MockWhatsAppProvider();
    expect(provider.parseIncomingMessages({})).toHaveLength(0);
    expect(provider.parseIncomingMessages({ entry: [{ changes: [{ value: {} }] }] })).toHaveLength(0);
  });

  it("simula o envio de template retornando um messageId mock, sem chamar API real", async () => {
    const provider = new MockWhatsAppProvider();
    const result = await provider.sendTemplateMessage({
      to: "5515999990000",
      templateName: "confirmacao_visita",
      parameters: ["João", "amanhã às 10h"],
    });
    expect(result.messageId).toMatch(/^mock-/);
  });
});
