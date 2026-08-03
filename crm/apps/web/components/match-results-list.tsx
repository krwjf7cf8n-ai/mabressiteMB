import Link from "next/link";
import type { MatchResult } from "@mabres/shared";
import { formatDateTimeSaoPaulo } from "@mabres/shared";

export interface MatchListItem {
  id: string;
  title: string;
  subtitle: string;
  href: string;
  result: MatchResult;
  calculatedAt: Date;
}

const TIER_STYLES: Record<MatchResult["tier"], string> = {
  excelente: "bg-emerald-100 text-emerald-800 border-emerald-300",
  boa: "bg-sky-100 text-sky-800 border-sky-300",
  parcial: "bg-amber-100 text-amber-800 border-amber-300",
  nao_recomendado: "bg-slate-100 text-slate-600 border-slate-300",
};

const TIER_LABELS: Record<MatchResult["tier"], string> = {
  excelente: "Excelente compatibilidade",
  boa: "Boa compatibilidade",
  parcial: "Compatibilidade parcial",
  nao_recomendado: "Não recomendado",
};

export function MatchResultsList({
  items,
  totalEvaluated,
  eliminationReasonTally,
  emptyContext,
}: {
  items: MatchListItem[];
  totalEvaluated: number;
  eliminationReasonTally: Array<{ reason: string; count: number }>;
  emptyContext: string;
}) {
  if (totalEvaluated === 0) {
    return <p className="text-sm text-slate-500">{emptyContext}</p>;
  }

  if (items.length === 0) {
    return (
      <div className="rounded-md border border-slate-200 bg-slate-50 p-4 text-sm text-slate-600">
        <p>
          Nenhum resultado elegível entre {totalEvaluated} avaliado(s) com os critérios atuais.
        </p>
        {eliminationReasonTally.length > 0 && (
          <ul className="mt-2 list-disc pl-5 text-slate-500">
            {eliminationReasonTally.map((r) => (
              <li key={r.reason}>
                {r.reason} ({r.count}x)
              </li>
            ))}
          </ul>
        )}
      </div>
    );
  }

  return (
    <ul className="space-y-3">
      {items.map((item) => (
        <li key={item.id} className="rounded-lg border border-slate-200 bg-white p-4">
          <div className="flex items-start justify-between gap-4">
            <div>
              <Link href={item.href} className="font-medium text-brand-dark hover:underline">
                {item.title}
              </Link>
              <p className="text-sm text-slate-500">{item.subtitle}</p>
            </div>
            <div className="text-right">
              <span
                className={`inline-block rounded-full border px-2 py-0.5 text-xs font-medium ${TIER_STYLES[item.result.tier]}`}
              >
                {TIER_LABELS[item.result.tier]}
              </span>
              <p className="mt-1 text-lg font-semibold text-slate-800">{item.result.score.toFixed(2)}%</p>
            </div>
          </div>

          <details className="mt-3 text-sm">
            <summary className="cursor-pointer text-slate-500 hover:text-slate-700">
              Ver critérios ({item.result.criteria.filter((c) => c.applicable).length} avaliados)
            </summary>
            <div className="mt-2 space-y-1">
              {item.result.criteria.map((c) => (
                <div key={c.key} className="flex items-center justify-between border-b border-slate-100 py-1">
                  <span className="text-slate-600">
                    {c.label}{" "}
                    <span className="text-xs text-slate-400">
                      ({c.level === "obrigatoria" ? "obrigatório" : c.level === "desejavel" ? "desejável" : "indiferente"}
                      , peso {c.weight})
                    </span>
                  </span>
                  <span
                    className={
                      !c.applicable
                        ? "text-slate-400"
                        : c.passed
                          ? "text-emerald-600"
                          : c.eliminatory
                            ? "font-semibold text-red-600"
                            : "text-amber-600"
                    }
                  >
                    {!c.applicable ? "sem informação" : c.passed ? "atendido" : c.eliminatory ? "eliminatório" : "não atendido"}
                  </span>
                </div>
              ))}
              {item.result.eliminationReasons.length > 0 && (
                <p className="pt-2 text-red-600">Eliminado por: {item.result.eliminationReasons.join("; ")}</p>
              )}
              <p className="pt-2 text-xs text-slate-400">
                Calculado em {formatDateTimeSaoPaulo(item.calculatedAt)} · algoritmo v{item.result.algorithmVersion}
              </p>
            </div>
          </details>
        </li>
      ))}
    </ul>
  );
}
