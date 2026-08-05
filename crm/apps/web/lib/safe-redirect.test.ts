import { describe, expect, it } from "vitest";
import { getSafeCallbackUrl } from "./safe-redirect";

describe("getSafeCallbackUrl — G23 (proteção contra open redirect)", () => {
  it("aceita um caminho interno simples", () => {
    expect(getSafeCallbackUrl("/dashboard")).toBe("/dashboard");
    expect(getSafeCallbackUrl("/leads/123")).toBe("/leads/123");
  });

  it("aceita um caminho interno com query string", () => {
    expect(getSafeCallbackUrl("/properties?status=ativo")).toBe("/properties?status=ativo");
  });

  it("cai no padrão quando o valor é nulo, indefinido ou vazio", () => {
    expect(getSafeCallbackUrl(null)).toBe("/dashboard");
    expect(getSafeCallbackUrl(undefined)).toBe("/dashboard");
    expect(getSafeCallbackUrl("")).toBe("/dashboard");
  });

  it("rejeita URLs absolutas para outros hosts (protocol-relative //)", () => {
    expect(getSafeCallbackUrl("//evil.com")).toBe("/dashboard");
    expect(getSafeCallbackUrl("//evil.com/phish")).toBe("/dashboard");
  });

  it("rejeita URLs com esquema explícito, mesmo embutidas depois de um caminho interno", () => {
    expect(getSafeCallbackUrl("https://evil.com")).toBe("/dashboard");
    expect(getSafeCallbackUrl("javascript:alert(1)")).toBe("/dashboard");
    expect(getSafeCallbackUrl("/redirect?to=https://evil.com")).toBe("/dashboard");
  });

  it("rejeita valores que não começam com uma única barra", () => {
    expect(getSafeCallbackUrl("dashboard")).toBe("/dashboard");
    expect(getSafeCallbackUrl("evil.com/dashboard")).toBe("/dashboard");
  });

  it("rejeita caminhos com backslash (bypass comum de validação de host)", () => {
    expect(getSafeCallbackUrl("/\\evil.com")).toBe("/dashboard");
  });
});
