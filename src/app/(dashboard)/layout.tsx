import { requireStaff } from "@/lib/auth";
import { NavLinks } from "@/components/nav-links";

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const { supabase, profile } = await requireStaff();

  const [{ count: unread }, { count: tasks }] = await Promise.all([
    supabase.from("conversations").select("id", { count: "exact", head: true }).gt("unread_count", 0).neq("status", "closed"),
    supabase.from("tasks").select("id", { count: "exact", head: true }).in("status", ["pending", "in_progress"]),
  ]);

  return (
    <div className="flex min-h-screen flex-col bg-stone-50 md:flex-row">
      <aside className="flex shrink-0 items-center justify-between border-b border-stone-200 bg-white px-4 py-3 md:sticky md:top-0 md:h-screen md:w-56 md:flex-col md:items-stretch md:justify-start md:border-b-0 md:border-r md:px-3 md:py-5">
        <div className="flex items-center gap-2 md:mb-6 md:px-2">
          <span className="text-2xl">🐨</span>
          <div className="leading-tight">
            <div className="text-sm font-semibold tracking-tight">Koala Turismo</div>
            <div className="hidden text-xs text-stone-500 md:block">Central comercial</div>
          </div>
        </div>
        <NavLinks badges={{ inbox: unread ?? 0, tarefas: tasks ?? 0 }} />
        <div className="hidden md:mt-auto md:block md:px-2">
          <div className="truncate text-sm font-medium">{profile.full_name}</div>
          <form action="/auth/signout" method="post">
            <button className="text-xs text-stone-500 hover:text-stone-900">Sair</button>
          </form>
        </div>
      </aside>
      <main className="min-w-0 flex-1 pb-20 md:pb-0">{children}</main>
    </div>
  );
}
