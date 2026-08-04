import { PERMISSIONS, PERMISSION_DOMAIN_LABELS, type PermissionDomain } from "@mabres/shared";
import { getCurrentSession } from "@/lib/session";
import { createRoleAction } from "../actions";

const RISK_STYLES: Record<string, string> = {
  baixo: "bg-slate-100 text-slate-600",
  medio: "bg-blue-50 text-blue-700",
  alto: "bg-amber-50 text-amber-700",
  critico: "bg-red-50 text-red-700",
};

export default async function NewRolePage({ searchParams }: { searchParams: { error?: string } }) {
  const session = await getCurrentSession();
  const actorPermissions = new Set(session?.user.permissions ?? []);

  const domains = Array.from(new Set(PERMISSIONS.map((p) => p.domain))) as PermissionDomain[];

  return (
    <div className="max-w-3xl space-y-6">
      <div>
        <h1 className="text-lg font-semibold text-slate-800">Novo papel</h1>
        <p className="text-sm text-slate-500">
          Você só pode marcar permissões que você mesmo possui — o servidor rechecha isso independentemente do que
          aparecer aqui.
        </p>
      </div>

      {searchParams.error && (
        <div className="rounded-md border border-red-300 bg-red-50 p-3 text-sm text-red-700">{searchParams.error}</div>
      )}

      <form action={createRoleAction} className="space-y-6">
        <div className="rounded-lg border border-slate-200 bg-white p-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label className="mb-1 block text-sm font-medium text-slate-700">Nome do papel</label>
              <input name="name" required className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm" />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-slate-700">Descrição (opcional)</label>
              <input name="description" className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm" />
            </div>
          </div>
        </div>

        {domains.map((domain) => (
          <fieldset key={domain} className="rounded-lg border border-slate-200 bg-white p-4">
            <legend className="px-1 text-sm font-semibold text-slate-700">{PERMISSION_DOMAIN_LABELS[domain]}</legend>
            <div className="mt-2 grid gap-2 sm:grid-cols-2">
              {PERMISSIONS.filter((p) => p.domain === domain).map((perm) => {
                const disabled = !actorPermissions.has(perm.key);
                return (
                  <label key={perm.key} className={`flex items-start gap-2 text-sm ${disabled ? "opacity-40" : ""}`}>
                    <input type="checkbox" name="permissionKeys" value={perm.key} disabled={disabled} className="mt-1" />
                    <span>
                      {perm.description}
                      <span className={`ml-2 rounded-full px-2 py-0.5 text-xs ${RISK_STYLES[perm.risk]}`}>{perm.risk}</span>
                      <br />
                      <code className="text-xs text-slate-400">{perm.key}</code>
                    </span>
                  </label>
                );
              })}
            </div>
          </fieldset>
        ))}

        <button type="submit" className="rounded-md bg-brand px-4 py-2 text-sm font-medium text-white hover:bg-brand-dark">
          Criar papel
        </button>
      </form>
    </div>
  );
}
