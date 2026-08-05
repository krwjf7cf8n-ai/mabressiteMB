"use client";

import { useFormStatus } from "react-dom";

/**
 * G31 (Marco 1.9, Sprint 6) — estado de carregamento genérico para botões de
 * formulário. Mesmo padrão já usado em new-lead-form.tsx/new-owner-form.tsx
 * (cada um com sua própria cópia local) e em recalculate-matches-button.tsx
 * — aqui reutilizável para não repetir o boilerplate do useFormStatus de novo.
 */
export function SubmitButton({
  label,
  pendingLabel,
  className = "rounded-md bg-brand px-4 py-2 text-sm font-medium text-white hover:bg-brand-dark disabled:opacity-60",
}: {
  label: string;
  pendingLabel?: string;
  className?: string;
}) {
  const { pending } = useFormStatus();
  return (
    <button type="submit" disabled={pending} className={className}>
      {pending ? (pendingLabel ?? "Salvando...") : label}
    </button>
  );
}
