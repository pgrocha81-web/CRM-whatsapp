import { Board, type BoardCard, type BoardStage } from "@/components/board";
import { requireStaff } from "@/lib/auth";
import { brl, budgetText, timeAgo, tripDates } from "@/lib/ui/labels";

export const dynamic = "force-dynamic";

export default async function FunilPage() {
  const { supabase } = await requireStaff();

  const { data: pipeline } = await supabase.from("pipelines").select("id").eq("is_default", true).limit(1).maybeSingle();
  const [{ data: stages }, { data: opps }] = await Promise.all([
    supabase
      .from("pipeline_stages")
      .select("id, name, color, is_won, is_lost")
      .eq("pipeline_id", pipeline?.id ?? "")
      .order("position"),
    supabase
      .from("opportunities")
      .select(
        "id, stage_id, title, destination, travel_date_estimate, travel_return_date, travel_month_text, travelers_count, budget_range, estimated_value_cents, closed_value_cents, tags, lead_temperature, last_activity_at, won_sync_error, quote_url, contact:contacts(name)"
      )
      .eq("pipeline_id", pipeline?.id ?? "")
      .order("last_activity_at", { ascending: false })
      .limit(500),
  ]);

  const now = Date.now();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const cards: BoardCard[] = ((opps ?? []) as any[]).map((o) => {
    const contact = Array.isArray(o.contact) ? o.contact[0] : o.contact;
    const value = o.closed_value_cents ?? o.estimated_value_cents;
    return {
      id: o.id,
      stageId: o.stage_id,
      title: o.title ?? "Oportunidade",
      contactName: contact?.name ?? null,
      destination: o.destination,
      dates: tripDates(o),
      travelers: o.travelers_count,
      budget: budgetText(o.budget_range),
      valueText: value ? brl(value) : null,
      tags: o.tags ?? [],
      temperature: o.lead_temperature,
      lastActivity: o.last_activity_at,
      lastActivityLabel: timeAgo(o.last_activity_at, now),
      syncError: o.won_sync_error,
      hasQuote: !!o.quote_url,
    };
  });

  return (
    <div className="flex h-[calc(100dvh-110px)] flex-col md:h-screen">
      <div className="flex items-baseline gap-3 px-4 pb-3 pt-5 md:px-6">
        <h1 className="text-xl font-semibold tracking-tight">Funil</h1>
        <span className="text-sm text-stone-500">{cards.length} oportunidades</span>
      </div>
      <Board stages={(stages ?? []) as BoardStage[]} cards={cards} />
    </div>
  );
}
