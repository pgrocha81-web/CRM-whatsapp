import { AutoRefresh } from "@/components/auto-refresh";
import { ConversationList, type ConversationItem } from "@/components/conversation-list";
import { requireStaff } from "@/lib/auth";
import { timeAgo } from "@/lib/ui/labels";

export const dynamic = "force-dynamic";

export default async function InboxLayout({ children }: { children: React.ReactNode }) {
  const { supabase } = await requireStaff();
  const { data } = await supabase
    .from("conversations")
    .select(
      "id, status, unread_count, human_handoff_required, updated_at, last_customer_message_at, contact:contacts(name, phone), bot_sessions(status), messages(content, created_at, direction)"
    )
    .neq("status", "closed")
    .order("updated_at", { ascending: false })
    .order("created_at", { referencedTable: "messages", ascending: false })
    .limit(1, { referencedTable: "messages" })
    .limit(200);

  const now = Date.now();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const items: ConversationItem[] = ((data ?? []) as any[]).map((c) => {
    const contact = Array.isArray(c.contact) ? c.contact[0] : c.contact;
    const last = c.messages?.[0];
    return {
      id: c.id,
      name: contact?.name ?? contact?.phone ?? "Sem nome",
      preview: last ? `${last.direction === "outbound" ? "Você: " : ""}${(last.content ?? "").split("\n")[0]}` : "",
      when: timeAgo(last?.created_at ?? c.updated_at, now),
      unread: c.unread_count ?? 0,
      status: c.status,
      botActive: (c.bot_sessions ?? []).some((s: { status: string }) => s.status === "active"),
      handoff: c.human_handoff_required,
    };
  });

  return (
    <div className="flex h-[calc(100dvh-110px)] md:h-screen">
      <AutoRefresh />
      <ConversationList items={items} />
      <div className="flex min-w-0 flex-1 flex-col">{children}</div>
    </div>
  );
}
