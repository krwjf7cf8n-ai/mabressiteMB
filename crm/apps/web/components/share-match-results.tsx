"use client";

import { useState } from "react";
import type { MatchListItem } from "./match-results-list";

const TIER_LABELS: Record<string, string> = {
  excelente: "Excelente compatibilidade",
  boa: "Boa compatibilidade",
  parcial: "Compatibilidade parcial",
  nao_recomendado: "Não recomendado",
};

/** G31 (Marco 1.9, Sprint 6) — resumo em texto simples dos resultados elegíveis, para copiar ou enviar por WhatsApp. */
export function buildSummaryText(contextLabel: string, items: MatchListItem[]): string {
  const lines = [
    `${contextLabel} — ${items.length} resultado(s) compatível(is):`,
    "",
    ...items.map((item, i) => `${i + 1}. ${item.title} (${item.subtitle}) — ${item.result.score.toFixed(0)}% · ${TIER_LABELS[item.result.tier] ?? item.result.tier}`),
  ];
  return lines.join("\n");
}

export function ShareMatchResults({ contextLabel, items }: { contextLabel: string; items: MatchListItem[] }) {
  const [copied, setCopied] = useState(false);

  if (items.length === 0) return null;

  const summary = buildSummaryText(contextLabel, items);
  const whatsAppHref = `https://wa.me/?text=${encodeURIComponent(summary)}`;

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(summary);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard indisponível (ex.: contexto não seguro) — sem fallback
      // manual aqui; o link do WhatsApp continua funcionando normalmente.
    }
  }

  return (
    <div className="flex items-center gap-3 text-xs">
      <button type="button" onClick={handleCopy} className="text-brand-dark underline hover:no-underline">
        {copied ? "Copiado!" : "Copiar resumo"}
      </button>
      <a href={whatsAppHref} target="_blank" rel="noopener noreferrer" className="text-green-700 underline hover:no-underline">
        Compartilhar no WhatsApp
      </a>
    </div>
  );
}
