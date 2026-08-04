"use client";

import Link from "next/link";
import { useState } from "react";

interface NavLinkItem {
  href: string;
  label: string;
}

/**
 * Navegação mobile: mesma lista de links da navegação desktop, mas atrás de
 * um botão de menu abaixo do breakpoint `md`. Sem biblioteca externa — só
 * `useState` local para abrir/fechar.
 */
export function MobileNav({ links }: { links: NavLinkItem[] }) {
  const [open, setOpen] = useState(false);

  return (
    <div className="md:hidden">
      <button
        type="button"
        aria-expanded={open}
        aria-controls="mobile-nav-menu"
        aria-label={open ? "Fechar menu de navegação" : "Abrir menu de navegação"}
        onClick={() => setOpen((prev) => !prev)}
        className="flex h-11 w-11 items-center justify-center rounded-md border border-slate-300 text-slate-600 hover:bg-slate-50"
      >
        {open ? (
          <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
            <path strokeLinecap="round" strokeLinejoin="round" d="M6 6l12 12M18 6L6 18" />
          </svg>
        ) : (
          <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
            <path strokeLinecap="round" strokeLinejoin="round" d="M4 7h16M4 12h16M4 17h16" />
          </svg>
        )}
      </button>

      {open && (
        <nav id="mobile-nav-menu" aria-label="Navegação principal" className="absolute inset-x-0 top-full z-20 border-b border-slate-200 bg-white px-6 py-3 shadow-sm">
          <ul className="flex flex-col gap-1 text-sm text-slate-600">
            {links.map((link) => (
              <li key={link.href}>
                <Link
                  href={link.href}
                  onClick={() => setOpen(false)}
                  className="block rounded-md px-3 py-2.5 hover:bg-slate-50 hover:text-brand-dark"
                >
                  {link.label}
                </Link>
              </li>
            ))}
          </ul>
        </nav>
      )}
    </div>
  );
}
