type StepState = "done" | "current" | "pending";

const STEPS = [
  { key: "enviado", label: "Arquivo enviado" },
  { key: "preparacao", label: "Mapeamento e duplicidade" },
  { key: "execucao", label: "Execução" },
  { key: "concluido", label: "Concluído" },
] as const;

/**
 * G31 (Marco 1.9, Sprint 6) — indicador visual das fases da importação.
 * Baseado só no `ImportJobStatus` real (sem estado inventado): a tela de
 * detalhe já mostrava/escondia seções conforme o status, mas sem nenhuma
 * pista visual de "em qual fase eu estou" — só um rótulo de texto solto.
 */
export function ImportStepper({ status }: { status: string }) {
  const terminalStatuses = new Set(["CONCLUIDO", "CONCLUIDO_PARCIAL", "FALHA", "DESFEITO", "DESFEITO_PARCIAL"]);

  const currentIndex = terminalStatuses.has(status)
    ? 3
    : status === "PROCESSANDO"
      ? 2
      : 1; // RASCUNHO (ou qualquer outro valor futuro) cai em "preparação"

  const stateFor = (index: number): StepState => {
    if (index < currentIndex) return "done";
    if (index === currentIndex) return "current";
    return "pending";
  };

  const STYLES: Record<StepState, string> = {
    done: "border-brand bg-brand text-white",
    current: "border-brand text-brand-dark",
    pending: "border-slate-300 text-slate-400",
  };

  return (
    <ol className="flex flex-wrap items-center gap-2 text-xs">
      {STEPS.map((step, index) => (
        <li key={step.key} className="flex items-center gap-2" aria-current={stateFor(index) === "current" ? "step" : undefined}>
          <span className={`flex h-6 w-6 items-center justify-center rounded-full border-2 font-medium ${STYLES[stateFor(index)]}`}>
            {stateFor(index) === "done" ? "✓" : index + 1}
          </span>
          <span className={stateFor(index) === "pending" ? "text-slate-400" : "font-medium text-slate-700"}>{step.label}</span>
          {index < STEPS.length - 1 && <span className="mx-1 h-px w-6 bg-slate-300" aria-hidden="true" />}
        </li>
      ))}
    </ol>
  );
}
