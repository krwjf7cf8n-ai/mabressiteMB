import { uploadImportFileAction } from "../actions";

export default function NewImportPage({ searchParams }: { searchParams: { error?: string } }) {
  return (
    <div className="max-w-2xl space-y-6">
      <div>
        <h1 className="text-lg font-semibold text-slate-800">Nova importação — leads e clientes</h1>
        <p className="text-sm text-slate-500">
          Envie um arquivo CSV (UTF-8, delimitador vírgula ou ponto e vírgula, com cabeçalho). Nenhum registro é
          criado até você revisar o mapeamento, os erros e confirmar a execução.
        </p>
      </div>

      {searchParams.error && (
        <div className="rounded-md border border-red-300 bg-red-50 p-3 text-sm text-red-700">{searchParams.error}</div>
      )}

      <form action={uploadImportFileAction} className="space-y-4 rounded-lg border border-slate-200 bg-white p-6">
        <div>
          <label className="mb-1 block text-sm font-medium text-slate-700">Arquivo CSV</label>
          <input type="file" name="file" accept=".csv,text/csv" required className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm" />
        </div>
        <p className="text-xs text-slate-500">
          Ainda não suportamos XLSX nesta fase — exporte sua planilha como CSV antes de enviar. Só leads e clientes
          são importados aqui (imóveis, proprietários, visitas e propostas ficam para fases futuras).
        </p>
        <button type="submit" className="rounded-md bg-brand px-4 py-2 text-sm font-medium text-white hover:bg-brand-dark">
          Enviar e pré-visualizar
        </button>
      </form>
    </div>
  );
}
