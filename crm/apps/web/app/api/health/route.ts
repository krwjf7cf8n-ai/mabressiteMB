import { NextResponse } from "next/server";
import { prisma } from "@mabres/db";

/**
 * Sprint 7 (infra) — usado pelo HEALTHCHECK do Docker e por monitoramento
 * externo. Público (ver middleware.ts) e sem informação sensível na
 * resposta: só confirma que o processo está de pé e consegue falar com o
 * banco, nunca detalhes internos (mensagem de erro, stack, versão etc.).
 */
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    await prisma.$queryRaw`SELECT 1`;
    return NextResponse.json({ status: "ok" }, { status: 200 });
  } catch {
    return NextResponse.json({ status: "error" }, { status: 503 });
  }
}
