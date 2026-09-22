/**
 * Liga o motor puro do bot ao banco: carrega/salva bot_sessions, envia as
 * mensagens, grava as respostas na oportunidade e move o card no funil.
 */
import { handleDocuments, startDocuments, askDocuments, type DocumentsStep } from "../bot/documentos";
import {
  askQualification,
  handleQualification,
  isUSDestination,
  startQualification,
  type QualificationStep,
} from "../bot/qualificacao";
import type { BotContext, BotInput, DocumentsAnswers, QualificationAnswers, StepResult } from "../bot/types";
import { checkTravelerDocuments } from "../avisos/rules";
import { todayISO } from "../bot/parse";
import { claimNotification, createTask, getStageByName, moveOpportunityStage, sendAndLog, STAGES, type DB } from "./db";

export interface BotSessionRow {
  id: string;
  conversation_id: string;
  opportunity_id: string | null;
  flow: "qualificacao" | "documentos";
  step: string;
  answers: Record<string, unknown>;
  status: string;
}

export function botContext(now: Date, brandSlug: string | null): BotContext {
  return {
    now,
    brandSlug,
    attendantName: process.env.BOT_ATTENDANT_NAME || "Piero",
    promoGroupUrl: process.env.BOT_PROMO_GROUP_URL || null,
  };
}

export async function getActiveSession(sb: DB, conversationId: string): Promise<BotSessionRow | null> {
  const { data } = await sb
    .from("bot_sessions")
    .select("id, conversation_id, opportunity_id, flow, step, answers, status")
    .eq("conversation_id", conversationId)
    .eq("status", "active")
    .maybeSingle();
  return (data as BotSessionRow) ?? null;
}

/** Pergunta atual de novo (usada no lembrete de "parou no meio"). */
export function currentQuestion(session: BotSessionRow, ctx: BotContext) {
  return session.flow === "qualificacao"
    ? askQualification(session.step as QualificationStep, session.answers as QualificationAnswers, ctx)
    : askDocuments(session.step as DocumentsStep, session.answers as unknown as DocumentsAnswers);
}

// ------------------------------------------------------------
// Início dos fluxos
// ------------------------------------------------------------
export async function startQualificationSession(
  sb: DB,
  p: { conversationId: string; opportunityId: string; to: string; ctx: BotContext }
) {
  const result = startQualification(p.ctx);
  const { data: session, error } = await sb
    .from("bot_sessions")
    .insert({
      conversation_id: p.conversationId,
      opportunity_id: p.opportunityId,
      flow: "qualificacao",
      step: result.step,
      answers: result.answers,
    })
    .select("id, conversation_id, opportunity_id, flow, step, answers, status")
    .single();
  if (error) throw new Error(`bot_sessions insert: ${error.message}`);
  const stage = await getStageByName(sb, STAGES.QUALIFICACAO);
  await moveOpportunityStage(sb, { opportunityId: p.opportunityId, toStageId: stage.id, reason: "bot de qualificação iniciado" });
  await sendAll(sb, p.conversationId, p.to, result);
  return session as BotSessionRow;
}

export async function startDocumentsSession(
  sb: DB,
  p: { conversationId: string; opportunityId: string; to: string; travelersCount: number; askUSVisa: boolean }
) {
  const result = startDocuments({ travelersCount: p.travelersCount, askUSVisa: p.askUSVisa });
  const { error } = await sb.from("bot_sessions").insert({
    conversation_id: p.conversationId,
    opportunity_id: p.opportunityId,
    flow: "documentos",
    step: result.step,
    answers: result.answers,
  });
  if (error) throw new Error(`bot_sessions insert: ${error.message}`);
  await sendAll(sb, p.conversationId, p.to, result);
}

// ------------------------------------------------------------
// Resposta do cliente numa sessão ativa
// ------------------------------------------------------------
export async function continueSession(
  sb: DB,
  p: { session: BotSessionRow; input: BotInput; to: string; contactId: string; ctx: BotContext }
) {
  const { session } = p;

  const result: StepResult<QualificationAnswers | DocumentsAnswers> =
    session.flow === "qualificacao"
      ? handleQualification(
          { step: session.step as QualificationStep, answers: session.answers as QualificationAnswers },
          p.input,
          p.ctx
        )
      : handleDocuments(
          { step: session.step as DocumentsStep, answers: session.answers as unknown as DocumentsAnswers },
          p.input,
          p.ctx
        );

  const now = new Date().toISOString();
  await sb
    .from("bot_sessions")
    .update({
      step: result.step,
      answers: result.answers,
      status: result.status,
      last_prompt_at: now,
      completed_at: result.status === "active" ? null : now,
    })
    .eq("id", session.id);

  await sendAll(sb, session.conversation_id, p.to, result);

  if (session.flow === "qualificacao" && session.opportunity_id) {
    // grava a cada passo — a equipe vê os dados parciais mesmo se o cliente parar no meio
    await saveQualificationAnswers(sb, session.opportunity_id, p.contactId, result.answers as QualificationAnswers);

    if (result.status === "completed") {
      const stage = await getStageByName(sb, STAGES.ORCAMENTO_PREPARACAO);
      await moveOpportunityStage(sb, { opportunityId: session.opportunity_id, toStageId: stage.id, reason: "cliente respondeu todo o roteiro" });
      await createTask(sb, {
        description: "Montar cotação — cliente respondeu o roteiro do WhatsApp",
        contactId: p.contactId,
        opportunityId: session.opportunity_id,
        priority: "high",
        dueDate: todayISO(p.ctx.now),
      });
    }
  }

  if (session.flow === "documentos" && result.status === "completed" && session.opportunity_id) {
    await saveTravelers(sb, {
      opportunityId: session.opportunity_id,
      contactId: p.contactId,
      answers: result.answers as DocumentsAnswers,
    });
  }

  if (result.status === "handed_off") {
    await sb
      .from("conversations")
      .update({ status: "pending_human", human_handoff_required: true, human_handoff_reason: "cliente pediu atendente" })
      .eq("id", session.conversation_id);
    await createTask(sb, {
      description: "Cliente pediu para falar com um atendente no WhatsApp",
      contactId: p.contactId,
      opportunityId: session.opportunity_id,
      priority: "urgent",
      dueDate: todayISO(p.ctx.now),
    });
  }
}

async function sendAll(sb: DB, conversationId: string, to: string, result: StepResult<unknown>) {
  for (const message of result.messages) {
    const sent = await sendAndLog(sb, { conversationId, to, message });
    if (!sent.ok) {
      console.error("[bot] falha ao enviar mensagem:", sent.error);
      break; // não manda a próxima pergunta se a anterior falhou
    }
  }
}

// ------------------------------------------------------------
// Persistência das respostas
// ------------------------------------------------------------
export function qualificationToOpportunity(a: QualificationAnswers) {
  const ages = a.idades ?? [];
  const adults = ages.filter((x) => x >= 12);
  const children = ages.filter((x) => x < 12);
  const tags = a.visto === "some" || a.visto === "none" ? ["visto"] : [];
  return {
    title: a.destino && a.nome ? `${a.destino} — ${a.nome}` : undefined,
    destination: a.destino ?? null,
    destination_code: a.destino_codigo ?? null,
    origin_city: a.cidade ?? null,
    us_visa_status: isUSDestination(a.destino_codigo) ? (a.visto ?? null) : null,
    travelers_count: a.pessoas ?? null,
    traveler_ages: ages.length ? ages : null,
    adults_count: ages.length ? adults.length : null,
    children_count: ages.length ? children.length : null,
    children_ages: children.length ? children : null,
    travel_date_estimate: a.data_ida ?? null,
    travel_return_date: a.data_volta ?? null,
    travel_date_confidence: a.data_ida ? "exact" : a.mes_texto ? "approximate" : "unknown",
    travel_month_text: a.mes_texto ?? null,
    budget_range: a.orcamento ?? null,
    payment_preference: a.pagamento ?? null,
    rundisney_race: a.rundisney ?? null,
    tags,
  };
}

async function saveQualificationAnswers(sb: DB, opportunityId: string, contactId: string, a: QualificationAnswers) {
  const fields = qualificationToOpportunity(a);
  const update: Record<string, unknown> = { ...fields, last_activity_at: new Date().toISOString() };
  if (!fields.title) delete update.title;
  await sb.from("opportunities").update(update).eq("id", opportunityId);

  const contactUpdate: Record<string, unknown> = {};
  if (a.nome) contactUpdate.name = a.nome;
  if (a.cidade) contactUpdate.city = a.cidade;
  if (Object.keys(contactUpdate).length) await sb.from("contacts").update(contactUpdate).eq("id", contactId);
}

async function saveTravelers(sb: DB, p: { opportunityId: string; contactId: string; answers: DocumentsAnswers }) {
  for (const v of p.answers.viajantes) {
    // reaproveita o viajante se já existe com o mesmo nome para este cliente
    const { data: existing } = await sb
      .from("travelers")
      .select("id")
      .eq("contact_id", p.contactId)
      .ilike("full_name", v.nome)
      .maybeSingle();

    const row = {
      contact_id: p.contactId,
      full_name: v.nome,
      passport_expires_on: v.passaporte ?? null,
      has_passport: v.passaporte === undefined ? null : v.passaporte !== null,
      us_visa_expires_on: p.answers.pedir_visto ? (v.visto ?? null) : undefined,
      has_us_visa: p.answers.pedir_visto ? (v.visto === undefined ? null : v.visto !== null) : undefined,
    };
    let travelerId: string;
    if (existing) {
      travelerId = existing.id;
      await sb.from("travelers").update(row).eq("id", travelerId);
    } else {
      const { data: inserted, error } = await sb.from("travelers").insert(row).select("id").single();
      if (error || !inserted) {
        console.error("[bot] falha ao salvar viajante:", error?.message);
        continue;
      }
      travelerId = inserted.id;
    }
    await sb
      .from("opportunity_travelers")
      .upsert({ opportunity_id: p.opportunityId, traveler_id: travelerId }, { onConflict: "opportunity_id,traveler_id" });
  }
  await checkOpportunityDocuments(sb, p.opportunityId);
}

/**
 * Confere passaporte/visto de todos os viajantes da viagem e cria UMA tarefa
 * urgente por viajante com problema (alerta vermelho para a equipe).
 * Chamado quando os documentos chegam e também pela rotina diária.
 */
export async function checkOpportunityDocuments(sb: DB, opportunityId: string) {
  const { data: opp } = await sb
    .from("opportunities")
    .select(
      "id, contact_id, destination_code, travel_date_estimate, travel_return_date, travel_date_confidence, opportunity_travelers(traveler:travelers(id, full_name, passport_expires_on, has_passport, us_visa_expires_on, has_us_visa))"
    )
    .eq("id", opportunityId)
    .single();
  if (!opp || !opp.travel_date_estimate || opp.travel_date_confidence !== "exact") return;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  for (const link of (opp.opportunity_travelers ?? []) as any[]) {
    const t = link.traveler;
    if (!t) continue;
    const issues = checkTravelerDocuments(
      {
        destinationCode: opp.destination_code,
        departure: opp.travel_date_estimate,
        returnDate: opp.travel_return_date,
      },
      {
        name: t.full_name,
        passportExpiresOn: t.passport_expires_on,
        hasPassport: t.has_passport,
        usVisaExpiresOn: t.us_visa_expires_on,
        hasUSVisa: t.has_us_visa,
      }
    );
    if (!issues.length) continue;

    const claimed = await claimNotification(sb, {
      kind: "document_conflict",
      entityId: t.id,
      referenceDate: opp.travel_date_estimate,
      channel: "internal_task",
      detail: { opportunity_id: opp.id, issues },
    });
    if (!claimed) continue;
    const blocker = issues.some((i) => i.severity === "blocker");
    await createTask(sb, {
      description: `${blocker ? "🔴" : "🟡"} Documentos: ${issues.map((i) => i.message).join(" ")}`,
      contactId: opp.contact_id,
      opportunityId: opp.id,
      travelerId: t.id,
      priority: blocker ? "urgent" : "high",
      dueDate: todayISO(new Date()),
    });
  }
}
