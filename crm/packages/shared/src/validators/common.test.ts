import { describe, expect, it } from "vitest";
import { optionalTrimmedString } from "./common";

describe("optionalTrimmedString", () => {
  it("aceita string, aparando espaços", () => {
    expect(optionalTrimmedString.parse("  texto  ")).toBe("texto");
  });

  it("aceita ausente, null ou string vazia", () => {
    expect(optionalTrimmedString.parse(undefined)).toBeUndefined();
    expect(optionalTrimmedString.parse(null)).toBeNull();
    expect(optionalTrimmedString.parse("")).toBe("");
  });

  it("rejeita valores não-string", () => {
    expect(() => optionalTrimmedString.parse(123)).toThrow();
  });
});
