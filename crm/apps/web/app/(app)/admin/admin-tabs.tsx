import Link from "next/link";

export function AdminTabs({ active }: { active: "users" | "roles" }) {
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
    </nav>
  );
}
