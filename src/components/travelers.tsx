"use client";

import { useState } from "react";
import { saveTraveler } from "@/app/(dashboard)/actions";
import { expiryState } from "@/lib/avisos/rules";
import { dateBR } from "@/lib/ui/labels";
import { ActionForm, Field, inputClass } from "./forms";

export interface TravelerRow {
  id: string;
  full_name: string;
  birth_date: string | null;
  passport_expires_on: string | null;
  has_passport: boolean | null;
  us_visa_expires_on: string | null;
  has_us_visa: boolean | null;
}

export function DocBadge({ date, has, today, label }: { date: string | null; has: boolean | null; today: string; label: string }) {
  if (!date) {
    return has === false ? (
      <span className="rounded bg-stone-200 px-1.5 py-0.5 text-[11px] text-stone-600">{label}: não tem</span>
    ) : (
      <span className="rounded border border-dashed border-stone-300 px-1.5 py-0.5 text-[11px] text-stone-400">{label}: ?</span>
    );
  }
  const state = expiryState(date, today);
  const cls =
    state === "ok"
      ? "bg-emerald-100 text-emerald-800"
      : state === "expiring"
        ? "bg-amber-100 text-amber-800"
        : "bg-red-100 text-red-700";
  const suffix = state === "expired_recent" || state === "expired_old" ? " (vencido)" : "";
  return (
    <span className={`rounded px-1.5 py-0.5 text-[11px] font-medium ${cls}`}>
      {label}: {dateBR(date)}
      {suffix}
    </span>
  );
}

export function TravelerList({
  travelers,
  contactId,
  opportunityId,
  askVisa,
  today,
}: {
  travelers: TravelerRow[];
  contactId: string;
  opportunityId?: string;
  askVisa: boolean;
  today: string;
}) {
  const [editing, setEditing] = useState<string | "new" | null>(null);
  return (
    <div>
      <ul className="divide-y divide-stone-100">
        {travelers.map((t) =>
          editing === t.id ? (
            <li key={t.id} className="py-3">
              <TravelerForm traveler={t} contactId={contactId} opportunityId={opportunityId} askVisa={askVisa} onDone={() => setEditing(null)} />
            </li>
          ) : (
            <li key={t.id} className="flex flex-wrap items-center gap-2 py-2.5">
              <span className="mr-auto text-sm font-medium">{t.full_name}</span>
              <DocBadge date={t.passport_expires_on} has={t.has_passport} today={today} label="Passaporte" />
              {(askVisa || t.us_visa_expires_on) && <DocBadge date={t.us_visa_expires_on} has={t.has_us_visa} today={today} label="Visto EUA" />}
              <button onClick={() => setEditing(t.id)} className="text-xs text-stone-500 underline-offset-2 hover:underline">
                editar
              </button>
            </li>
          )
        )}
        {travelers.length === 0 && editing !== "new" && <li className="py-3 text-sm text-stone-400">Nenhum viajante cadastrado ainda.</li>}
      </ul>
      {editing === "new" ? (
        <div className="mt-2 rounded-lg border border-stone-200 p-3">
          <TravelerForm contactId={contactId} opportunityId={opportunityId} askVisa={askVisa} onDone={() => setEditing(null)} />
        </div>
      ) : (
        <button onClick={() => setEditing("new")} className="mt-2 text-sm font-medium text-stone-700 hover:text-stone-900">
          + Adicionar viajante
        </button>
      )}
    </div>
  );
}

function TravelerForm({
  traveler,
  contactId,
  opportunityId,
  askVisa,
  onDone,
}: {
  traveler?: TravelerRow;
  contactId: string;
  opportunityId?: string;
  askVisa: boolean;
  onDone: () => void;
}) {
  return (
    <ActionForm
      action={async (prev, fd) => {
        const r = await saveTraveler(prev, fd);
        if (r.ok) onDone();
        return r;
      }}
    >
      {traveler && <input type="hidden" name="id" value={traveler.id} />}
      <input type="hidden" name="contact_id" value={contactId} />
      {opportunityId && <input type="hidden" name="opportunity_id" value={opportunityId} />}
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Nome completo" className="sm:col-span-2">
          <input name="full_name" required defaultValue={traveler?.full_name} className={inputClass} />
        </Field>
        <Field label="Nascimento">
          <input type="date" name="birth_date" defaultValue={traveler?.birth_date ?? ""} className={inputClass} />
        </Field>
        <div />
        <Field label="Vencimento do passaporte">
          <input type="date" name="passport_expires_on" defaultValue={traveler?.passport_expires_on ?? ""} className={inputClass} />
          <span className="mt-1 flex items-center gap-1.5 text-xs text-stone-500">
            <input type="checkbox" name="no_passport" defaultChecked={traveler?.has_passport === false} /> não tem passaporte
          </span>
        </Field>
        {(askVisa || traveler?.us_visa_expires_on) && (
          <Field label="Vencimento do visto americano">
            <input type="date" name="us_visa_expires_on" defaultValue={traveler?.us_visa_expires_on ?? ""} className={inputClass} />
            <span className="mt-1 flex items-center gap-1.5 text-xs text-stone-500">
              <input type="checkbox" name="no_visa" defaultChecked={traveler?.has_us_visa === false} /> não tem visto
            </span>
          </Field>
        )}
      </div>
      <p className="mt-2 text-xs text-stone-400">Só as datas — nada de número de documento (LGPD).</p>
      <button type="button" onClick={onDone} className="mt-2 text-xs text-stone-500 hover:underline">
        cancelar
      </button>
    </ActionForm>
  );
}
