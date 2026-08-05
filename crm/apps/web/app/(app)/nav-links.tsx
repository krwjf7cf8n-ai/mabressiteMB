"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

export interface NavLinkItem {
  href: string;
  label: string;
}

/**
 * G31 — compara pelo primeiro segmento do caminho (ex.: "leads" em
 * "/leads/123" e em "/leads") em vez de igualdade exata, para que a página
 * de detalhe/edição de uma seção continue destacando o item de menu certo.
 * "Administração" cobre `/admin/*` inteiro mesmo apontando só para
 * `/admin/users` — é o único item que hoje agrega várias sub-rotas.
 */
export function isActive(pathname: string, href: string): boolean {
  const current = pathname.split("/")[1] ?? "";
  const target = href.split("/")[1] ?? "";
  return current !== "" && current === target;
}

export function DesktopNav({ links }: { links: NavLinkItem[] }) {
  const pathname = usePathname();
  return (
    <nav className="hidden gap-4 text-sm text-slate-600 md:flex">
      {links.map((link) => {
        const active = isActive(pathname, link.href);
        return (
          <Link
            key={link.href}
            href={link.href}
            aria-current={active ? "page" : undefined}
            className={active ? "font-medium text-brand-dark" : "hover:text-brand-dark"}
          >
            {link.label}
          </Link>
        );
      })}
    </nav>
  );
}
