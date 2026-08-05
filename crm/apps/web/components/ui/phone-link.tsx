import { toTelHref } from "@mabres/shared";

/**
 * Telefone clicável (`tel:`). Mostra o valor exatamente como armazenado
 * (formato legível já digitado pelo usuário) — só o href usa a versão
 * normalizada. Sem número utilizável, cai para texto simples (sem link
 * quebrado).
 */
export function PhoneLink({ phone, className }: { phone?: string | null; className?: string }) {
  if (!phone) return <span className="text-slate-400">—</span>;

  const href = toTelHref(phone);
  if (!href) return <span>{phone}</span>;

  return (
    <a href={href} className={className ?? "text-brand-dark hover:underline"}>
      {phone}
    </a>
  );
}
