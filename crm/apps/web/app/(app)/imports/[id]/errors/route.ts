import { NextResponse } from "next/server";
import { prisma } from "@mabres/db";
import { toCsv } from "@mabres/shared";
import { requirePermission } from "@/lib/session";
import { safeFilenameSegment } from "@/lib/safe-filename";

/** Relatório de erros de uma importação, para download — protegido contra CSV/formula injection via `toCsv`. */
export async function GET(_request: Request, { params }: { params: { id: string } }) {
  await requirePermission("imports:view");

  const rows = await prisma.importRow.findMany({
    where: { importJobId: params.id, validationStatus: "INVALIDA" },
    orderBy: { rowNumber: "asc" },
  });

  const csvRows: string[][] = [];
  for (const row of rows) {
    const errors = (row.validationErrors as Array<{ field: string; rawValue: string | null; message: string }> | null) ?? [];
    for (const err of errors) {
      csvRows.push([String(row.rowNumber), err.field, err.rawValue ?? "", err.message]);
    }
  }

  const csv = toCsv(["linha", "campo", "valor_recebido", "erro"], csvRows);
  const safeId = safeFilenameSegment(params.id);

  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="importacao-${safeId}-erros.csv"`,
    },
  });
}
