import { NewLeadForm } from "./new-lead-form";

export default function NewLeadPage() {
  return (
    <div className="max-w-2xl space-y-6">
      <div>
        <h1 className="text-lg font-semibold text-slate-800">Novo lead</h1>
        <p className="text-sm text-slate-500">
          Cadastro manual. Leads da Meta, site e WhatsApp serão criados automaticamente quando as
          integrações forem ativadas.
        </p>
      </div>
      <NewLeadForm />
    </div>
  );
}
