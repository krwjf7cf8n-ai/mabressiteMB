type OwnerOption = { id: string; name: string };

export interface PropertyFormValues {
  id?: string;
  status?: string;
  purpose?: string;
  propertyType?: string;
  externalRef?: string | null;
  addressLine?: string | null;
  number?: string | null;
  complement?: string | null;
  neighborhood?: string | null;
  city?: string | null;
  state?: string | null;
  zipCode?: string | null;
  condoName?: string | null;
  salePrice?: unknown;
  rentPrice?: unknown;
  condoFee?: unknown;
  iptu?: unknown;
  landArea?: unknown;
  builtArea?: unknown;
  bedrooms?: unknown;
  suites?: unknown;
  bathrooms?: unknown;
  coveredParking?: unknown;
  uncoveredParking?: unknown;
  furnished?: boolean;
  hasPool?: boolean;
  hasGourmetArea?: boolean;
  hasBackyard?: boolean;
  acceptsFinancing?: boolean;
  acceptsFgts?: boolean;
  acceptsTrade?: boolean;
  title?: string | null;
  shortDescription?: string | null;
  fullDescription?: string | null;
  legalNotes?: string | null;
  ownerId?: string | null;
  photoUrls?: string[];
}

function n(value: unknown): string {
  if (value === null || value === undefined) return "";
  const asString = typeof value === "object" && value !== null && "toString" in value ? value.toString() : String(value);
  return asString;
}

export function PropertyForm({
  action,
  values,
  owners,
  submitLabel,
}: {
  action: (formData: FormData) => void;
  values: PropertyFormValues;
  owners: OwnerOption[];
  submitLabel: string;
}) {
  return (
    <form action={action} className="space-y-5 rounded-lg border border-slate-200 bg-white p-6">
      {values.id && <input type="hidden" name="id" value={values.id} />}

      <div className="grid grid-cols-2 gap-4">
        <Field label="Tipo do imóvel" name="propertyType" defaultValue={values.propertyType ?? ""} required />
        <div>
          <label className="mb-1 block text-sm font-medium text-slate-700">Finalidade</label>
          <select name="purpose" defaultValue={values.purpose ?? "VENDA"} className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm">
            <option value="VENDA">Venda</option>
            <option value="LOCACAO">Locação</option>
            <option value="AMBAS">Ambas</option>
          </select>
        </div>
      </div>

      {values.id && (
        <div>
          <label className="mb-1 block text-sm font-medium text-slate-700">Status</label>
          <select name="status" defaultValue={values.status ?? "ativo"} className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm">
            <option value="ativo">Ativo</option>
            <option value="vendido">Vendido</option>
            <option value="alugado">Alugado</option>
            <option value="suspenso">Suspenso</option>
            <option value="indisponivel">Indisponível</option>
            <option value="inativo">Inativo</option>
          </select>
        </div>
      )}

      <Field label="Referência externa (e-Móvel)" name="externalRef" defaultValue={values.externalRef ?? ""} placeholder="Preenchido quando a sincronização for confirmada" />

      <div className="grid grid-cols-3 gap-4">
        <Field label="Endereço" name="addressLine" defaultValue={values.addressLine ?? ""} />
        <Field label="Número" name="number" defaultValue={values.number ?? ""} />
        <Field label="Complemento" name="complement" defaultValue={values.complement ?? ""} />
      </div>
      <div className="grid grid-cols-4 gap-4">
        <Field label="Bairro" name="neighborhood" defaultValue={values.neighborhood ?? ""} />
        <Field label="Cidade" name="city" defaultValue={values.city ?? "Sorocaba"} />
        <Field label="UF" name="state" defaultValue={values.state ?? "SP"} maxLength={2} />
        <Field label="CEP" name="zipCode" defaultValue={values.zipCode ?? ""} />
      </div>
      <Field label="Condomínio" name="condoName" defaultValue={values.condoName ?? ""} />

      <div className="grid grid-cols-4 gap-4">
        <Field label="Valor de venda (R$)" name="salePrice" type="number" step="0.01" defaultValue={n(values.salePrice)} />
        <Field label="Valor de locação (R$)" name="rentPrice" type="number" step="0.01" defaultValue={n(values.rentPrice)} />
        <Field label="Condomínio (R$)" name="condoFee" type="number" step="0.01" defaultValue={n(values.condoFee)} />
        <Field label="IPTU (R$)" name="iptu" type="number" step="0.01" defaultValue={n(values.iptu)} />
      </div>

      <div className="grid grid-cols-6 gap-4">
        <Field label="Terreno (m²)" name="landArea" type="number" step="0.01" defaultValue={n(values.landArea)} />
        <Field label="Construída (m²)" name="builtArea" type="number" step="0.01" defaultValue={n(values.builtArea)} />
        <Field label="Dormitórios" name="bedrooms" type="number" defaultValue={n(values.bedrooms)} />
        <Field label="Suítes" name="suites" type="number" defaultValue={n(values.suites)} />
        <Field label="Banheiros" name="bathrooms" type="number" defaultValue={n(values.bathrooms)} />
        <Field label="Vagas cobertas" name="coveredParking" type="number" defaultValue={n(values.coveredParking)} />
      </div>

      <div className="grid grid-cols-3 gap-2 sm:grid-cols-6">
        <Checkbox label="Mobiliado" name="furnished" defaultChecked={values.furnished} />
        <Checkbox label="Piscina" name="hasPool" defaultChecked={values.hasPool} />
        <Checkbox label="Área gourmet" name="hasGourmetArea" defaultChecked={values.hasGourmetArea} />
        <Checkbox label="Quintal" name="hasBackyard" defaultChecked={values.hasBackyard} />
        <Checkbox label="Aceita financiamento" name="acceptsFinancing" defaultChecked={values.acceptsFinancing ?? true} />
        <Checkbox label="Aceita FGTS" name="acceptsFgts" defaultChecked={values.acceptsFgts ?? true} />
        <Checkbox label="Aceita permuta" name="acceptsTrade" defaultChecked={values.acceptsTrade} />
      </div>

      <Field label="Título do anúncio" name="title" defaultValue={values.title ?? ""} />
      <div>
        <label className="mb-1 block text-sm font-medium text-slate-700">Descrição curta</label>
        <textarea name="shortDescription" rows={2} defaultValue={values.shortDescription ?? ""} className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm" />
      </div>
      <div>
        <label className="mb-1 block text-sm font-medium text-slate-700">Descrição completa</label>
        <textarea name="fullDescription" rows={4} defaultValue={values.fullDescription ?? ""} className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm" />
      </div>
      <div>
        <label className="mb-1 block text-sm font-medium text-slate-700">Observações jurídicas / restritas</label>
        <textarea name="legalNotes" rows={2} defaultValue={values.legalNotes ?? ""} className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm" />
      </div>

      <div>
        <label className="mb-1 block text-sm font-medium text-slate-700">Fotos (uma URL por linha)</label>
        <textarea
          name="photoUrls"
          rows={3}
          defaultValue={(values.photoUrls ?? []).join("\n")}
          placeholder="https://exemplo.com/foto1.jpg"
          className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
        />
      </div>

      <div>
        <label className="mb-1 block text-sm font-medium text-slate-700">Proprietário</label>
        <select name="ownerId" defaultValue={values.ownerId ?? ""} className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm">
          <option value="">Sem proprietário vinculado</option>
          {owners.map((owner) => (
            <option key={owner.id} value={owner.id}>
              {owner.name}
            </option>
          ))}
        </select>
      </div>

      <button type="submit" className="rounded-md bg-brand px-4 py-2 text-sm font-medium text-white hover:bg-brand-dark">
        {submitLabel}
      </button>
    </form>
  );
}

function Field({
  label,
  name,
  defaultValue,
  type = "text",
  required,
  maxLength,
  step,
  placeholder,
}: {
  label: string;
  name: string;
  defaultValue?: string;
  type?: string;
  required?: boolean;
  maxLength?: number;
  step?: string;
  placeholder?: string;
}) {
  return (
    <div>
      <label className="mb-1 block text-sm font-medium text-slate-700">{label}</label>
      <input
        name={name}
        type={type}
        step={step}
        required={required}
        maxLength={maxLength}
        defaultValue={defaultValue}
        placeholder={placeholder}
        className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
      />
    </div>
  );
}

function Checkbox({ label, name, defaultChecked }: { label: string; name: string; defaultChecked?: boolean }) {
  return (
    <label className="flex items-center gap-2 text-sm text-slate-600">
      <input type="checkbox" name={name} defaultChecked={defaultChecked} /> {label}
    </label>
  );
}
