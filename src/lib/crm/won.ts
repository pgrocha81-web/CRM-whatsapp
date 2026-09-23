/**
 * VENDA FECHADA → Google Calendar + Trello + pedido de documentos ao cliente.
 * Idempotente: IDs do evento/card ficam salvos na oportunidade; rodar de novo
 * só cria o que faltou (a rotina de hora em hora re-tenta falhas).
 */
import { formatBR, todayISO } from "../bot/parse";
import { budgetLabel, isUSDestination, PAYMENTS } from "../bot/qualificacao";
import type { BudgetRange, DestinationCode, PaymentPreference } from "../bot/types";
import { createTripEvent, isGoogleCalendarConfigured } from "../integrations/google-calendar";
import { createTrelloCard, isTrelloConfigured } from "../integrations/trello";
import { isInsideCustomerWindow } from "../whatsapp/send";
import { getActiveSession, startDocumentsSession } from "./bot-runner";
import { createTask, latestConversation, type DB } from "./db";

export interface WonOpportunity {
  id: string;
  title: string | null;
  destination: string | null;
  destination_code: DestinationCode | null;
  origin_city: string | null;
  travel_date_estimate: string | null;
  travel_return_date: string | null;
  travel_date_confidence: string | null;
  travel_month_text: string | null;
  travelers_count: number | null;
  traveler_ages: number[] | null;
  us_visa_status: string | null;
  budget_range: BudgetRange | null;
  payment_preference: PaymentPreference | null;
  rundisney_race: string | null;
  closed_value_cents: number | null;
  google_calendar_event_id: string | null;
  trello_card_id: string | null;
  contact: { id: string; name: string | null; phone: string; whatsapp_id: string | null } | null;
}

const SELECT =
  "id, title, destination, destination_code, origin_city, travel_date_estimate, travel_return_date, travel_date_confidence, travel_month_text, travelers_count, traveler_ages, us_visa_status, budget_range, payment_preference, rundisney_race, closed_value_cents, google_calendar_event_id, trello_card_id, contact:contacts(id, name, phone, whatsapp_id)";

const VISA_LABEL: Record<string, string> = { all: "todos têm", some: "alguns têm", none: "ninguém tem" };

/** Texto usado na descrição do evento e do card. */
export function tripSummary(o: WonOpportunity, appUrl?: string | null): { title: string; description: string } {
  const name = o.contact?.name ?? "Cliente";
  const title = `✈️ ${name} — ${o.destination ?? "Viagem"}`;
  const dates =
    o.travel_date_estimate && o.travel_return_date
      ? `${formatBR(o.travel_date_estimate)} a ${formatBR(o.travel_return_date)}`
      : o.travel_date_estimate
        ? `ida ${formatBR(o.travel_date_estimate)}`
        : (o.travel_month_text ?? "a definir");
  const lines = [
    `Cliente: ${name}`,
    `WhatsApp: ${o.contact?.phone ?? "-"}`,
    `Destino: ${o.destination ?? "-"}`,
    `Saída de: ${o.origin_city ?? "-"}`,
    `Datas: ${dates}`,
    `Viajantes: ${o.travelers_count ?? "-"}${o.traveler_ages?.length ? ` (idades: ${o.traveler_ages.join(", ")})` : ""}`,
  ];
  if (o.us_visa_status) lines.push(`Visto americano: ${VISA_LABEL[o.us_visa_status] ?? o.us_visa_status}`);
  if (o.rundisney_race) lines.push(`Prova runDisney: ${o.rundisney_race}`);
  if (o.closed_value_cents) {
    lines.push(`Valor fechado: ${(o.closed_value_cents / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}`);
  } else if (o.budget_range) {
    lines.push(`Orçamento informado: ${budgetLabel(o.budget_range)}`);
  }
  if (o.payment_preference) {
    lines.push(`Pagamento: ${PAYMENTS.find((p) => p.id === o.payment_preference)?.title ?? o.payment_preference}`);
  }
  if (appUrl) lines.push("", `CRM: ${appUrl.replace(/\/$/, "")}/oportunidades/${o.id}`);
  return { title, description: lines.join("\n") };
}

export async function handleOpportunityWon(
  sb: DB,
  opportunityId: string,
  options: { requestDocuments?: boolean } = {}
): Promise<{ errors: string[] }> {
  const { data, error } = await sb.from("opportunities").select(SELECT).eq("id", opportunityId).single();
  if (error || !data) throw new Error(`Oportunidade não encontrada: ${opportunityId}`);
  const raw = data as unknown as WonOpportunity & { contact: WonOpportunity["contact"] | WonOpportunity["contact"][] };
  const o: WonOpportunity = { ...raw, contact: Array.isArray(raw.contact) ? (raw.contact[0] ?? null) : raw.contact };

  const errors: string[] = [];
  const summary = tripSummary(o, process.env.NEXT_PUBLIC_APP_URL);
  const update: Record<string, unknown> = {};

  // ---------- Google Calendar ----------
  if (!o.google_calendar_event_id) {
    if (!isGoogleCalendarConfigured()) {
      errors.push("Google Calendar não configurado");
    } else if (!o.travel_date_estimate) {
      errors.push("Sem data de ida — evento no Google Calendar não criado");
    } else {
      try {
        update.google_calendar_event_id = await createTripEvent({
          title: summary.title,
          description: summary.description,
          startDate: o.travel_date_estimate,
          endDate: o.travel_return_date,
        });
      } catch (err) {
        errors.push(err instanceof Error ? err.message : String(err));
      }
    }
  }

  // ---------- Trello ----------
  if (!o.trello_card_id) {
    if (!isTrelloConfigured()) {
      errors.push("Trello não configurado");
    } else {
      try {
        update.trello_card_id = await createTrelloCard({
          name: summary.title,
          description: summary.description,
          dueDate: o.travel_date_estimate,
        });
      } catch (err) {
        errors.push(err instanceof Error ? err.message : String(err));
      }
    }
  }

  update.won_sync_error = errors.length ? errors.join(" | ").slice(0, 1000) : null;
  await sb.from("opportunities").update(update).eq("id", o.id);

  // ---------- Documentos dos viajantes ----------
  if (options.requestDocuments !== false) await requestTravelerDocuments(sb, o);

  return { errors };
}

async function requestTravelerDocuments(sb: DB, o: WonOpportunity) {
  if (!o.contact?.whatsapp_id) return;
  const { count } = await sb
    .from("opportunity_travelers")
    .select("traveler_id", { count: "exact", head: true })
    .eq("opportunity_id", o.id);
  if ((count ?? 0) > 0) return; // já tem viajantes cadastrados

  const conversation = await latestConversation(sb, o.contact.id);
  const canMessage = conversation && isInsideCustomerWindow(conversation.last_customer_message_at);
  const busy = conversation ? await getActiveSession(sb, conversation.id) : null;

  if (conversation && canMessage && !busy) {
    await startDocumentsSession(sb, {
      conversationId: conversation.id,
      opportunityId: o.id,
      to: o.contact.whatsapp_id,
      travelersCount: o.travelers_count ?? 1,
      askUSVisa: isUSDestination(o.destination_code ?? undefined),
    });
    return;
  }
  // fora da janela de 24h do WhatsApp o bot não pode puxar conversa livre
  await createTask(sb, {
    description:
      "Pedir ao cliente as datas de vencimento do passaporte" +
      (isUSDestination(o.destination_code ?? undefined) ? " e do visto americano" : "") +
      " de cada viajante (ou cadastrar direto no CRM)",
    contactId: o.contact.id,
    opportunityId: o.id,
    priority: "normal",
    dueDate: todayISO(new Date()),
  });
}
