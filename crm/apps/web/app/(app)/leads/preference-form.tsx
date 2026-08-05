import { CRITERION_KEYS, CRITERION_LABELS, DEFAULT_REQUIREMENT_LEVELS, type CriterionKey } from "@mabres/shared";
import { updatePreferenceAction } from "./actions";

export interface PreferenceFormValues {
  contactId: string;
  intent?: string | null;
  desiredCity?: string | null;
  desiredNeighborhoods?: string[];
  propertyType?: string | null;
  minPrice?: unknown;
  maxPrice?: unknown;
  bedrooms?: unknown;
  suites?: unknown;
  parkingSpots?: unknown;
  needsBackyard?: boolean | null;
  needsGourmetArea?: boolean | null;
  houseFormat?: string | null;
  condoOrOpen?: string | null;
  criteriaRequirements?: Partial<Record<CriterionKey, string>> | null;
}

function n(value: unknown): string {
  if (value === null || value === undefined) return "";
  return typeof value === "object" && "toString" in value ? value.toString() : String(value);
}

export function PreferenceForm({ values }: { values: PreferenceFormValues }) {
  const requirements = values.criteriaRequirements ?? {};

  return (
    <form action={updatePreferenceAction} className="space-y-4 rounded-lg border border-slate-200 bg-white p-4">
      <input type="hidden" name="contactId" value={values.contactId} />

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="mb-1 block text-sm font-medium text-slate-700">Interesse</label>
          <select name="intent" defaultValue={values.intent ?? ""} className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm">
            <option value="">Não informado</option>
            <option value="COMPRA">Compra</option>
            <option value="LOCACAO">Locação</option>
            <option value="INVESTIMENTO">Investimento</option>
            <option value="VENDA">Venda (cliente quer vender um imóvel)</option>
          </select>
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium text-slate-700">Tipo de imóvel desejado</label>
          <input name="propertyType" defaultValue={values.propertyType ?? ""} className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm" />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="mb-1 block text-sm font-medium text-slate-700">Cidade desejada</label>
          <input name="desiredCity" defaultValue={values.desiredCity ?? ""} className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm" />
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium text-slate-700">Bairros desejados (separados por vírgula)</label>
          <input
            name="desiredNeighborhoods"
            defaultValue={(values.desiredNeighborhoods ?? []).join(", ")}
            className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
          />
        </div>
      </div>

      <div className="grid grid-cols-5 gap-3">
        <div>
          <label className="mb-1 block text-sm font-medium text-slate-700">Preço mín. (R$)</label>
          <input name="minPrice" type="number" step="0.01" defaultValue={n(values.minPrice)} className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm" />
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium text-slate-700">Preço máx. (R$)</label>
          <input name="maxPrice" type="number" step="0.01" defaultValue={n(values.maxPrice)} className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm" />
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium text-slate-700">Dormitórios</label>
          <input name="bedrooms" type="number" defaultValue={n(values.bedrooms)} className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm" />
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium text-slate-700">Suítes</label>
          <input name="suites" type="number" defaultValue={n(values.suites)} className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm" />
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium text-slate-700">Vagas</label>
          <input name="parkingSpots" type="number" defaultValue={n(values.parkingSpots)} className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm" />
        </div>
      </div>

      <div className="flex flex-wrap gap-4">
        <label className="flex items-center gap-2 text-sm text-slate-600">
          <input type="checkbox" name="needsBackyard" defaultChecked={values.needsBackyard ?? false} /> Precisa de quintal
        </label>
        <label className="flex items-center gap-2 text-sm text-slate-600">
          <input type="checkbox" name="needsGourmetArea" defaultChecked={values.needsGourmetArea ?? false} /> Precisa de área gourmet
        </label>
        <div>
          <select name="houseFormat" defaultValue={values.houseFormat ?? ""} className="rounded-md border border-slate-300 px-2 py-1 text-sm">
            <option value="">Casa térrea ou sobrado: indiferente</option>
            <option value="terrea">Prefere térrea</option>
            <option value="sobrado">Prefere sobrado</option>
          </select>
        </div>
        <div>
          <select name="condoOrOpen" defaultValue={values.condoOrOpen ?? ""} className="rounded-md border border-slate-300 px-2 py-1 text-sm">
            <option value="">Condomínio ou bairro aberto: indiferente</option>
            <option value="condominio">Prefere condomínio</option>
            <option value="aberto">Prefere bairro aberto</option>
          </select>
        </div>
      </div>

      <div>
        <h3 className="mb-2 text-sm font-semibold text-slate-700">Prioridade dos critérios de matching</h3>
        <div className="grid grid-cols-2 gap-x-6 gap-y-1 sm:grid-cols-3">
          {CRITERION_KEYS.map((key: CriterionKey) => (
            <div key={key} className="flex items-center justify-between gap-2 py-1 text-sm">
              <label htmlFor={`requirement__${key}`} className="text-slate-600">
                {CRITERION_LABELS[key]}
              </label>
              <select
                id={`requirement__${key}`}
                name={`requirement__${key}`}
                defaultValue={requirements[key] ?? DEFAULT_REQUIREMENT_LEVELS[key]}
                className="rounded-md border border-slate-300 px-1 py-0.5 text-xs"
              >
                <option value="obrigatoria">Obrigatória</option>
                <option value="desejavel">Desejável</option>
                <option value="indiferente">Indiferente</option>
              </select>
            </div>
          ))}
        </div>
      </div>

      <button type="submit" className="rounded-md bg-brand px-4 py-2 text-sm font-medium text-white hover:bg-brand-dark">
        Salvar preferências
      </button>
    </form>
  );
}
