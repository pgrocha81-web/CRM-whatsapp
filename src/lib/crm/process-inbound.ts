/**
 * Processa um evento registrado em webhook_events:
 *   mensagem recebida → contato → conversa → mensagem → oportunidade → bot
 *   status de entrega → atualiza messages.status
 *
 * Idempotente: o mesmo evento processado 2x não duplica nada (messages.wa_message_id
 * é UNIQUE e o evento é marcado processed=true no fim).
 */
import { addDaysISO, todayISO } from "../bot/parse";
import type { WhatsAppChange, WhatsAppInboundMessage, WhatsAppStatusUpdate } from "../whatsapp/types";
import { dbMessageType, detectBrandSlug, inboundPreview, toBotInput, toE164 } from "../whatsapp/inbound";
import { botContext, continueSession, getActiveSession, startQualificationSession } from "./bot-runner";
import { createTask, getStageByName, sendAndLog, STAGES, type DB } from "./db";

export interface WebhookEventRow {
  id: string;
  event_type: string;
  payload: {
    change: WhatsAppChange;
    message?: WhatsAppInboundMessage;
    status?: WhatsAppStatusUpdate;
  };
}

export async function processWebhookEvent(sb: DB, event: WebhookEventRow): Promise<void> {
  try {
    if (event.event_type === "message" && event.payload.message) {
      await processInboundMessage(sb, event.payload.change, event.payload.message);
    } else if (event.event_type === "status" && event.payload.status) {
      await processStatus(sb, event.payload.status);
    }
    await sb
      .from("webhook_events")
      .update({ processed: true, processed_at: new Date().toISOString(), processing_error: null })
      .eq("id", event.id);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`[process] evento ${event.id} falhou:`, message);
    await sb.from("webhook_events").update({ processing_error: message.slice(0, 1000) }).eq("id", event.id);
  }
}

async function processStatus(sb: DB, status: WhatsAppStatusUpdate) {
  const update: Record<string, unknown> = { status: status.status };
  if (status.status === "failed") {
    update.failure_reason = status.errors?.map((e) => `${e.code} ${e.title}`).join("; ") ?? "failed";
  }
  await sb.from("messages").update(update).eq("wa_message_id", status.id);
}

export async function processInboundMessage(sb: DB, change: WhatsAppChange, message: WhatsAppInboundMessage) {
  const now = new Date();
  const waId = message.from;
  const profileName = change.value.contacts?.find((c) => c.wa_id === waId)?.profile.name ?? null;
  const text = inboundPreview(message);

  // ---------- 1. contato ----------
  let { data: contact } = await sb
    .from("contacts")
    .select("id, name, brand_id, opt_out_at")
    .eq("whatsapp_id", waId)
    .maybeSingle();

  let isNewContact = false;
  if (!contact) {
    const brandSlug = detectBrandSlug(text);
    let brandId: string | null = null;
    if (brandSlug) {
      const { data: brand } = await sb.from("brands").select("id").eq("slug", brandSlug).maybeSingle();
      brandId = brand?.id ?? null;
    }
    // pode existir pelo telefone (cadastrado à mão / importado) sem whatsapp_id ainda
    const { data: byPhone } = await sb
      .from("contacts")
      .select("id, name, brand_id, opt_out_at")
      .eq("phone", toE164(waId))
      .maybeSingle();
    if (byPhone) {
      await sb.from("contacts").update({ whatsapp_id: waId }).eq("id", byPhone.id);
      contact = byPhone;
    } else {
      const { data: inserted, error } = await sb
        .from("contacts")
        .insert({
          phone: toE164(waId),
          whatsapp_id: waId,
          name: profileName,
          lead_source: message.referral ? "anuncio" : "whatsapp_direto",
          source_campaign: message.referral?.headline ?? null,
          brand_id: brandId,
        })
        .select("id, name, brand_id, opt_out_at")
        .single();
      if (error || !inserted) throw new Error(`contacts insert: ${error?.message}`);
      contact = inserted;
      isNewContact = true;
    }
  }
  const c = contact as { id: string; name: string | null; brand_id: string | null; opt_out_at: string | null };
  await sb.from("contacts").update({ last_interaction_at: now.toISOString() }).eq("id", c.id);

  // ---------- 2. conversa ----------
  let { data: conversation } = await sb
    .from("conversations")
    .select("id, status, unread_count, current_opportunity_id")
    .eq("contact_id", c.id)
    .neq("status", "closed")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!conversation) {
    const { data: created, error } = await sb
      .from("conversations")
      .insert({ contact_id: c.id })
      .select("id, status, unread_count, current_opportunity_id")
      .single();
    if (error || !created) throw new Error(`conversations insert: ${error?.message}`);
    conversation = created;
  }
  const conv = conversation as { id: string; status: string; unread_count: number; current_opportunity_id: string | null };

  // ---------- 3. mensagem (idempotente) ----------
  const { error: msgError } = await sb.from("messages").insert({
    conversation_id: conv.id,
    wa_message_id: message.id,
    direction: "inbound",
    sender_type: "customer",
    message_type: dbMessageType(message),
    content: text,
    location_lat: message.location?.latitude ?? null,
    location_lng: message.location?.longitude ?? null,
    status: "received",
    raw_payload: message as unknown as Record<string, unknown>,
  });
  if (msgError) {
    if (msgError.code === "23505") return; // já processada antes
    throw new Error(`messages insert: ${msgError.message}`);
  }
  await sb
    .from("conversations")
    .update({
      last_customer_message_at: new Date(Number(message.timestamp) * 1000 || now.getTime()).toISOString(),
      unread_count: (conv.unread_count ?? 0) + 1,
    })
    .eq("id", conv.id);

  const input = toBotInput(message);
  const brandSlug = await brandSlugOf(sb, c.brand_id);
  const ctx = botContext(now, brandSlug);

  // ---------- 4. resposta a template: "Quero renovar" (visto) ----------
  if (input.kind === "choice" && input.id.startsWith("RENOVAR_VISTO")) {
    await handleVisaRenewal(sb, { contactId: c.id, conversationId: conv.id, to: waId, travelerId: input.id.split(":")[1] ?? null });
    return;
  }

  // ---------- 5. bot ----------
  if (conv.status === "pending_human") return; // equipe já assumiu — bot não interfere

  const session = await getActiveSession(sb, conv.id);
  if (session) {
    await continueSession(sb, { session, input, to: waId, contactId: c.id, ctx });
    return;
  }

  if (!(await shouldStartQualification(sb, c.id, isNewContact))) return;

  const opportunityId = await createLead(sb, { contactId: c.id, brandId: c.brand_id, name: c.name ?? profileName });
  await sb.from("conversations").update({ current_opportunity_id: opportunityId }).eq("id", conv.id);
  await startQualificationSession(sb, { conversationId: conv.id, opportunityId, to: waId, ctx });
}

async function brandSlugOf(sb: DB, brandId: string | null): Promise<string | null> {
  if (!brandId) return null;
  const { data } = await sb.from("brands").select("slug").eq("id", brandId).maybeSingle();
  return data?.slug ?? null;
}

/**
 * Começa o roteiro só quando faz sentido:
 *  - contato novo → sim
 *  - já tem oportunidade em aberto (negociando) → não, a equipe conduz
 *  - viagem vendida em andamento (ida nos próximos meses ou voltou há < 30 dias) → não, é pós-venda
 *  - pediu para parar (blocklist/opt-out) → não
 *  - cliente antigo sem nada em aberto → sim (novo pedido de cotação)
 */
async function shouldStartQualification(sb: DB, contactId: string, isNewContact: boolean): Promise<boolean> {
  if (isNewContact) return true;
  const { data: blocked } = await sb.from("commercial_blocklist").select("id").eq("contact_id", contactId).maybeSingle();
  if (blocked) return false;

  const { data: opps } = await sb
    .from("opportunities")
    .select("id, travel_date_estimate, travel_return_date, stage:pipeline_stages(is_won, is_lost, name)")
    .eq("contact_id", contactId);

  const recentLimit = addDaysISO(todayISO(new Date()), -30);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  for (const o of (opps ?? []) as any[]) {
    const stage = Array.isArray(o.stage) ? o.stage[0] : o.stage;
    const isClosed = stage?.is_won || stage?.is_lost || stage?.name === STAGES.POS_VENDA;
    if (!isClosed) return false; // negociação em aberto
    const soldOrPostSale = stage?.is_won || stage?.name === STAGES.POS_VENDA;
    const lastDay = o.travel_return_date ?? o.travel_date_estimate;
    if (soldOrPostSale && (!lastDay || lastDay >= recentLimit)) return false; // viagem vigente
  }
  return true;
}

async function createLead(sb: DB, p: { contactId: string; brandId: string | null; name: string | null }): Promise<string> {
  const stage = await getStageByName(sb, STAGES.NOVO_LEAD);
  const { data, error } = await sb
    .from("opportunities")
    .insert({
      contact_id: p.contactId,
      brand_id: p.brandId,
      pipeline_id: stage.pipeline_id,
      stage_id: stage.id,
      title: p.name ? `Novo lead — ${p.name}` : "Novo lead WhatsApp",
      origin: "whatsapp",
    })
    .select("id")
    .single();
  if (error || !data) throw new Error(`opportunities insert: ${error?.message}`);
  await sb.from("activities").insert({
    contact_id: p.contactId,
    opportunity_id: data.id,
    activity_type: "stage_change",
    description: `Novo lead criado automaticamente pelo WhatsApp (etapa ${STAGES.NOVO_LEAD})`,
  });
  return data.id as string;
}

/** Cliente tocou "Quero renovar" no aviso de visto vencendo → nova oportunidade de visto. */
async function handleVisaRenewal(
  sb: DB,
  p: { contactId: string; conversationId: string; to: string; travelerId: string | null }
) {
  const stage = await getStageByName(sb, STAGES.NOVO_LEAD);
  const { data: product } = await sb.from("products").select("id, brand_id").eq("slug", "visto_americano").maybeSingle();
  let travelerName: string | null = null;
  if (p.travelerId) {
    const { data: t } = await sb.from("travelers").select("full_name").eq("id", p.travelerId).maybeSingle();
    travelerName = t?.full_name ?? null;
  }
  const { data: opp } = await sb
    .from("opportunities")
    .insert({
      contact_id: p.contactId,
      pipeline_id: stage.pipeline_id,
      stage_id: stage.id,
      product_id: product?.id ?? null,
      brand_id: product?.brand_id ?? null,
      title: `Renovação de visto americano${travelerName ? ` — ${travelerName}` : ""}`,
      origin: "aviso_vencimento_visto",
      tags: ["visto"],
      lead_temperature: "hot",
    })
    .select("id")
    .single();
  await sb.from("conversations").update({ status: "pending_human", current_opportunity_id: opp?.id ?? null }).eq("id", p.conversationId);
  await createTask(sb, {
    description: `Cliente quer renovar o visto americano${travelerName ? ` de ${travelerName}` : ""} — entrar em contato`,
    contactId: p.contactId,
    opportunityId: opp?.id ?? null,
    travelerId: p.travelerId,
    priority: "high",
    dueDate: todayISO(new Date()),
  });
  await sendAndLog(sb, {
    conversationId: p.conversationId,
    to: p.to,
    message: {
      type: "text",
      body: "Ótimo! 🙌 Já avisei nossa equipe de vistos, a gente te chama por aqui pra começar a renovação. Atendemos de seg. a sex., das 9h às 18h.",
    },
  });
}
