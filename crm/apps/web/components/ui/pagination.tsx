import Link from "next/link";

/**
 * Paginação por offset simples e genérica, reutilizada nas listagens com
 * busca server-side. `buildHref` deixa cada página decidir como montar a
 * query string (preservando seus próprios filtros).
 */
export function Pagination({
  page,
  pageSize,
  total,
  buildHref,
}: {
  page: number;
  pageSize: number;
  total: number;
  buildHref: (page: number) => string;
}) {
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  if (totalPages <= 1) return null;

  const hasPrev = page > 1;
  const hasNext = page < totalPages;

  return (
    <nav aria-label="Paginação" className="flex flex-wrap items-center justify-between gap-3 text-sm text-slate-600">
      <span>
        Página {page} de {totalPages} · {total} registro{total === 1 ? "" : "s"}
      </span>
      <div className="flex gap-2">
        {hasPrev ? (
          <Link href={buildHref(page - 1)} className="rounded-md border border-slate-300 px-3 py-1.5 hover:bg-slate-50">
            Anterior
          </Link>
        ) : (
          <span aria-disabled="true" className="rounded-md border border-slate-200 px-3 py-1.5 text-slate-300">
            Anterior
          </span>
        )}
        {hasNext ? (
          <Link href={buildHref(page + 1)} className="rounded-md border border-slate-300 px-3 py-1.5 hover:bg-slate-50">
            Próxima
          </Link>
        ) : (
          <span aria-disabled="true" className="rounded-md border border-slate-200 px-3 py-1.5 text-slate-300">
            Próxima
          </span>
        )}
      </div>
    </nav>
  );
}
