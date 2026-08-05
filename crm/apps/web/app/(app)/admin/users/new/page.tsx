import { prisma } from "@mabres/db";
import { createUserAction } from "../actions";

export default async function NewUserPage({ searchParams }: { searchParams: { error?: string } }) {
  const roles = await prisma.role.findMany({ where: { disabledAt: null }, orderBy: { name: "asc" } });

  return (
    <div className="max-w-xl space-y-6">
      <div>
        <h1 className="text-lg font-semibold text-slate-800">Novo usuário</h1>
        <p className="text-sm text-slate-500">
          O sistema gera uma senha temporária, exibida uma única vez após o cadastro. O usuário será obrigado a
          trocá-la no primeiro login.
        </p>
      </div>

      {searchParams.error && (
        <div className="rounded-md border border-red-300 bg-red-50 p-3 text-sm text-red-700">{searchParams.error}</div>
      )}

      <form action={createUserAction} className="space-y-4 rounded-lg border border-slate-200 bg-white p-6">
        <div>
          <label className="mb-1 block text-sm font-medium text-slate-700">Nome</label>
          <input name="name" required className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm" />
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium text-slate-700">E-mail</label>
          <input name="email" type="email" required className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm" />
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium text-slate-700">Telefone (opcional)</label>
          <input name="phone" className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm" />
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium text-slate-700">Papel</label>
          <select name="roleId" required className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm">
            <option value="">Selecione um papel</option>
            {roles.map((r) => (
              <option key={r.id} value={r.id}>
                {r.name}
                {r.isAdminRole ? " (administrador)" : ""}
              </option>
            ))}
          </select>
          <p className="mt-1 text-xs text-slate-500">
            Você só pode atribuir um papel cujas permissões você já possui — evita criar um usuário com mais acesso
            do que você mesmo tem.
          </p>
        </div>
        <button type="submit" className="rounded-md bg-brand px-4 py-2 text-sm font-medium text-white hover:bg-brand-dark">
          Cadastrar usuário
        </button>
      </form>
    </div>
  );
}
