"use client";

import { useFormState, useFormStatus } from "react-dom";
import { useState } from "react";
import { createContactAction, type CreateContactState } from "../actions";

const initialState: CreateContactState = { status: "idle" };

function SubmitButton({ label }: { label: string }) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="rounded-md bg-brand px-4 py-2 text-sm font-medium text-white hover:bg-brand-dark disabled:opacity-60"
    >
      {pending ? "Salvando..." : label}
    </button>
  );
}

export function NewLeadForm() {
  const [state, formAction] = useFormState(createContactAction, initialState);
  const [confirmed, setConfirmed] = useState(false);

  return (
    <form action={formAction} className="space-y-4 rounded-lg border border-slate-200 bg-white p-6">
      <input type="hidden" name="confirmed" value={confirmed ? "true" : "false"} />

      <Field label="Nome completo" name="name" required />
      <div className="grid grid-cols-2 gap-4">
        <Field label="Telefone" name="phone" />
        <Field label="WhatsApp" name="whatsapp" />
      </div>
      <div className="grid grid-cols-2 gap-4">
        <Field label="E-mail" name="email" type="email" />
        <div>
          <label className="mb-1 block text-sm font-medium text-slate-700">Origem</label>
          <select name="origin" className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm">
            <option value="MANUAL">Manual</option>
            <option value="INDICACAO">Indicação</option>
            <option value="OUTRO">Outro</option>
          </select>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-4">
        <Field label="Cidade" name="city" defaultValue="Sorocaba" />
        <Field label="UF" name="state" defaultValue="SP" maxLength={2} />
      </div>
      <div>
        <label className="mb-1 block text-sm font-medium text-slate-700">Observações</label>
        <textarea name="notes" rows={3} className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm" />
      </div>

      <div className="flex items-start gap-2">
        <input type="checkbox" id="consentGiven" name="consentGiven" className="mt-1" />
        <label htmlFor="consentGiven" className="text-sm text-slate-600">
          Cliente consentiu em ser contatado (LGPD). Registre a origem do consentimento abaixo.
        </label>
      </div>
      <Field label="Origem do consentimento" name="consentOrigin" placeholder="ex.: verbal na visita, formulário do site" />

      {state.status === "error" && <p className="text-sm text-red-600">{state.message}</p>}

      {state.status === "duplicate_warning" && (
        <div className="rounded-md border border-amber-300 bg-amber-50 p-4 text-sm text-amber-800">
          <p className="font-medium">Possível duplicidade encontrada</p>
          <p className="mt-1">
            Este contato coincide com {state.duplicates?.length} cadastro(s) já existente(s) (telefone,
            WhatsApp ou e-mail). Nenhum histórico será apagado. Confirme se deseja cadastrar mesmo assim —
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

      <SubmitButton label="Cadastrar lead" />
    </form>
  );
}

function Field({
  label,
  name,
  type = "text",
  required,
  defaultValue,
  maxLength,
  placeholder,
}: {
  label: string;
  name: string;
  type?: string;
  required?: boolean;
  defaultValue?: string;
  maxLength?: number;
  placeholder?: string;
}) {
  return (
    <div>
      <label htmlFor={name} className="mb-1 block text-sm font-medium text-slate-700">
        {label}
      </label>
      <input
        id={name}
        name={name}
        type={type}
        required={required}
        defaultValue={defaultValue}
        maxLength={maxLength}
        placeholder={placeholder}
        className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-brand focus:outline-none focus:ring-1 focus:ring-brand"
      />
    </div>
  );
}
