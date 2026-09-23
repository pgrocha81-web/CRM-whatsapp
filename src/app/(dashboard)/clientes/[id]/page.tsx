import Link from "next/link";
import { notFound } from "next/navigation";
import { TravelerList, type TravelerRow } from "@/components/travelers";
import { requireStaff } from "@/lib/auth";
import { todayISO } from "@/lib/bot/parse";
import { brl, dateTimeBR, tripDates } from "@/lib/ui/labels";

export const dynamic = "force-dynamic";

export default async function ClientePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { supabase } = await requireStaff();

  const { data: c } = await supabase
    .from("contacts")
    .select("id, name, phone, email, city, lead_source, first_seen_at, notes")
    .eq("id", id)
    .maybeSingle();
  if (!c) notFound();

  const [{ data: opps }, { data: travelers }, { data: conv }, { data: activities }] = await Promise.all([
    supabase
      .from("opportunities")
      .select("id, title, destination, destination_code, travel_date_estimate, travel_return_date, travel_month_text, closed_value_cents, estimated_value_cents, stage:pipeline_stages(name, is_won, is_lost)")
      .eq("contact_id", id)
      .order("created_at", { ascending: false }),
    supabase
      .from("travelers")
      .select("id, full_name, birth_date, passport_expires_on, has_passport, us_visa_expires_on, has_us_visa")
      .eq("contact_id", id)
      .order("full_name"),
    supabase.from("conversations").select("id").eq("contact_id", id).order("created_at", { ascending: false }).limit(1).maybeSingle(),
    supabase.from("activities").select("id, description, created_at").eq("contact_id", id).order("created_at", { ascending: false }).limit(20),
  ]);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const anyUS = ((opps ?? []) as any[]).some((o) => o.destination_code === "orlando" || o.destination_code === "eua");

  return (
    <div className="mx-auto max-w-5xl px-4 py-5 md:px-8">
      <Link href="/clientes" className="text-sm text-stone-500 hover:text-stone-900">
        ← Clientes
      </Link>
      <header className="mt-3 flex flex-wrap items-start gap-3">
        <div className="mr-auto">
          <h1 className="text-2xl font-semibold tracking-tight">{c.name ?? "Sem nome"}</h1>
          <p className="text-sm text-stone-500">
            {c.phone}
            {c.email ? ` · ${c.email}` : ""}
            {c.city ? ` · ${c.city}` : ""}
          </p>
          <p className="mt-1 text-xs text-stone-400">
            Cliente desde {new Date(c.first_seen_at).toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" })} · origem: {c.lead_source ?? "—"}
          </p>
        </div>
        {conv && (
          <Link href={`/inbox/${conv.id}`} className="rounded-lg border border-stone-300 bg-white px-3 py-1.5 text-sm hover:bg-stone-100">
            💬 Conversa
          </Link>
        )}
      </header>

      <div className="mt-5 grid gap-5 lg:grid-cols-2">
        <section className="rounded-xl border border-stone-200 bg-white p-4 md:p-5">
          <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-stone-500">Viagens</h2>
          <ul className="divide-y divide-stone-100">
            {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
            {((opps ?? []) as any[]).map((o) => {
              const stage = Array.isArray(o.stage) ? o.stage[0] : o.stage;
              return (
                <li key={o.id}>
                  <Link href={`/oportunidades/${o.id}`} className="flex items-center gap-3 py-2.5 hover:bg-stone-50">
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-sm font-medium">{o.destination ?? o.title}</div>
                      <div className="text-xs text-stone-500">{tripDates(o)}</div>
                    </div>
                    <div className="text-right">
                      <span
                        className={`rounded px-1.5 py-0.5 text-[10px] font-semibold ${
                          stage?.is_won ? "bg-emerald-100 text-emerald-800" : stage?.is_lost ? "bg-stone-100 text-stone-500" : "bg-sky-100 text-sky-800"
                        }`}
                      >
                        {stage?.name}
                      </span>
                      <div className="mt-0.5 text-xs text-stone-500">{brl(o.closed_value_cents ?? o.estimated_value_cents)}</div>
                    </div>
                  </Link>
                </li>
              );
            })}
            {(opps ?? []).length === 0 && <li className="py-3 text-sm text-stone-400">Nenhuma viagem.</li>}
          </ul>
        </section>

        <section className="rounded-xl border border-stone-200 bg-white p-4 md:p-5">
          <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-stone-500">Viajantes e documentos</h2>
          <TravelerList travelers={(travelers ?? []) as TravelerRow[]} contactId={id} askVisa={anyUS} today={todayISO(new Date())} />
        </section>
      </div>

      <section className="mt-5 rounded-xl border border-stone-200 bg-white p-4 md:p-5">
        <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-stone-500">Histórico</h2>
        <ol className="space-y-1.5 text-sm">
          {(activities ?? []).map((a) => (
            <li key={a.id} className="flex gap-3">
              <span className="w-24 shrink-0 text-xs tabular-nums text-stone-400">{dateTimeBR(a.created_at)}</span>
              <span className="text-stone-700">{a.description}</span>
            </li>
          ))}
        </ol>
      </section>
    </div>
  );
}
