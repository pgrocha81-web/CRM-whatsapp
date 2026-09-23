import Link from "next/link";
import { requireStaff } from "@/lib/auth";
import { timeAgo } from "@/lib/ui/labels";

export const dynamic = "force-dynamic";

export default async function ClientesPage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const { q } = await searchParams;
  const { supabase } = await requireStaff();

  let query = supabase
    .from("contacts")
    .select("id, name, phone, city, last_interaction_at, opportunities(count), travelers(count)")
    .order("last_interaction_at", { ascending: false, nullsFirst: false })
    .limit(200);
  const term = q?.trim();
  if (term) {
    const safe = term.replace(/[%,()]/g, " ");
    query = query.or(`name.ilike.%${safe}%,phone.ilike.%${safe.replace(/\D/g, "") || safe}%,city.ilike.%${safe}%`);
  }
  const { data } = await query;
  const now = Date.now();

  return (
    <div className="mx-auto max-w-4xl px-4 py-5 md:px-8">
      <h1 className="text-xl font-semibold tracking-tight">Clientes</h1>
      <form className="mt-3">
        <input
          name="q"
          defaultValue={term}
          placeholder="Buscar por nome, telefone ou cidade"
          className="w-full rounded-lg border border-stone-300 bg-white px-3 py-2 text-sm outline-none focus:border-stone-900"
        />
      </form>
      <ul className="mt-4 divide-y divide-stone-100 rounded-xl border border-stone-200 bg-white">
        {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
        {((data ?? []) as any[]).map((c) => (
          <li key={c.id}>
            <Link href={`/clientes/${c.id}`} className="flex items-center gap-3 px-4 py-3 hover:bg-stone-50">
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-stone-200 text-sm font-semibold text-stone-600">
                {(c.name ?? "?").slice(0, 1).toUpperCase()}
              </div>
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm font-medium">{c.name ?? "Sem nome"}</div>
                <div className="truncate text-xs text-stone-500">
                  {c.phone}
                  {c.city ? ` · ${c.city}` : ""}
                </div>
              </div>
              <div className="hidden text-right text-xs text-stone-500 sm:block">
                <div>{c.opportunities?.[0]?.count ?? 0} viagens · {c.travelers?.[0]?.count ?? 0} viajantes</div>
                <div className="text-stone-400">{c.last_interaction_at ? `há ${timeAgo(c.last_interaction_at, now)}` : ""}</div>
              </div>
            </Link>
          </li>
        ))}
        {(data ?? []).length === 0 && <li className="px-4 py-10 text-center text-sm text-stone-400">Nenhum cliente encontrado.</li>}
      </ul>
    </div>
  );
}
