import { prisma } from "@mabres/db";
import { createPropertyAction } from "../actions";
import { PropertyForm, type PropertyFormValues } from "../property-form";

/** G31 — reconstrói os valores digitados antes de um erro de validação (ver createPropertyAction). */
function parsePreservedValues(raw: string | undefined): PropertyFormValues {
  if (!raw) return {};
  try {
    return JSON.parse(raw) as PropertyFormValues;
  } catch {
    return {};
  }
}

export default async function NewPropertyPage({ searchParams }: { searchParams: { error?: string; values?: string } }) {
  const owners = await prisma.owner.findMany({ where: { deletedAt: null }, select: { id: true, name: true } });
  const values = parsePreservedValues(searchParams.values);

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

      <PropertyForm action={createPropertyAction} values={values} owners={owners} submitLabel="Cadastrar imóvel" />
    </div>
  );
}
