import { describe, expect, it } from "vitest";
import { MockMetaLeadAdsProvider } from "./meta.mock";

describe("MockMetaLeadAdsProvider", () => {
  it("extrai eventos de leadgen de um payload de webhook de exemplo", () => {
    const provider = new MockMetaLeadAdsProvider();
    const payload = {
      entry: [
        {
          id: "page-123",
          changes: [
            {
              field: "leadgen",
              value: {
                leadgen_id: "lead-1",
                page_id: "page-123",
                form_id: "form-1",
                created_time: "2026-01-01T10:00:00Z",
              },
            },
          ],
        },
      ],
    };

    const events = provider.parseLeadgenNotification(payload);
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({ externalId: "lead-1", pageId: "page-123", formId: "form-1" });
  });

  it("ignora changes sem leadgen_id", () => {
    const provider = new MockMetaLeadAdsProvider();
    const events = provider.parseLeadgenNotification({ entry: [{ changes: [{ value: {} }] }] });
    expect(events).toHaveLength(0);
  });
});
