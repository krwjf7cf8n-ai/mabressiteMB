import { redirect } from "next/navigation";
import { requireSession } from "@/lib/session";
import { forcedChangePasswordAction } from "./actions";

export default async function ChangePasswordPage({ searchParams }: { searchParams: { error?: string } }) {
  const session = await requireSession({ allowMustChangePassword: true });
  if (!session.user.mustChangePassword) {
    redirect("/dashboard");
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-100 px-4">
      <div className="w-full max-w-sm rounded-xl bg-white p-8 shadow-sm">
        <h1 className="mb-1 text-xl font-semibold text-brand-dark">Troca de senha obrigatória</h1>
        <p className="mb-6 text-sm text-slate-500">
          Por segurança, defina uma nova senha antes de continuar. As demais sessões ativas serão encerradas.
        </p>

        {searchParams.error && (
          <div className="mb-4 rounded-md border border-red-300 bg-red-50 p-3 text-sm text-red-700">{searchParams.error}</div>
        )}

        <form action={forcedChangePasswordAction} className="space-y-4">
          <div>
            <label className="mb-1 block text-sm font-medium text-slate-700">Senha atual (temporária)</label>
            <input type="password" name="currentPassword" required className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm" />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-slate-700">Nova senha</label>
            <input type="password" name="newPassword" required minLength={10} className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm" />
            <p className="mt-1 text-xs text-slate-500">Mínimo 10 caracteres, com ao menos uma letra e um número.</p>
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-slate-700">Confirmar nova senha</label>
            <input type="password" name="confirmPassword" required minLength={10} className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm" />
          </div>
          <button type="submit" className="w-full rounded-md bg-brand px-4 py-2 text-sm font-medium text-white hover:bg-brand-dark">
            Trocar senha e continuar
          </button>
        </form>
      </div>
    </main>
  );
}
