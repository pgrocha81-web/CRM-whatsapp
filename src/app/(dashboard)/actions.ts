"use server";

import { revalidatePath } from "next/cache";
import { requireStaff } from "@/lib/auth";
import { getStageByName, moveOpportunityStage, sendAndLog, STAGES } from "@/lib/crm/db";
import { changeStageAsStaff } from "@/lib/crm/stage-change";
import { checkOpportunityDocuments } from "@/lib/crm/bot-runner";
import { createSupabaseServiceClient } from "@/lib/supabase/server";
import { isInsideCustomerWindow, sendMessage } from "@/lib/whatsapp/send";

export type ActionResult = { ok: true; message?: string } | { ok: false; error: string };

function str(fd: FormData, key: string): string | null {
  const v = fd.get(key);
  if (typeof v !== "string") return null;
  const t = v.trim();
  return t === "" ? null : t;
}

function int(fd: FormData, key: string): number | null {
  const v = str(fd, key);
  if (v === null) return null;
  const n = Number(v);
  return Number.isFinite(n) ? Math.round(n) : null;
}

/** "R$ 42.500,00" → 4250000 */
function money(fd: FormData, key: string): number | null {
  const v = str(fd, key);
  if (v === null) return null;
  const clean = v.replace(/[^\d,]/g, "").replace(",", ".");
  const n = Number(clean);
  return clean && Number.isFinite(n) ? Math.round(n * 100) : null;
}

// ------------------------------------------------------------
// Oportunidade
// ------------------------------------------------------------
export async function updateOpportunity(id: string, _prev: ActionResult | null, fd: FormData): Promise<ActionResult> {
  const { supabase } = await requireStaff();
  const agesText = str(fd, "traveler_ages");
  const ages = agesText ? (agesText.match(/\d+/g) ?? []).map(Number).filter((n) => n <= 120) : null;
  const ida = str(fd, "travel_date_estimate");
  const volta = str(fd, "travel_return_date");
  if (ida && volta && volta < ida) return { ok: false, error: "A volta precisa ser depois da ida." };

  const { error } = await supabase
    .from("opportunities")
    .update({
      title: str(fd, "title"),
      destination: str(fd, "destination"),
      destination_code: str(fd, "destination_code"),
      origin_city: str(fd, "origin_city"),
      travel_date_estimate: ida,
      travel_return_date: volta,
      travel_date_confidence: ida ? "exact" : str(fd, "travel_month_text") ? "approximate" : "unknown",
      travel_month_text: str(fd, "travel_month_text"),
      travelers_count: int(fd, "travelers_count"),
      traveler_ages: ages,
      estimated_value_cents: money(fd, "estimated_value"),
      closed_value_cents: money(fd, "closed_value"),
      lead_temperature: str(fd, "lead_temperature") ?? "undefined",
      quote_url: str(fd, "quote_url"),
      description: str(fd, "description"),
      last_activity_at: new Date().toISOString(),
    })
    .eq("id", id);
  if (error) return { ok: false, error: error.message };
  await checkOpportunityDocuments(createSupabaseServiceClient(), id);
  revalidatePath(`/oportunidades/${id}`);
  return { ok: true, message: "Salvo ✓" };
}

export async function changeStage(id: string, stageId: string): Promise<ActionResult> {
  const { user } = await requireStaff();
  const { integrations } = await changeStageAsStaff(createSupabaseServiceClient(), {
    opportunityId: id,
    stageId,
    actorId: user.id,
  });
  revalidatePath(`/oportunidades/${id}`);
  revalidatePath("/funil");
  const errs = integrations?.errors.filter((e) => !e.includes("não configurado")) ?? [];
  return errs.length ? { ok: true, message: `Venda registrada, mas: ${errs.join(" · ")}` } : { ok: true };
}

/** Manda o link do orçamento pelo WhatsApp e move o card para ORÇAMENTO ENVIADO. */
export async function sendQuote(id: string): Promise<ActionResult> {
  const { user } = await requireStaff();
  const sb = createSupabaseServiceClient();
  const { data: opp } = await sb
    .from("opportunities")
    .select("id, quote_url, contact:contacts(id, name, whatsapp_id)")
    .eq("id", id)
    .single();
  const contact = Array.isArray(opp?.contact) ? opp?.contact[0] : opp?.contact;
  if (!opp?.quote_url) return { ok: false, error: "Cole o link do orçamento e salve antes de enviar." };
  if (!contact?.whatsapp_id) return { ok: false, error: "Este cliente não tem WhatsApp vinculado." };

  const { data: conv } = await sb
    .from("conversations")
    .select("id, last_customer_message_at")
    .eq("contact_id", contact.id)
    .neq("status", "closed")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!conv || !isInsideCustomerWindow(conv.last_customer_message_at)) {
    return { ok: false, error: "O cliente não fala há mais de 24h — o WhatsApp só permite modelo aprovado. Mande o link manualmente." };
  }
  const nome = (contact.name ?? "").split(" ")[0];
  const result = await sendAndLog(sb, {
    conversationId: conv.id,
    to: contact.whatsapp_id,
    message: { type: "text", body: `${nome ? `${nome}, ` : ""}seu orçamento está pronto! ✈️🐨\n${opp.quote_url}\n\nQualquer dúvida é só me chamar por aqui.` },
  });
  if (!result.ok) return { ok: false, error: `WhatsApp: ${result.error}` };

  await sb.from("opportunities").update({ quote_sent_at: new Date().toISOString() }).eq("id", id);
  const stage = await getStageByName(sb, STAGES.ORCAMENTO_ENVIADO);
  await moveOpportunityStage(sb, { opportunityId: id, toStageId: stage.id, reason: "orçamento enviado pelo WhatsApp", actorId: user.id });
  revalidatePath(`/oportunidades/${id}`);
  return { ok: true, message: "Orçamento enviado ✓" };
}

// ------------------------------------------------------------
// Viajantes
// ------------------------------------------------------------
export async function saveTraveler(_prev: ActionResult | null, fd: FormData): Promise<ActionResult> {
  const { supabase } = await requireStaff();
  const id = str(fd, "id");
  const contactId = str(fd, "contact_id");
  const opportunityId = str(fd, "opportunity_id");
  const fullName = str(fd, "full_name");
  if (!contactId || !fullName) return { ok: false, error: "Informe o nome do viajante." };
  const passport = str(fd, "passport_expires_on");
  const visa = str(fd, "us_visa_expires_on");
  const row = {
    contact_id: contactId,
    full_name: fullName,
    birth_date: str(fd, "birth_date"),
    passport_expires_on: passport,
    has_passport: passport ? true : fd.get("no_passport") ? false : null,
    us_visa_expires_on: visa,
    has_us_visa: visa ? true : fd.get("no_visa") ? false : null,
  };
  let travelerId = id;
  if (id) {
    const { error } = await supabase.from("travelers").update(row).eq("id", id);
    if (error) return { ok: false, error: error.message };
  } else {
    const { data, error } = await supabase.from("travelers").insert(row).select("id").single();
    if (error || !data) return { ok: false, error: error?.message ?? "erro ao salvar" };
    travelerId = data.id;
  }
  if (opportunityId && travelerId) {
    await supabase.from("opportunity_travelers").upsert({ opportunity_id: opportunityId, traveler_id: travelerId }, { onConflict: "opportunity_id,traveler_id" });
    await checkOpportunityDocuments(createSupabaseServiceClient(), opportunityId);
    revalidatePath(`/oportunidades/${opportunityId}`);
  }
  revalidatePath(`/clientes/${contactId}`);
  revalidatePath("/vencimentos");
  return { ok: true, message: "Viajante salvo ✓" };
}

export async function linkTraveler(opportunityId: string, travelerId: string, link: boolean): Promise<void> {
  const { supabase } = await requireStaff();
  if (link) {
    await supabase.from("opportunity_travelers").upsert({ opportunity_id: opportunityId, traveler_id: travelerId }, { onConflict: "opportunity_id,traveler_id" });
  } else {
    // desvincular é só remover a ligação; exige admin pela RLS de delete → usa service
    await createSupabaseServiceClient().from("opportunity_travelers").delete().eq("opportunity_id", opportunityId).eq("traveler_id", travelerId);
  }
  revalidatePath(`/oportunidades/${opportunityId}`);
}

// ------------------------------------------------------------
// Tarefas
// ------------------------------------------------------------
export async function toggleTask(taskId: string, done: boolean): Promise<void> {
  const { supabase } = await requireStaff();
  await supabase
    .from("tasks")
    .update({ status: done ? "done" : "pending", completed_at: done ? new Date().toISOString() : null })
    .eq("id", taskId);
  revalidatePath("/tarefas");
}

export async function createManualTask(_prev: ActionResult | null, fd: FormData): Promise<ActionResult> {
  const { supabase, user } = await requireStaff();
  const description = str(fd, "description");
  if (!description) return { ok: false, error: "Descreva a tarefa." };
  const { error } = await supabase.from("tasks").insert({
    description,
    due_date: str(fd, "due_date"),
    priority: str(fd, "priority") ?? "normal",
    contact_id: str(fd, "contact_id"),
    opportunity_id: str(fd, "opportunity_id"),
    assigned_to: user.id,
    created_by: user.id,
    source: "manual",
  });
  if (error) return { ok: false, error: error.message };
  revalidatePath("/tarefas");
  return { ok: true, message: "Tarefa criada ✓" };
}

// ------------------------------------------------------------
// Conversas
// ------------------------------------------------------------
export async function markConversationRead(conversationId: string): Promise<void> {
  const { supabase } = await requireStaff();
  await supabase.from("conversations").update({ unread_count: 0 }).eq("id", conversationId);
}

/** Equipe assume: o bot para de responder nesta conversa. */
export async function takeOverConversation(conversationId: string): Promise<void> {
  const { supabase, user } = await requireStaff();
  await supabase
    .from("conversations")
    .update({ status: "pending_human", assigned_to: user.id, human_handoff_required: false })
    .eq("id", conversationId);
  await supabase.from("bot_sessions").update({ status: "handed_off", completed_at: new Date().toISOString() }).eq("conversation_id", conversationId).eq("status", "active");
  revalidatePath(`/inbox/${conversationId}`);
}

/** Encerra o atendimento. A próxima mensagem do cliente abre conversa nova (e o bot volta se não houver negociação aberta). */
export async function closeConversation(conversationId: string): Promise<void> {
  const { supabase } = await requireStaff();
  await supabase.from("conversations").update({ status: "closed", unread_count: 0 }).eq("id", conversationId);
  await supabase.from("bot_sessions").update({ status: "abandoned", completed_at: new Date().toISOString() }).eq("conversation_id", conversationId).eq("status", "active");
  revalidatePath("/inbox");
}

export async function sendAgentMessage(conversationId: string, _prev: ActionResult | null, fd: FormData): Promise<ActionResult> {
  const { user, supabase } = await requireStaff();
  const text = str(fd, "text");
  if (!text) return { ok: false, error: "Mensagem vazia." };

  const { data: conv } = await supabase
    .from("conversations")
    .select("id, status, last_customer_message_at, contact:contacts(whatsapp_id)")
    .eq("id", conversationId)
    .single();
  const contact = Array.isArray(conv?.contact) ? conv?.contact[0] : conv?.contact;
  if (!conv || !contact?.whatsapp_id) return { ok: false, error: "Conversa sem WhatsApp." };
  if (!isInsideCustomerWindow(conv.last_customer_message_at)) {
    return { ok: false, error: "Fora da janela de 24h: o WhatsApp só permite modelo aprovado." };
  }

  // quem responde assume a conversa → bot para
  if (conv.status !== "pending_human") await takeOverConversation(conversationId);

  const sb = createSupabaseServiceClient();
  const result = await sendMessage(contact.whatsapp_id, { type: "text", body: text });
  await sb.from("messages").insert({
    conversation_id: conversationId,
    wa_message_id: result.waMessageId ?? null,
    direction: "outbound",
    sender_type: "agent",
    sender_user_id: user.id,
    message_type: "text",
    content: text,
    status: result.ok ? "sent" : "failed",
    failure_reason: result.error ?? null,
    raw_payload: result.requestBody,
  });
  revalidatePath(`/inbox/${conversationId}`);
  return result.ok ? { ok: true } : { ok: false, error: `Não enviou: ${result.error}` };
}
