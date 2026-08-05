import Link from "next/link";

export function AdminTabs({ active }: { active: "users" | "roles" | "stages" }) {
  return (
    <nav className="flex gap-4 border-b border-slate-200 text-sm">
      <Link
        href="/admin/users"
        className={`-mb-px border-b-2 pb-2 ${active === "users" ? "border-brand text-brand-dark" : "border-transparent text-slate-500 hover:text-brand-dark"}`}
      >
        Usuários
      </Link>
      <Link
        href="/admin/roles"
        className={`-mb-px border-b-2 pb-2 ${active === "roles" ? "border-brand text-brand-dark" : "border-transparent text-slate-500 hover:text-brand-dark"}`}
      >
        Papéis
      </Link>
      <Link
        href="/admin/stages"
        className={`-mb-px border-b-2 pb-2 ${active === "stages" ? "border-brand text-brand-dark" : "border-transparent text-slate-500 hover:text-brand-dark"}`}
      >
        Etapas do funil
      </Link>
    </nav>
  );
}
