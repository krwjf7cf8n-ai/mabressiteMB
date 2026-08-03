import { prisma } from "@mabres/db";
import { createPropertyAction } from "../actions";
import { PropertyForm } from "../property-form";

export default async function NewPropertyPage({ searchParams }: { searchParams: { error?: string } }) {
  const owners = await prisma.owner.findMany({ where: { deletedAt: null }, select: { id: true, name: true } });

  return (
    <div className="max-w-3xl space-y-6">
      <div>
        <h1 className="text-lg font-semibold text-slate-800">Novo imóvel</h1>
        <p className="text-sm text-slate-500">
          O código interno é gerado automaticamente. A sincronização com o e-Móvel Brokers ainda não está
          ativa — o campo de referência externa é apenas informativo nesta fase.
        </p>
      </div>

      {searchParams.error && (
        <div className="rounded-md border border-red-300 bg-red-50 p-3 text-sm text-red-700">
          {searchParams.error}
        </div>
      )}

      <PropertyForm action={createPropertyAction} values={{}} owners={owners} submitLabel="Cadastrar imóvel" />
    </div>
  );
}
