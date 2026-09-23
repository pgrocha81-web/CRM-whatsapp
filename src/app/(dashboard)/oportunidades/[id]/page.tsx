import Link from "next/link";
import { notFound } from "next/navigation";
import { OpportunityForm, SendQuoteButton, StageSelect } from "@/components/opportunity-client";
import { TravelerList, type TravelerRow } from "@/components/travelers";
import { requireStaff } from "@/lib/auth";
import { todayISO } from "@/lib/bot/parse";
import { budgetText, dateTimeBR, paymentText } from "@/lib/ui/labels";

export const dynamic = "force-dynamic";

export default async function OpportunityPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { supabase } = await requireStaff();

  const { data: o } = await supabase
    .from("opportunities")
    .select(
      "*, contact:contacts(id, name, phone, whatsapp_id, city), stage:pipeline_stages(id, name, is_won), opportunity_travelers(traveler:travelers(id, full_name, birth_date, passport_expires_on, has_passport, us_visa_expires_on, has_us_visa))"
    )
    .eq("id", id)
    .maybeSingle();
  if (!o) notFound();

  const contact = Array.isArray(o.contact) ? o.contact[0] : o.contact;
  const [{ data: stages }, { data: history }, { data: conv }, { data: tasks }] = await Promise.all([
    supabase.from("pipeline_stages").select("id, name, is_won, is_lost").eq("pipeline_id", o.pipeline_id).order("position"),
    supabase.from("activities").select("id, description, created_at, activity_type").eq("opportunity_id", id).order("created_at", { ascending: false }).limit(30),
    supabase.from("conversations").select("id").eq("contact_id", contact?.id ?? "").order("created_at", { ascending: false }).limit(1).maybeSingle(),
    supabase.from("tasks").select("id, description, priority, status, due_date").eq("opportunity_id", id).in("status", ["pending", "in_progress"]),
  ]);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const travelers: TravelerRow[] = ((o.opportunity_travelers ?? []) as any[]).map((l) => l.traveler).filter(Boolean);
  const askVisa = o.destination_code === "orlando" || o.destination_code === "eua";
  const today = todayISO(new Date());

  return (
    <div className="mx-auto max-w-5xl px-4 py-5 md:px-8">
      <Link href="/funil" className="text-sm text-stone-500 hover:text-stone-900">
        ← Funil
      </Link>

      <header className="mt-3 flex flex-wrap items-start gap-3">
        <div className="mr-auto min-w-0">
          <h1 className="truncate text-2xl font-semibold tracking-tight">{contact?.name ?? "Sem nome"}</h1>
          <p className="text-sm text-stone-500">
            {contact?.phone}
            {contact?.city ? ` · ${contact.city}` : ""}
          </p>
          <div className="mt-2 flex flex-wrap gap-2 text-sm">
            {contact && (
              <Link href={`/clientes/${contact.id}`} className="rounded-lg border border-stone-300 bg-white px-3 py-1.5 hover:bg-stone-100">
                Ficha do cliente
              </Link>
            )}
            {conv && (
              <Link href={`/inbox/${conv.id}`} className="rounded-lg border border-stone-300 bg-white px-3 py-1.5 hover:bg-stone-100">
                💬 Conversa
              </Link>
            )}
          </div>
        </div>
        <StageSelect opportunityId={id} stages={stages ?? []} current={o.stage_id} />
      </header>

      {o.won_sync_error && (
        <p className="mt-4 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-800">⚠ Integrações da venda: {o.won_sync_error}</p>
      )}

      {(o.budget_range || o.payment_preference || o.us_visa_status || o.rundisney_race) && (
        <section className="mt-5 flex flex-wrap gap-2 text-sm">
          {o.budget_range && <Chip label="Orçamento informado" value={budgetText(o.budget_range) ?? o.budget_range} />}
          {o.payment_preference && <Chip label="Pagamento" value={paymentText(o.payment_preference) ?? o.payment_preference} />}
          {o.us_visa_status && <Chip label="Visto EUA" value={{ all: "todos têm", some: "alguns têm", none: "ninguém tem" }[o.us_visa_status as string] ?? ""} />}
          {o.rundisney_race && <Chip label="runDisney" value={o.rundisney_race} />}
          {(o.tags ?? []).map((t: string) => (
            <span key={t} className="rounded-full bg-violet-100 px-3 py-1 text-xs font-semibold uppercase text-violet-700">
              {t}
            </span>
          ))}
        </section>
      )}

      <section className="mt-5 rounded-xl border border-stone-200 bg-white p-4 md:p-5">
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-stone-500">Viagem</h2>
        <OpportunityForm
          id={id}
          o={{
            title: o.title,
            destination: o.destination,
            destination_code: o.destination_code,
            origin_city: o.origin_city,
            travel_date_estimate: o.travel_date_estimate,
            travel_return_date: o.travel_return_date,
            travel_month_text: o.travel_month_text,
            travelers_count: o.travelers_count,
            traveler_ages: o.traveler_ages,
            estimated_value_cents: o.estimated_value_cents,
            closed_value_cents: o.closed_value_cents,
            lead_temperature: o.lead_temperature,
            quote_url: o.quote_url,
            description: o.description,
          }}
        />
        <div className="mt-4 flex flex-wrap items-center gap-3 border-t border-stone-100 pt-4">
          <SendQuoteButton id={id} disabled={!o.quote_url} />
          {o.quote_url && (
            <a href={o.quote_url} target="_blank" rel="noreferrer" className="text-sm text-stone-600 underline-offset-2 hover:underline">
              abrir orçamento ↗
            </a>
          )}
          {o.quote_sent_at && <span className="text-xs text-stone-500">enviado em {dateTimeBR(o.quote_sent_at)}</span>}
        </div>
      </section>

      <div className="mt-5 grid gap-5 lg:grid-cols-2">
        <section className="rounded-xl border border-stone-200 bg-white p-4 md:p-5">
          <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-stone-500">Viajantes e documentos</h2>
          {contact && <TravelerList travelers={travelers} contactId={contact.id} opportunityId={id} askVisa={askVisa} today={today} />}
        </section>

        <section className="rounded-xl border border-stone-200 bg-white p-4 md:p-5">
          <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-stone-500">Tarefas abertas</h2>
          <ul className="space-y-1.5 text-sm">
            {(tasks ?? []).map((t) => (
              <li key={t.id} className="flex gap-2">
                <span>{t.priority === "urgent" ? "🔴" : t.priority === "high" ? "🟡" : "•"}</span>
                <span>{t.description}</span>
              </li>
            ))}
            {(tasks ?? []).length === 0 && <li className="text-stone-400">Nada pendente.</li>}
          </ul>
          <h2 className="mb-2 mt-5 text-sm font-semibold uppercase tracking-wide text-stone-500">Histórico</h2>
          <ol className="space-y-1.5 text-sm">
            {(history ?? []).map((h) => (
              <li key={h.id} className="flex gap-3">
                <span className="w-24 shrink-0 text-xs tabular-nums text-stone-400">{dateTimeBR(h.created_at)}</span>
                <span className="text-stone-700">{h.description}</span>
              </li>
            ))}
          </ol>
        </section>
      </div>
    </div>
  );
}

function Chip({ label, value }: { label: string; value: string }) {
  return (
    <span className="rounded-full border border-stone-200 bg-white px-3 py-1 text-xs">
      <span className="text-stone-500">{label}:</span> <span className="font-medium">{value}</span>
    </span>
  );
}
