/** Rótulos e formatação usados nas telas. */
import { BUDGETS, PAYMENTS } from "../bot/qualificacao";

export function brl(cents: number | null | undefined): string {
  if (cents == null) return "—";
  return (cents / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

/** yyyy-mm-dd → dd/mm/aaaa (sem passar por Date, evita erro de fuso) */
export function dateBR(iso: string | null | undefined): string {
  if (!iso) return "—";
  const [y, m, d] = iso.slice(0, 10).split("-");
  return `${d}/${m}/${y}`;
}

export function dateTimeBR(iso: string | null | undefined): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("pt-BR", {
    timeZone: "America/Sao_Paulo",
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function timeAgo(iso: string | null | undefined, now = Date.now()): string {
  if (!iso) return "";
  const min = Math.round((now - new Date(iso).getTime()) / 60000);
  if (min < 1) return "agora";
  if (min < 60) return `${min} min`;
  const h = Math.round(min / 60);
  if (h < 24) return `${h} h`;
  const d = Math.round(h / 24);
  return `${d} d`;
}

export function budgetText(id: string | null | undefined): string | null {
  return BUDGETS.find((b) => b.id === id)?.title ?? null;
}

export function paymentText(id: string | null | undefined): string | null {
  return PAYMENTS.find((p) => p.id === id)?.title ?? null;
}

export function tripDates(o: {
  travel_date_estimate: string | null;
  travel_return_date: string | null;
  travel_month_text?: string | null;
}): string {
  if (o.travel_date_estimate && o.travel_return_date) {
    return `${dateBR(o.travel_date_estimate).slice(0, 5)} → ${dateBR(o.travel_return_date)}`;
  }
  if (o.travel_date_estimate) return `ida ${dateBR(o.travel_date_estimate)}`;
  return o.travel_month_text ?? "datas a definir";
}

/** Dias entre hoje (SP) e uma data ISO. Negativo = já passou. */
export function daysUntil(iso: string, today: string): number {
  const a = Date.UTC(+today.slice(0, 4), +today.slice(5, 7) - 1, +today.slice(8, 10));
  const b = Date.UTC(+iso.slice(0, 4), +iso.slice(5, 7) - 1, +iso.slice(8, 10));
  return Math.round((b - a) / 86400000);
}

export const TEMPERATURE: Record<string, { label: string; className: string }> = {
  hot: { label: "Quente", className: "bg-red-100 text-red-700" },
  warm: { label: "Morno", className: "bg-amber-100 text-amber-700" },
  cold: { label: "Frio", className: "bg-sky-100 text-sky-700" },
};

export const CONVERSATION_STATUS: Record<string, { label: string; className: string }> = {
  open: { label: "Aberta", className: "bg-emerald-100 text-emerald-700" },
  pending_human: { label: "Equipe", className: "bg-amber-100 text-amber-800" },
  waiting_customer: { label: "Aguardando cliente", className: "bg-stone-100 text-stone-600" },
  closed: { label: "Encerrada", className: "bg-stone-100 text-stone-500" },
};
