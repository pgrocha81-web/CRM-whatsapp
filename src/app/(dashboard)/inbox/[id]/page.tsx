import { notFound } from "next/navigation";
import { ConversationView, type MessageItem } from "@/components/conversation-view";
import { requireStaff } from "@/lib/auth";
import { dateTimeBR } from "@/lib/ui/labels";
import { isInsideCustomerWindow } from "@/lib/whatsapp/send";

export const dynamic = "force-dynamic";

export default async function ConversationPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { supabase } = await requireStaff();

  const { data: conv } = await supabase
    .from("conversations")
    .select("id, status, unread_count, last_customer_message_at, current_opportunity_id, contact:contacts(name, phone), bot_sessions(status)")
    .eq("id", id)
    .maybeSingle();
  if (!conv) notFound();

  const { data: msgs } = await supabase
    .from("messages")
    .select("id, direction, sender_type, content, message_type, status, failure_reason, created_at")
    .eq("conversation_id", id)
    .order("created_at", { ascending: true })
    .limit(500);

  const contact = Array.isArray(conv.contact) ? conv.contact[0] : conv.contact;
  const messages: MessageItem[] = (msgs ?? []).map((m) => ({
    id: m.id,
    direction: m.direction,
    senderType: m.sender_type,
    content: m.content,
    messageType: m.message_type,
    status: m.status,
    failure: m.failure_reason,
    time: dateTimeBR(m.created_at),
  }));

  return (
    <ConversationView
      conversationId={id}
      name={contact?.name ?? contact?.phone ?? "Sem nome"}
      phone={contact?.phone ?? ""}
      status={conv.status}
      botActive={(conv.bot_sessions ?? []).some((s: { status: string }) => s.status === "active")}
      insideWindow={isInsideCustomerWindow(conv.last_customer_message_at)}
      unread={conv.unread_count ?? 0}
      messages={messages}
      opportunityHref={conv.current_opportunity_id ? `/oportunidades/${conv.current_opportunity_id}` : null}
    />
  );
}
