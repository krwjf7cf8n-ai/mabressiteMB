"use client";

import { useFormState, useFormStatus } from "react-dom";
import { useState } from "react";
import { createVisitAction, type CreateVisitState } from "../actions";

const initialState: CreateVisitState = { status: "idle" };

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="rounded-md bg-brand px-4 py-2 text-sm font-medium text-white hover:bg-brand-dark disabled:opacity-60"
    >
      {pending ? "Agendando..." : "Agendar visita"}
    </button>
  );
}

export function NewVisitForm({
  contacts,
  properties,
  brokers,
  canOverrideConflict,
}: {
  contacts: Array<{ id: string; name: string }>;
  properties: Array<{ id: string; internalCode: string; propertyType: string; status: string }>;
  brokers: Array<{ id: string; name: string }>;
  canOverrideConflict: boolean;
}) {
  const [state, formAction] = useFormState(createVisitAction, initialState);
  const [confirmConflict, setConfirmConflict] = useState(false);
  const [justification, setJustification] = useState("");

  const needsConfirmation = state.status === "conflict_warning" || state.status === "inactive_property";

  return (
    <form action={formAction} className="space-y-4 rounded-lg border border-slate-200 bg-white p-6">
      <input type="hidden" name="confirmConflict" value={confirmConflict ? "true" : "false"} />
      <input type="hidden" name="conflictJustification" value={justification} />

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="mb-1 block text-sm font-medium text-slate-700">Cliente</label>
          <select name="contactId" required className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm">
            <option value="">Selecione...</option>
            {contacts.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium text-slate-700">Imóvel</label>
          <select name="propertyId" required className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm">
            <option value="">Selecione...</option>
            {properties.map((p) => (
              <option key={p.id} value={p.id}>
                {p.internalCode} — {p.propertyType} {p.status !== "ativo" ? `(${p.status})` : ""}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="mb-1 block text-sm font-medium text-slate-700">Corretor responsável</label>
          <select name="brokerUserId" required className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm">
            {brokers.map((b) => (
              <option key={b.id} value={b.id}>
                {b.name}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium text-slate-700">Modalidade</label>
          <select name="modality" defaultValue="PRESENCIAL" className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm">
            <option value="PRESENCIAL">Presencial</option>
            <option value="VIDEO">Vídeo</option>
          </select>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="mb-1 block text-sm font-medium text-slate-700">Data e horário</label>
          <input type="datetime-local" name="scheduledAt" required className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm" />
          <p className="mt-1 text-xs text-slate-400">Horário local (America/Sao_Paulo).</p>
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium text-slate-700">Duração (minutos)</label>
          <input type="number" name="durationMinutes" defaultValue={45} className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm" />
        </div>
      </div>

      <div>
        <label className="mb-1 block text-sm font-medium text-slate-700">Ponto de encontro / endereço</label>
        <input name="meetingPoint" className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm" />
      </div>
      <div>
        <label className="mb-1 block text-sm font-medium text-slate-700">Observações internas</label>
        <textarea name="internalNotes" rows={2} className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm" />
      </div>
      <div>
        <label className="mb-1 block text-sm font-medium text-slate-700">Orientações para o cliente (uso futuro)</label>
        <textarea name="clientInstructions" rows={2} className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm" />
      </div>

      <label className="flex items-center gap-2 text-sm text-slate-600">
        <input type="checkbox" name="createConfirmationTask" defaultChecked /> Criar tarefa automática de confirmação
      </label>

      {state.status === "error" && <p className="text-sm text-red-600">{state.message}</p>}

      {state.status === "inactive_property" && (
        <div className="rounded-md border border-amber-300 bg-amber-50 p-4 text-sm text-amber-800">
          <p className="font-medium">Imóvel não está ativo</p>
          <p className="mt-1">{state.message}</p>
          {canOverrideConflict ? (
            <>
              <input
                type="text"
                placeholder="Justificativa obrigatória para agendar mesmo assim"
                value={justification}
                onChange={(e) => setJustification(e.target.value)}
                className="mt-2 w-full rounded-md border border-amber-300 px-3 py-2 text-sm"
              />
              <button
                type="button"
                onClick={() => setConfirmConflict(true)}
                disabled={!justification.trim()}
                className="mt-2 rounded-md bg-amber-600 px-3 py-1.5 text-white hover:bg-amber-700 disabled:opacity-50"
              >
                Agendar mesmo assim
              </button>
            </>
          ) : (
            <p className="mt-2 text-amber-700">Você não tem permissão para agendar visita em imóvel inativo.</p>
          )}
        </div>
      )}

      {state.status === "conflict_warning" && (
        <div className="rounded-md border border-amber-300 bg-amber-50 p-4 text-sm text-amber-800">
          <p className="font-medium">Conflito de agenda encontrado</p>
          <ul className="mt-1 list-disc pl-5">
            {state.conflicts?.map((c, i) => (
              <li key={i}>Conflito de {c.type} com outra visita já agendada.</li>
            ))}
          </ul>
          {canOverrideConflict ? (
            <>
              <input
                type="text"
                placeholder="Justificativa para confirmar mesmo com conflito"
                value={justification}
                onChange={(e) => setJustification(e.target.value)}
                className="mt-2 w-full rounded-md border border-amber-300 px-3 py-2 text-sm"
              />
              <button
                type="button"
                onClick={() => setConfirmConflict(true)}
                disabled={!justification.trim()}
                className="mt-2 rounded-md bg-amber-600 px-3 py-1.5 text-white hover:bg-amber-700 disabled:opacity-50"
              >
                Confirmar mesmo com conflito
              </button>
            </>
          ) : (
            <p className="mt-2 text-amber-700">Você não tem permissão para confirmar visita com conflito de agenda.</p>
          )}
        </div>
      )}

      {needsConfirmation && confirmConflict && (
        <p className="text-sm text-emerald-700">Justificativa registrada — clique novamente em &quot;Agendar visita&quot; para confirmar.</p>
      )}

      <SubmitButton />
    </form>
  );
}
