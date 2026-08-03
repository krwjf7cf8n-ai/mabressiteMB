import { describe, expect, it } from "vitest";
import { generatePropertyCode } from "./property-code";

describe("generatePropertyCode", () => {
  it("segue o formato MB-XXXXXX", () => {
    expect(generatePropertyCode()).toMatch(/^MB-[0-9A-F]{6}$/);
  });

  it("gera códigos diferentes a cada chamada", () => {
    const codes = new Set(Array.from({ length: 20 }, () => generatePropertyCode()));
    expect(codes.size).toBe(20);
  });
});
