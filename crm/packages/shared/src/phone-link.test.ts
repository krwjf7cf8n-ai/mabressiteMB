import { describe, expect, it } from "vitest";
import { normalizeBrazilianPhoneDigits, toTelHref, toWhatsAppHref } from "./phone-link";

describe("normalizeBrazilianPhoneDigits", () => {
  it("normaliza celular brasileiro com DDD (sem DDI)", () => {
    expect(normalizeBrazilianPhoneDigits("15999998888")).toBe("5515999998888");
  });

  it("normaliza número já com +55", () => {
    expect(normalizeBrazilianPhoneDigits("+5515999998888")).toBe("5515999998888");
  });

  it("normaliza número contendo o DDI sem o sinal de +", () => {
    expect(normalizeBrazilianPhoneDigits("5515999998888")).toBe("5515999998888");
  });

  it("normaliza número somente com dígitos", () => {
    expect(normalizeBrazilianPhoneDigits("15988887777")).toBe("5515988887777");
  });

  it("remove espaços, hífens e parênteses", () => {
    expect(normalizeBrazilianPhoneDigits("(15) 99999-8888")).toBe("5515999998888");
  });

  it("não duplica o código do país (DDD 55 real, sem DDI)", () => {
    // DDD 55 existe de verdade (região de Santa Maria/RS) — 11 dígitos sem DDI
    // não deve ser confundido com "DDI 55 + DDD faltando".
    expect(normalizeBrazilianPhoneDigits("55988887777")).toBe("5555988887777");
  });

  it("não duplica o código do país quando já presente em número de 10 dígitos (fixo)", () => {
    expect(normalizeBrazilianPhoneDigits("555533334444")).toBe("555533334444");
  });

  it("retorna null para valor vazio", () => {
    expect(normalizeBrazilianPhoneDigits("")).toBeNull();
    expect(normalizeBrazilianPhoneDigits(null)).toBeNull();
    expect(normalizeBrazilianPhoneDigits(undefined)).toBeNull();
  });

  it("retorna null para valor inválido (poucos dígitos)", () => {
    expect(normalizeBrazilianPhoneDigits("123")).toBeNull();
    expect(normalizeBrazilianPhoneDigits("abc")).toBeNull();
  });
});

describe("toTelHref", () => {
  it("gera href tel: com DDI e sinal de +", () => {
    expect(toTelHref("15999998888")).toBe("tel:+5515999998888");
  });

  it("retorna null quando não há número utilizável", () => {
    expect(toTelHref("")).toBeNull();
    expect(toTelHref("123")).toBeNull();
  });
});

describe("toWhatsAppHref", () => {
  it("gera link wa.me com DDI, sem duplicar", () => {
    expect(toWhatsAppHref("+55 (15) 99999-8888")).toBe("https://wa.me/5515999998888");
  });

  it("retorna null quando não há número utilizável", () => {
    expect(toWhatsAppHref(null)).toBeNull();
    expect(toWhatsAppHref("abc")).toBeNull();
  });
});
