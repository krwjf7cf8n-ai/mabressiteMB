import Link from "next/link";
import { prisma } from "@mabres/db";
import { requireSession } from "@/lib/session";
import { countUnreadNotifications } from "@/lib/notification-service";
import { SignOutButton } from "./sign-out-button";
import { MobileNav } from "./mobile-nav";
import { NotificationBell } from "./notification-bell";
import { DesktopNav } from "./nav-links";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const session = await requireSession();
  const unreadNotificationCount = await countUnreadNotifications(prisma, session.user.id);

  const navLinks = [
    { href: "/dashboard", label: "Dashboard" },
    { href: "/leads", label: "Leads & Clientes" },
    { href: "/properties", label: "Imóveis" },
    { href: "/owners", label: "Proprietários" },
    { href: "/visits", label: "Visitas" },
    { href: "/tasks", label: "Tarefas" },
    { href: "/imports", label: "Importações" },
    ...(session.user.permissions.includes("users:view") ? [{ href: "/admin/users", label: "Administração" }] : []),
  ];

  const mobileLinks = [...navLinks, { href: "/profile", label: `Perfil (${session.user.name})` }];

  return (
    <div className="min-h-screen">
      <header className="relative border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-3">
          <div className="flex items-center gap-6">
            <span className="font-semibold text-brand-dark">Mabres CRM</span>
            <DesktopNav links={navLinks} />
          </div>
          <div className="flex items-center gap-3 text-sm text-slate-600">
            <Link href="/profile" className="hidden hover:text-brand-dark sm:inline">
              {session.user.name} · {session.user.roleName}
            </Link>
            <NotificationBell initialUnreadCount={unreadNotificationCount} />
            <SignOutButton />
            <MobileNav links={mobileLinks} />
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-6xl px-6 py-8">{children}</main>
    </div>
  );
}
