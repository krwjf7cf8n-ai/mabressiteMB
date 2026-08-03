import { createOwnerAction } from "../actions";

export default function NewOwnerPage({ searchParams }: { searchParams: { error?: string } }) {
  return (
    <div className="max-w-xl space-y-6">
      <div>
        <h1 className="text-lg font-semibold text-slate-800">Novo proprietário</h1>
        <p className="text-sm text-slate-500">
          Dados bancários são criptografados antes de serem gravados e não são exibidos depois.
        </p>
      </div>

      {searchParams.error && (
        <div className="rounded-md border border-red-300 bg-red-50 p-3 text-sm text-red-700">
          {searchParams.error}
        </div>
      )}

      <form action={createOwnerAction} className="space-y-4 rounded-lg border border-slate-200 bg-white p-6">
        <div>
          <label className="mb-1 block text-sm font-medium text-slate-700">Nome</label>
          <input
            name="name"
            required
            className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
          />
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="mb-1 block text-sm font-medium text-slate-700">Telefone</label>
            <input name="phone" className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm" />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-slate-700">E-mail</label>
            <input
              name="email"
              type="email"
              className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
            />
          </div>
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="mb-1 block text-sm font-medium text-slate-700">CPF/CNPJ</label>
            <input name="document" className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm" />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-slate-700">Comissão acordada (%)</label>
            <input
              name="agreedCommissionPct"
              type="number"
              step="0.01"
              className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
            />
          </div>
        </div>
        <div className="flex gap-6">
          <label className="flex items-center gap-2 text-sm text-slate-600">
            <input type="checkbox" name="adAuthorization" /> Autoriza anúncio
          </label>
          <label className="flex items-center gap-2 text-sm text-slate-600">
            <input type="checkbox" name="intermediationContract" /> Contrato de intermediação assinado
          </label>
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium text-slate-700">
            Dados bancários (opcional, criptografado ao salvar)
          </label>
          <textarea
            name="bankData"
            rows={2}
            placeholder="Banco, agência, conta"
            className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
          />
        </div>
        <button
          type="submit"
          className="rounded-md bg-brand px-4 py-2 text-sm font-medium text-white hover:bg-brand-dark"
        >
          Cadastrar proprietário
        </button>
      </form>
    </div>
  );
}
