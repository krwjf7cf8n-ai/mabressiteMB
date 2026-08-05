"use client";

import { useFormState } from "react-dom";
import { useState } from "react";
import { createOwnerAction, type CreateOwnerState } from "../actions";
import { SubmitButton } from "@/components/submit-button";

const initialState: CreateOwnerState = { status: "idle" };

export function NewOwnerForm() {
  const [state, formAction] = useFormState(createOwnerAction, initialState);
  const [confirmed, setConfirmed] = useState(false);

  return (
    <form action={formAction} className="space-y-4 rounded-lg border border-slate-200 bg-white p-6">
      <input type="hidden" name="confirmed" value={confirmed ? "true" : "false"} />

      <div>
        <label className="mb-1 block text-sm font-medium text-slate-700">Nome</label>
        <input name="name" required className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm" />
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="mb-1 block text-sm font-medium text-slate-700">Telefone</label>
          <input name="phone" className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm" />
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium text-slate-700">E-mail</label>
          <input name="email" type="email" className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm" />
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

      {state.status === "error" && <p className="text-sm text-red-600">{state.message}</p>}

      {state.status === "duplicate_warning" && (
        <div className="rounded-md border border-amber-300 bg-amber-50 p-4 text-sm text-amber-800">
          <p className="font-medium">Possível duplicidade encontrada</p>
          <p className="mt-1">
            Este proprietário coincide com {state.duplicates?.length} cadastro(s) já existente(s) (telefone,
            e-mail ou CPF/CNPJ). Nenhum histórico será apagado. Confirme se deseja cadastrar mesmo assim —
            depois você poderá relacionar os registros manualmente.
          </p>
          <button
            type="button"
            onClick={() => setConfirmed(true)}
            className="mt-3 rounded-md bg-amber-600 px-3 py-1.5 text-white hover:bg-amber-700"
          >
            Cadastrar mesmo assim
          </button>
        </div>
      )}

      <SubmitButton label="Cadastrar proprietário" />
    </form>
  );
}
