import type { MetaLeadAdsProvider, NormalizedLeadEvent } from "./types";

/**
 * Implementação mock — não valida assinatura real nem chama a Graph API.
 * Serve para testar o pipeline interno (webhook -> fila -> criação de Contact)
 * com payloads de exemplo antes de existir um app Meta configurado.
 */
export class MockMetaLeadAdsProvider implements MetaLeadAdsProvider {
  verifyWebhookSignature(_rawBody: string, _signatureHeader: string | null): boolean {
    console.warn("[MockMetaLeadAdsProvider] assinatura NÃO verificada (mock) — não usar em produção.");
    return true;
  }

  parseLeadgenNotification(payload: unknown): NormalizedLeadEvent[] {
    const body = payload as any;
    const entries = body?.entry ?? [];
    const events: NormalizedLeadEvent[] = [];

    for (const entry of entries) {
      for (const change of entry?.changes ?? []) {
        const value = change?.value;
        if (!value?.leadgen_id) continue;
        events.push({
          externalId: String(value.leadgen_id),
          pageId: String(value.page_id ?? entry.id ?? ""),
          formId: String(value.form_id ?? ""),
          campaignId: value.campaign_id ? String(value.campaign_id) : undefined,
          adSetId: value.adset_id ? String(value.adset_id) : undefined,
          adId: value.ad_id ? String(value.ad_id) : undefined,
          createdTime: value.created_time ? String(value.created_time) : new Date().toISOString(),
          fieldData: {},
        });
      }
    }

    return events;
  }
}
