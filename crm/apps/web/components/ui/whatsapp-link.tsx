import { toWhatsAppHref } from "@mabres/shared";

/**
 * Link para abrir conversa no WhatsApp (`wa.me`), a partir do telefone (ou
 * campo WhatsApp dedicado) do contato. `rel="noopener noreferrer"` evita
 * expor a página de origem/`window.opener` à aba aberta. Sem número
 * utilizável, não renderiza nada — não integra a WhatsApp Cloud API aqui,
 * é só um link `wa.me` para o corretor abrir a conversa manualmente.
 */
export function WhatsAppLink({
  phone,
  label = "WhatsApp",
  className,
}: {
  phone?: string | null;
  label?: string;
  className?: string;
}) {
  const href = toWhatsAppHref(phone);
  if (!href) return null;

  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className={className ?? "text-green-700 hover:underline"}
    >
      {label}
    </a>
  );
}
