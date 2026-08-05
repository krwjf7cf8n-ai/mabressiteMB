import { prisma } from "@mabres/db";
import { getCurrentSession } from "@/lib/session";
import { selfChangePasswordFromProfileAction, selfProfileUpdateAction } from "../admin/users/actions";

export default async function ProfilePage({
  searchParams,
}: {
  searchParams: { error?: string; passwordChanged?: string };
}) {
  const session = await getCurrentSession();
  const user = await prisma.user.findUniqueOrThrow({ where: { id: session!.user.id } });

  return (
    <div className="max-w-xl space-y-6">
      <div>
        <h1 className="text-lg font-semibold text-slate-800">Meu perfil</h1>
        <p className="text-sm text-slate-500">Papel: {session?.user.roleName}. Você só pode alterar seus próprios dados básicos e senha.</p>
      </div>

      {searchParams.error && (
        <div className="rounded-md border border-red-300 bg-red-50 p-3 text-sm text-red-700">{searchParams.error}</div>
      )}
      {searchParams.passwordChanged && (
        <div className="rounded-md border border-green-300 bg-green-50 p-3 text-sm text-green-700">Senha alterada com sucesso.</div>
      )}

      <section className="rounded-lg border border-slate-200 bg-white p-4">
        <h2 className="mb-3 text-sm font-semibold text-slate-700">Dados básicos</h2>
        <form action={selfProfileUpdateAction} className="space-y-3">
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-700">Nome</label>
            <input name="name" defaultValue={user.name} required className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm" />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-700">Telefone</label>
            <input name="phone" defaultValue={user.phone ?? ""} className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm" />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-700">E-mail</label>
            <input value={user.email} disabled className="w-full rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-500" />
          </div>
          <button type="submit" className="rounded-md bg-brand px-4 py-2 text-sm font-medium text-white hover:bg-brand-dark">
            Salvar
          </button>
        </form>
      </section>

      <section className="rounded-lg border border-slate-200 bg-white p-4">
        <h2 className="mb-3 text-sm font-semibold text-slate-700">Trocar senha</h2>
        <form action={selfChangePasswordFromProfileAction} className="space-y-3">
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-700">Senha atual</label>
            <input type="password" name="currentPassword" required className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm" />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-700">Nova senha</label>
            <input type="password" name="newPassword" required minLength={10} className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm" />
          </div>
          <label className="flex items-center gap-2 text-xs text-slate-600">
            <input type="checkbox" name="revokeOtherSessions" defaultChecked /> Encerrar minhas outras sessões ativas
          </label>
          <button type="submit" className="rounded-md border border-slate-300 px-3 py-1.5 text-sm hover:bg-slate-50">
            Trocar senha
          </button>
        </form>
      </section>
    </div>
  );
}
