/**
 * Helpers de banco usados pelo processador de mensagens, pelas rotinas de
 * aviso e pela venda fechada. Sempre com o client de SERVIÇO (server-side).
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import type { OutgoingMessage } from "../bot/types";
import { messagePreview, sendMessage, sendTemplate, type SendResult, type TemplateParams } from "../whatsapp/send";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type DB = SupabaseClient<any, any, any>;

export const STAGES = {
  NOVO_LEAD: "NOVO LEAD",
  PRIMEIRO_CONTATO: "PRIMEIRO CONTATO",
  QUALIFICACAO: "QUALIFICAÇÃO",
  ORCAMENTO_PREPARACAO: "ORÇAMENTO EM PREPARAÇÃO",
  ORCAMENTO_ENVIADO: "ORÇAMENTO ENVIADO",
  VENDA_FECHADA: "VENDA FECHADA",
  POS_VENDA: "PÓS-VENDA",
} as const;

export interface StageRow {
  id: string;
  pipeline_id: string;
  name: string;
  is_won: boolean;
  is_lost: boolean;
}

export async function getDefaultPipelineStages(sb: DB): Promise<StageRow[]> {
  const { data: pipeline, error } = await sb.from("pipelines").select("id").eq("is_default", true).limit(1).single();
  if (error || !pipeline) throw new Error("Pipeline padrão não encontrado — rode supabase/seed/seed.sql");
  const { data: stages, error: e2 } = await sb
    .from("pipeline_stages")
    .select("id, pipeline_id, name, is_won, is_lost")
    .eq("pipeline_id", pipeline.id)
    .order("position");
  if (e2 || !stages) throw new Error(`Falha ao carregar etapas: ${e2?.message}`);
  return stages as StageRow[];
}

export async function getStageByName(sb: DB, name: string): Promise<StageRow> {
  const stages = await getDefaultPipelineStages(sb);
  const stage = stages.find((s) => s.name === name);
  if (!stage) throw new Error(`Etapa "${name}" não existe no pipeline padrão`);
  return stage;
}

/**
 * Move a oportunidade de etapa registrando histórico e timeline.
 * Retorna a etapa de destino (o chamador decide o que fazer se for is_won).
 */
export async function moveOpportunityStage(
  sb: DB,
  params: { opportunityId: string; toStageId: string; reason: string; actorId?: string | null }
): Promise<{ stage: StageRow; changed: boolean }> {
  const { data: opp, error } = await sb
    .from("opportunities")
    .select("id, contact_id, stage_id, closed_at")
    .eq("id", params.opportunityId)
    .single();
  if (error || !opp) throw new Error(`Oportunidade não encontrada: ${params.opportunityId}`);

  const { data: stage, error: e2 } = await sb
    .from("pipeline_stages")
    .select("id, pipeline_id, name, is_won, is_lost")
    .eq("id", params.toStageId)
    .single();
  if (e2 || !stage) throw new Error(`Etapa não encontrada: ${params.toStageId}`);

  if (opp.stage_id === stage.id) return { stage: stage as StageRow, changed: false };

  const now = new Date().toISOString();
  await sb
    .from("opportunities")
    .update({
      stage_id: stage.id,
      last_activity_at: now,
      // closed_at marca a data da venda (ou da perda); não sobrescreve se já vendida
      closed_at: stage.is_won || stage.is_lost ? (opp.closed_at ?? now) : opp.closed_at,
    })
    .eq("id", opp.id);

  await sb.from("opportunity_stage_history").insert({
    opportunity_id: opp.id,
    from_stage_id: opp.stage_id,
    to_stage_id: stage.id,
    changed_by: params.actorId ?? null,
    reason: params.reason,
  });
  await sb.from("activities").insert({
    contact_id: opp.contact_id,
    opportunity_id: opp.id,
    actor_id: params.actorId ?? null,
    activity_type: stage.is_won ? "sale" : "stage_change",
    description: `Etapa → ${stage.name} (${params.reason})`,
  });
  return { stage: stage as StageRow, changed: true };
}

export async function createTask(
  sb: DB,
  task: {
    description: string;
    contactId?: string | null;
    opportunityId?: string | null;
    travelerId?: string | null;
    priority?: "low" | "normal" | "high" | "urgent";
    dueDate?: string | null;
  }
) {
  await sb.from("tasks").insert({
    description: task.description,
    contact_id: task.contactId ?? null,
    opportunity_id: task.opportunityId ?? null,
    traveler_id: task.travelerId ?? null,
    priority: task.priority ?? "normal",
    due_date: task.dueDate ?? null,
    source: "automation",
  });
}

/** Envia uma mensagem do bot e grava em messages (outbound). */
export async function sendAndLog(
  sb: DB,
  params: { conversationId: string; to: string; message: OutgoingMessage }
): Promise<SendResult> {
  const result = await sendMessage(params.to, params.message);
  await logOutbound(sb, {
    conversationId: params.conversationId,
    result,
    messageType: params.message.type === "text" ? "text" : "interactive",
    content: messagePreview(params.message),
  });
  return result;
}

export async function sendTemplateAndLog(
  sb: DB,
  params: { conversationId: string | null; to: string; template: TemplateParams; preview: string }
): Promise<SendResult> {
  const result = await sendTemplate(params.to, params.template);
  if (params.conversationId) {
    await logOutbound(sb, {
      conversationId: params.conversationId,
      result,
      messageType: "template",
      content: params.preview,
      templateName: params.template.name,
    });
  }
  return result;
}

async function logOutbound(
  sb: DB,
  p: { conversationId: string; result: SendResult; messageType: string; content: string; templateName?: string }
) {
  await sb.from("messages").insert({
    conversation_id: p.conversationId,
    wa_message_id: p.result.waMessageId ?? null,
    direction: "outbound",
    sender_type: "automation",
    message_type: p.messageType,
    content: p.content,
    template_name: p.templateName ?? null,
    status: p.result.ok ? "sent" : "failed",
    failure_reason: p.result.error ?? null,
    raw_payload: p.result.requestBody,
  });
}

/**
 * "Reserva" um aviso antes de enviar: se já existe (mesmo tipo, entidade, data
 * de referência e canal), retorna false e nada é enviado. Garante envio único
 * mesmo se o cron rodar duas vezes ao mesmo tempo.
 */
export async function claimNotification(
  sb: DB,
  n: { kind: string; entityId: string; referenceDate: string; channel: "whatsapp" | "internal_task"; detail?: unknown }
): Promise<string | null> {
  const { data, error } = await sb
    .from("notification_log")
    .insert({
      kind: n.kind,
      entity_id: n.entityId,
      reference_date: n.referenceDate,
      channel: n.channel,
      result: "sent",
      detail: n.detail ?? null,
    })
    .select("id")
    .single();
  if (error) {
    if (error.code === "23505") return null;
    throw new Error(`notification_log: ${error.message}`);
  }
  return data.id as string;
}

export async function markNotification(sb: DB, id: string, result: "sent" | "failed" | "skipped", detail?: unknown) {
  await sb.from("notification_log").update({ result, detail: detail ?? null }).eq("id", id);
}

/** Conversa mais recente (não fechada) do contato. */
export async function latestConversation(sb: DB, contactId: string) {
  const { data } = await sb
    .from("conversations")
    .select("id, status, last_customer_message_at, human_handoff_required")
    .eq("contact_id", contactId)
    .neq("status", "closed")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  return data as
    | { id: string; status: string; last_customer_message_at: string | null; human_handoff_required: boolean }
    | null;
}

export async function isBlocklisted(sb: DB, contactId: string): Promise<boolean> {
  const { data } = await sb.from("commercial_blocklist").select("id").eq("contact_id", contactId).maybeSingle();
  return !!data;
}
