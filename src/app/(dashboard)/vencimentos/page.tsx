import Link from "next/link";
import { requireStaff } from "@/lib/auth";
import { addMonthsISO, todayISO } from "@/lib/bot/parse";
import { dateBR, daysUntil } from "@/lib/ui/labels";

export const dynamic = "force-dynamic";

interface Row {
  traveler_id: string;
  contact_id: string;
  full_name: string;
  document: "passport" | "us_visa";
  expires_on: string;
}

export default async function VencimentosPage() {
  const { supabase } = await requireStaff();
  const today = todayISO(new Date());
  const limit = addMonthsISO(today, 12);

  const { data } = await supabase
    .from("document_expirations")
    .select("traveler_id, contact_id, full_name, document, expires_on")
    .lte("expires_on", limit)
    .gte("expires_on", addMonthsISO(today, -6))
    .order("expires_on");

  const { data: contacts } = await supabase
    .from("contacts")
    .select("id, name")
    .in("id", [...new Set((data ?? []).map((r) => r.contact_id))]);
  const contactName = new Map((contacts ?? []).map((c) => [c.id, c.name]));

  const rows = (data ?? []) as Row[];
  const groups: Array<{ title: string; hint: string; tone: string; rows: Row[] }> = [
    { title: "Vencidos", hint: "nos últimos 6 meses", tone: "text-red-700", rows: rows.filter((r) => r.expires_on < today) },
    { title: "Vencem em até 6 meses", hint: "cliente recebe aviso automático", tone: "text-amber-700", rows: rows.filter((r) => r.expires_on >= today && r.expires_on <= addMonthsISO(today, 6)) },
    { title: "De 6 a 12 meses", hint: "para planejar", tone: "text-stone-700", rows: rows.filter((r) => r.expires_on > addMonthsISO(today, 6)) },
  ];

  return (
    <div className="mx-auto max-w-3xl px-4 py-5 md:px-8">
      <h1 className="text-xl font-semibold tracking-tight">Vencimentos</h1>
      <p className="mt-1 text-sm text-stone-500">Passaportes e vistos americanos dos viajantes cadastrados.</p>

      {groups.map((g) => (
        <section key={g.title} className="mt-5">
          <h2 className={`text-sm font-semibold ${g.tone}`}>
            {g.title} <span className="font-normal text-stone-400">· {g.rows.length} · {g.hint}</span>
          </h2>
          <ul className="mt-2 divide-y divide-stone-100 rounded-xl border border-stone-200 bg-white">
            {g.rows.map((r) => {
              const d = daysUntil(r.expires_on, today);
              return (
                <li key={`${r.traveler_id}-${r.document}`}>
                  <Link href={`/clientes/${r.contact_id}`} className="flex items-center gap-3 px-4 py-2.5 hover:bg-stone-50">
                    <span className="w-6 text-center">{r.document === "passport" ? "🛂" : "🇺🇸"}</span>
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-sm font-medium">{r.full_name}</div>
                      <div className="truncate text-xs text-stone-500">
                        {r.document === "passport" ? "Passaporte" : "Visto americano"} · cliente: {contactName.get(r.contact_id) ?? "—"}
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="text-sm tabular-nums">{dateBR(r.expires_on)}</div>
                      <div className={`text-xs ${d < 0 ? "text-red-600" : d <= 183 ? "text-amber-700" : "text-stone-500"}`}>
                        {d < 0 ? `há ${-d} dias` : d === 0 ? "hoje" : `em ${d} dias`}
                      </div>
                    </div>
                  </Link>
                </li>
              );
            })}
            {g.rows.length === 0 && <li className="px-4 py-4 text-sm text-stone-400">Nenhum.</li>}
          </ul>
        </section>
      ))}
    </div>
  );
}
