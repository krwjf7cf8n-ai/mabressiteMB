"use client";

import { signOut } from "next-auth/react";

export function SignOutButton() {
  return (
    <button
      onClick={() => signOut({ callbackUrl: "/login" })}
      className="rounded-md border border-slate-300 px-3 py-1 text-slate-600 hover:bg-slate-50"
    >
      Sair
    </button>
  );
}
