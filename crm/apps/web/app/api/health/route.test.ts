import { describe, expect, it } from "vitest";
import { GET } from "./route";

describe("GET /api/health — Sprint 7 (infra)", () => {
  it("retorna 200 e status ok quando o banco está acessível", async () => {
    const response = await GET();
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body).toEqual({ status: "ok" });
  });
});
