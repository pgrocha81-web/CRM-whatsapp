"use client";

import { useState, useTransition } from "react";
import { changeStage, sendQuote, updateOpportunity, type ActionResult } from "@/app/(dashboard)/actions";
import { ActionButton, ActionForm, Feedback, Field, inputClass } from "./forms";

interface Stage {
  id: string;
  name: string;
  is_won: boolean;
  is_lost: boolean;
}

export function StageSelect({ opportunityId, stages, current }: { opportunityId: string; stages: Stage[]; current: string }) {
  const [value, setValue] = useState(current);
  const [pending, start] = useTransition();
  const [result, setResult] = useState<ActionResult | null>(null);
  return (
    <span className="inline-flex items-center gap-2">
      <select
        value={value}
        disabled={pending}
        onChange={(e) => {
          const next = stages.find((s) => s.id === e.target.value);
          if (!next) return;
          if (next.is_won && !window.confirm("Marcar como VENDA FECHADA? Isso cria o evento no Calendar, o card no Trello e pede os documentos ao cliente.")) return;
          setValue(next.id);
          start(async () => setResult(await changeStage(opportunityId, next.id)));
        }}
        className="rounded-lg border border-stone-300 bg-white px-3 py-1.5 text-sm font-medium"
      >
        {stages.map((s) => (
          <option key={s.id} value={s.id}>
            {s.name}
          </option>
        ))}
      </select>
      {pending ? <span className="text-xs text-stone-500">salvando…</span> : <Feedback state={result} />}
    </span>
  );
}

export interface OpportunityFormValues {
  title: string | null;
  destination: string | null;
  destination_code: string | null;
  origin_city: string | null;
  travel_date_estimate: string | null;
  travel_return_date: string | null;
  travel_month_text: string | null;
  travelers_count: number | null;
  traveler_ages: number[] | null;
  estimated_value_cents: number | null;
  closed_value_cents: number | null;
  lead_temperature: string;
  quote_url: string | null;
  description: string | null;
}

function money(cents: number | null): string {
  return cents == null ? "" : (cents / 100).toLocaleString("pt-BR", { minimumFractionDigits: 2 });
}

export function OpportunityForm({ id, o }: { id: string; o: OpportunityFormValues }) {
  return (
    <ActionForm action={updateOpportunity.bind(null, id)}>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Field label="Título" className="sm:col-span-2">
          <input name="title" defaultValue={o.title ?? ""} className={inputClass} />
        </Field>
        <Field label="Destino">
          <input name="destination" defaultValue={o.destination ?? ""} className={inputClass} />
        </Field>
        <Field label="Tipo de destino">
          <select name="destination_code" defaultValue={o.destination_code ?? ""} className={inputClass}>
            <option value="">—</option>
            <option value="orlando">Orlando / Disney</option>
            <option value="eua">Outros EUA</option>
            <option value="cruzeiro">Cruzeiro</option>
            <option value="europa">Europa</option>
            <option value="outro">Outro</option>
          </select>
        </Field>
        <Field label="Saída de">
          <input name="origin_city" defaultValue={o.origin_city ?? ""} className={inputClass} />
        </Field>
        <Field label="Ida">
          <input type="date" name="travel_date_estimate" defaultValue={o.travel_date_estimate ?? ""} className={inputClass} />
        </Field>
        <Field label="Volta">
          <input type="date" name="travel_return_date" defaultValue={o.travel_return_date ?? ""} className={inputClass} />
        </Field>
        <Field label="Ou só o mês">
          <input name="travel_month_text" placeholder="julho, uns 10 dias" defaultValue={o.travel_month_text ?? ""} className={inputClass} />
        </Field>
        <Field label="Pessoas">
          <input type="number" min={1} max={60} name="travelers_count" defaultValue={o.travelers_count ?? ""} className={inputClass} />
        </Field>
        <Field label="Idades">
          <input name="traveler_ages" placeholder="38, 35, 8" defaultValue={o.traveler_ages?.join(", ") ?? ""} className={inputClass} />
        </Field>
        <Field label="Valor estimado">
          <input name="estimated_value" inputMode="decimal" placeholder="R$" defaultValue={money(o.estimated_value_cents)} className={inputClass} />
        </Field>
        <Field label="Valor fechado">
          <input name="closed_value" inputMode="decimal" placeholder="R$" defaultValue={money(o.closed_value_cents)} className={inputClass} />
        </Field>
        <Field label="Temperatura">
          <select name="lead_temperature" defaultValue={o.lead_temperature} className={inputClass}>
            <option value="undefined">—</option>
            <option value="hot">🔥 Quente</option>
            <option value="warm">Morno</option>
            <option value="cold">Frio</option>
          </select>
        </Field>
        <Field label="Link do orçamento (Infotravel, Hoteldo…)" className="sm:col-span-2 lg:col-span-3">
          <input type="url" name="quote_url" placeholder="https://…" defaultValue={o.quote_url ?? ""} className={inputClass} />
        </Field>
        <Field label="Observações" className="sm:col-span-2 lg:col-span-4">
          <textarea name="description" rows={3} defaultValue={o.description ?? ""} className={inputClass} />
        </Field>
      </div>
    </ActionForm>
  );
}

export function SendQuoteButton({ id, disabled }: { id: string; disabled: boolean }) {
  if (disabled) return <span className="text-xs text-stone-400">Cole o link do orçamento acima e salve para poder enviar.</span>;
  return (
    <ActionButton action={() => sendQuote(id)} className="border-emerald-600 bg-emerald-600 text-white hover:bg-emerald-700">
      Enviar orçamento no WhatsApp
    </ActionButton>
  );
}
