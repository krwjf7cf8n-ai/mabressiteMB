"use client";

import { useFormStatus } from "react-dom";

/** G11 (Marco 1.9) — estado de carregamento no botão "Recalcular" de matching. */
export function RecalculateMatchesButton() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="text-xs text-brand-dark underline hover:no-underline disabled:no-underline disabled:opacity-60"
    >
      {pending ? "Recalculando..." : "Recalcular"}
    </button>
  );
}
