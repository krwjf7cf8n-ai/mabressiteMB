import { NewOwnerForm } from "./new-owner-form";

export default function NewOwnerPage() {
  return (
    <div className="max-w-xl space-y-6">
      <div>
        <h1 className="text-lg font-semibold text-slate-800">Novo proprietário</h1>
        <p className="text-sm text-slate-500">
          Dados bancários são criptografados antes de serem gravados e não são exibidos depois.
        </p>
      </div>

      <NewOwnerForm />
    </div>
  );
}
