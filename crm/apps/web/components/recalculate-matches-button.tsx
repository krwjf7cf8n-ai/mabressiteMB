"use client";

import { SubmitButton } from "./submit-button";

/** G11 (Marco 1.9) — estado de carregamento no botão "Recalcular" de matching. */
export function RecalculateMatchesButton() {
  return (
    <SubmitButton
      label="Recalcular"
      pendingLabel="Recalculando..."
      className="text-xs text-brand-dark underline hover:no-underline disabled:no-underline disabled:opacity-60"
    />
  );
}
