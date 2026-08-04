import Link from "next/link";
import { requireSession } from "@/lib/session";
import { SignOutButton } from "./sign-out-button";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const session = await requireSession();

  return (
    <div className="min-h-screen">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-3">
          <div className="flex items-center gap-6">
            <span className="font-semibold text-brand-dark">Mabres CRM</span>
            <nav className="flex gap-4 text-sm text-slate-600">
              <Link href="/dashboard" className="hover:text-brand-dark">
                Dashboard
              </Link>
              <Link href="/leads" className="hover:text-brand-dark">
                Leads &amp; Clientes
              </Link>
              <Link href="/properties" className="hover:text-brand-dark">
                Imóveis
              </Link>
              <Link href="/owners" className="hover:text-brand-dark">
                Proprietários
              </Link>
              <Link href="/visits" className="hover:text-brand-dark">
                Visitas
              </Link>
              <Link href="/tasks" className="hover:text-brand-dark">
                Tarefas
              </Link>
              <Link href="/imports" className="hover:text-brand-dark">
                Importações
              </Link>
              {session.user.permissions.includes("users:view") && (
                <Link href="/admin/users" className="hover:text-brand-dark">
                  Administração
                </Link>
              )}
            </nav>
          </div>
          <div className="flex items-center gap-3 text-sm text-slate-600">
            <Link href="/profile" className="hover:text-brand-dark">
              {session.user.name} · {session.user.roleName}
            </Link>
            <SignOutButton />
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-6xl px-6 py-8">{children}</main>
    </div>
  );
}
