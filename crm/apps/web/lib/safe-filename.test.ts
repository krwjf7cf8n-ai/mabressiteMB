import { describe, expect, it } from "vitest";
import { safeFilenameSegment } from "./safe-filename";

describe("safeFilenameSegment — G23 (proteção contra injeção de header Content-Disposition)", () => {
  it("aceita um cuid válido inalterado", () => {
    expect(safeFilenameSegment("cljk3x9z10000qzrmn831p6k9")).toBe("cljk3x9z10000qzrmn831p6k9");
  });

  it("substitui valores com aspas pelo fallback", () => {
    expect(safeFilenameSegment('abc"; evil="x')).toBe("arquivo");
  });

  it("substitui valores com CRLF (header injection) pelo fallback", () => {
    expect(safeFilenameSegment("abc\r\nX-Injected: 1")).toBe("arquivo");
  });

  it("substitui valores com espaços, barras ou pontos pelo fallback", () => {
    expect(safeFilenameSegment("../../etc/passwd")).toBe("arquivo");
    expect(safeFilenameSegment("abc def")).toBe("arquivo");
  });

  it("aceita um fallback customizado", () => {
    expect(safeFilenameSegment("inválido!", "id-desconhecido")).toBe("id-desconhecido");
  });
});
