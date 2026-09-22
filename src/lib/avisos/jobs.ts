/**
 * Rotinas automáticas.
 *
 * DIÁRIA (8h, Vercel Cron — funciona no plano Hobby):
 *   - aviso "falta 1 semana pra sua viagem"
 *   - passaporte / visto americano vencendo em até 6 meses (cliente + tarefa p/ equipe)
 *   - conferência de documentos x datas das viagens vendidas (alerta vermelho)
 *   - + tudo da rotina de hora em hora (garantia caso ela não esteja agendada)
 *
 * HORA EM HORA (Supabase pg_cron → ver docs/AVISOS.md):
 *   - lembrete para quem parou o roteiro no meio (2h depois, 1x)
 *   - reprocessa eventos do webhook que falharam
 *   - re-tenta Calendar/Trello de vendas que deram erro
 */
import { addDaysISO, addMonthsISO, formatBR, todayISO } from "../bot/parse";
import { botContext, checkOpportunityDocuments, currentQuestion, type BotSessionRow } from "../crm/bot-runner";
import { claimNotification, createTask, isBlocklisted, latestConversation, markNotification, sendAndLog, sendTemplateAndLog, type DB } from "../crm/db";
import { processWebhookEvent, type WebhookEventRow } from "../crm/process-inbound";
import { handleOpportunityWon } from "../crm/won";
import { isGoogleCalendarConfigured } from "../integrations/google-calendar";
import { isTrelloConfigured } from "../integrations/trello";
import { isInsideCustomerWindow } from "../whatsapp/send";
import { EXPIRY_WINDOW_MONTHS, isTripReminderDue, TRIP_REMINDER_DAYS, TRIP_REMINDER_MIN_DAYS } from "./rules";

/** Nomes dos templates — precisam existir e estar APROVADOS na Meta (docs/TEMPLATES_META.md). */
export const TEMPLATES = {
  trip7Days: process.env.WA_TEMPLATE_VIAGEM_1_SEMANA || "koala_viagem_1_semana",
  passportExpiring: process.env.WA_TEMPLATE_PASSAPORTE || "koala_passaporte_vencendo",
  visaExpiring: process.env.WA_TEMPLATE_VISTO || "koala_visto_vencendo",
};

/** Teto de mensagens de vencimento por execução (evita rajada ao importar a base antiga). */
const MAX_EXPIRY_MESSAGES_PER_RUN = Number(process.env.AVISOS_MAX_VENCIMENTOS_POR_DIA || 40);

export interface JobReport {
  [key: string]: number | string[];
  errors: string[];
}

function firstName(name: string | null | undefined): string {
  return (name ?? "").trim().split(/\s+/)[0] || "tudo bem";
}

function one<T>(value: T | T[] | null | undefined): T | null {
  if (Array.isArray(value)) return value[0] ?? null;
  return value ?? null;
}

// ============================================================
// DIÁRIA
// ============================================================
export async function runDailyJobs(sb: DB, now = new Date()): Promise<JobReport> {
  const report: JobReport = { errors: [] };
  const today = todayISO(now);

  report.trip_reminders = await tripReminders(sb, today, report.errors);
  report.expiry_messages = await documentExpirations(sb, today, report.errors);
  report.document_checks = await upcomingDocumentChecks(sb, today, report.errors);

  const hourly = await runHourlyJobs(sb, now);
  for (const [k, v] of Object.entries(hourly)) {
    if (k === "errors") report.errors.push(...(v as string[]));
    else report[k] = v;
  }
  return report;
}

/** Oportunidades vendidas: closed_at preenchido e etapa que não é de perda. */
async function soldTrips(sb: DB, fromDate: string, toDate: string) {
  const { data, error } = await sb
    .from("opportunities")
    .select(
      "id, destination, travel_date_estimate, travel_date_confidence, contact:contacts(id, name, whatsapp_id), stage:pipeline_stages!inner(is_lost)"
    )
    .not("closed_at", "is", null)
    .eq("stage.is_lost", false)
    .eq("travel_date_confidence", "exact")
    .gte("travel_date_estimate", fromDate)
    .lte("travel_date_estimate", toDate);
  if (error) throw new Error(`consulta de viagens vendidas: ${error.message}`);
  return (data ?? []) as unknown as Array<{
    id: string;
    destination: string | null;
    travel_date_estimate: string;
    contact: { id: string; name: string | null; whatsapp_id: string | null } | { id: string; name: string | null; whatsapp_id: string | null }[] | null;
  }>;
}

async function tripReminders(sb: DB, today: string, errors: string[]): Promise<number> {
  let sent = 0;
  try {
    const trips = await soldTrips(sb, addDaysISO(today, TRIP_REMINDER_MIN_DAYS), addDaysISO(today, TRIP_REMINDER_DAYS));
    for (const trip of trips) {
      const contact = one(trip.contact);
      if (!contact?.whatsapp_id || !isTripReminderDue(trip.travel_date_estimate, today)) continue;

      const claimId = await claimNotification(sb, {
        kind: "trip_7_days",
        entityId: trip.id,
        referenceDate: trip.travel_date_estimate,
        channel: "whatsapp",
      });
      if (!claimId) continue; // já avisado para essa data

      const conversation = await latestConversation(sb, contact.id);
      const params = [firstName(contact.name), trip.destination ?? "sua viagem", formatBR(trip.travel_date_estimate)];
      const result = await sendTemplateAndLog(sb, {
        conversationId: conversation?.id ?? null,
        to: contact.whatsapp_id,
        template: { name: TEMPLATES.trip7Days, bodyParams: params },
        preview: `[template ${TEMPLATES.trip7Days}] ${params.join(" | ")}`,
      });
      if (result.ok) sent++;
      else {
        errors.push(`aviso de viagem ${trip.id}: ${result.error}`);
        await markNotification(sb, claimId, "failed", { error: result.error });
      }
    }
  } catch (err) {
    errors.push(`tripReminders: ${err instanceof Error ? err.message : String(err)}`);
  }
  return sent;
}

async function documentExpirations(sb: DB, today: string, errors: string[]): Promise<number> {
  let messages = 0;
  const limit = addMonthsISO(today, EXPIRY_WINDOW_MONTHS);

  const docs: Array<{ kind: "passport_expiring" | "us_visa_expiring"; column: string; template: string; label: string }> = [
    { kind: "passport_expiring", column: "passport_expires_on", template: TEMPLATES.passportExpiring, label: "Passaporte" },
    { kind: "us_visa_expiring", column: "us_visa_expires_on", template: TEMPLATES.visaExpiring, label: "Visto americano" },
  ];

  for (const doc of docs) {
    try {
      const { data, error } = await sb
        .from("travelers")
        .select(`id, full_name, ${doc.column}, contact:contacts(id, name, whatsapp_id, opt_out_at)`)
        .gte(doc.column, today)
        .lte(doc.column, limit)
        .order(doc.column);
      if (error) throw new Error(error.message);

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      for (const t of (data ?? []) as any[]) {
        const expiresOn: string = t[doc.column];
        const contact = one(t.contact) as { id: string; name: string | null; whatsapp_id: string | null; opt_out_at: string | null } | null;
        if (!contact) continue;

        // tarefa para a equipe (sempre)
        const taskClaim = await claimNotification(sb, {
          kind: doc.kind,
          entityId: t.id,
          referenceDate: expiresOn,
          channel: "internal_task",
        });
        if (taskClaim) {
          await createTask(sb, {
            description: `${doc.label} de ${t.full_name} vence em ${formatBR(expiresOn)}${doc.kind === "us_visa_expiring" ? " — oferecer renovação (consultoria de visto)" : ""}`,
            contactId: contact.id,
            travelerId: t.id,
            priority: "normal",
            dueDate: today,
          });
        }

        // WhatsApp para o cliente (respeita teto diário e pedido de parar)
        if (!contact.whatsapp_id || contact.opt_out_at || messages >= MAX_EXPIRY_MESSAGES_PER_RUN) continue;
        if (doc.kind === "us_visa_expiring" && (await isBlocklisted(sb, contact.id))) continue;

        const claimId = await claimNotification(sb, {
          kind: doc.kind,
          entityId: t.id,
          referenceDate: expiresOn,
          channel: "whatsapp",
        });
        if (!claimId) continue;

        const conversation = await latestConversation(sb, contact.id);
        const params = [firstName(contact.name), t.full_name.split(" ")[0], formatBR(expiresOn)];
        const result = await sendTemplateAndLog(sb, {
          conversationId: conversation?.id ?? null,
          to: contact.whatsapp_id,
          template: {
            name: doc.template,
            bodyParams: params,
            quickReplyPayloads: doc.kind === "us_visa_expiring" ? [`RENOVAR_VISTO:${t.id}`] : undefined,
          },
          preview: `[template ${doc.template}] ${params.join(" | ")}`,
        });
        if (result.ok) messages++;
        else {
          errors.push(`aviso ${doc.kind} ${t.id}: ${result.error}`);
          await markNotification(sb, claimId, "failed", { error: result.error });
        }
      }
    } catch (err) {
      errors.push(`documentExpirations(${doc.kind}): ${err instanceof Error ? err.message : String(err)}`);
    }
  }
  return messages;
}

async function upcomingDocumentChecks(sb: DB, today: string, errors: string[]): Promise<number> {
  try {
    const trips = await soldTrips(sb, today, addDaysISO(today, 365));
    for (const trip of trips) await checkOpportunityDocuments(sb, trip.id);
    return trips.length;
  } catch (err) {
    errors.push(`upcomingDocumentChecks: ${err instanceof Error ? err.message : String(err)}`);
    return 0;
  }
}

// ============================================================
// HORA EM HORA
// ============================================================
export async function runHourlyJobs(sb: DB, now = new Date()): Promise<JobReport> {
  const report: JobReport = { errors: [] };
  report.reprocessed_events = await reprocessEvents(sb, now, report.errors);
  report.bot_reminders = await botReminders(sb, now, report.errors);
  report.won_sync_retries = await retryWonSync(sb, now, report.errors);
  return report;
}

async function reprocessEvents(sb: DB, now: Date, errors: string[]): Promise<number> {
  try {
    const { data, error } = await sb
      .from("webhook_events")
      .select("id, event_type, payload")
      .eq("processed", false)
      .lt("received_at", new Date(now.getTime() - 2 * 60_000).toISOString())
      .gt("received_at", new Date(now.getTime() - 48 * 3600_000).toISOString())
      .order("received_at")
      .limit(50);
    if (error) throw new Error(error.message);
    for (const event of (data ?? []) as WebhookEventRow[]) await processWebhookEvent(sb, event);
    return data?.length ?? 0;
  } catch (err) {
    errors.push(`reprocessEvents: ${err instanceof Error ? err.message : String(err)}`);
    return 0;
  }
}

const REMINDER_AFTER_MS = 2 * 3600_000;
const ABANDON_AFTER_MS = 72 * 3600_000;

async function botReminders(sb: DB, now: Date, errors: string[]): Promise<number> {
  let sent = 0;
  try {
    // sessões paradas há muito tempo → abandonadas (o card continua no funil)
    await sb
      .from("bot_sessions")
      .update({ status: "abandoned", completed_at: now.toISOString() })
      .eq("status", "active")
      .lt("last_prompt_at", new Date(now.getTime() - ABANDON_AFTER_MS).toISOString());

    const { data, error } = await sb
      .from("bot_sessions")
      .select(
        "id, conversation_id, opportunity_id, flow, step, answers, status, conversation:conversations(id, status, last_customer_message_at, contact:contacts(id, name, whatsapp_id, brand:brands(slug)))"
      )
      .eq("status", "active")
      .is("reminder_sent_at", null)
      .lt("last_prompt_at", new Date(now.getTime() - REMINDER_AFTER_MS).toISOString());
    if (error) throw new Error(error.message);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    for (const row of (data ?? []) as any[]) {
      const conversation = one(row.conversation) as { id: string; status: string; last_customer_message_at: string | null; contact: unknown } | null;
      const contact = one(conversation?.contact as never) as { name: string | null; whatsapp_id: string | null; brand: unknown } | null;
      if (!conversation || !contact?.whatsapp_id || conversation.status === "pending_human") continue;
      // só dentro da janela de 24h (margem de 1h para o envio)
      if (!isInsideCustomerWindow(conversation.last_customer_message_at, new Date(now.getTime() + 3600_000))) continue;

      // marca antes de enviar: no máximo 1 lembrete por sessão
      const { data: claimed } = await sb
        .from("bot_sessions")
        .update({ reminder_sent_at: now.toISOString() })
        .eq("id", row.id)
        .is("reminder_sent_at", null)
        .select("id");
      if (!claimed?.length) continue;

      const session = row as BotSessionRow;
      const brand = one(contact.brand as never) as { slug: string } | null;
      const ctx = botContext(now, brand?.slug ?? null);
      const nome = (session.answers as { nome?: string }).nome ?? contact.name;
      const messages = [
        {
          type: "text" as const,
          body:
            session.flow === "qualificacao"
              ? `Oi${nome ? `, ${firstName(nome)}` : ""}! Ainda tô por aqui 😊 Pra eu montar sua cotação, só falta responder:`
              : `Oi${nome ? `, ${firstName(nome)}` : ""}! Falta pouco pra terminar o cadastro dos documentos 📄`,
        },
        ...currentQuestion(session, ctx),
      ];
      for (const message of messages) {
        const r = await sendAndLog(sb, { conversationId: conversation.id, to: contact.whatsapp_id, message });
        if (!r.ok) {
          errors.push(`lembrete ${row.id}: ${r.error}`);
          break;
        }
      }
      sent++;
    }
  } catch (err) {
    errors.push(`botReminders: ${err instanceof Error ? err.message : String(err)}`);
  }
  return sent;
}

async function retryWonSync(sb: DB, now: Date, errors: string[]): Promise<number> {
  const calendar = isGoogleCalendarConfigured();
  const trello = isTrelloConfigured();
  if (!calendar && !trello) return 0;
  try {
    const missing = [
      calendar ? "and(google_calendar_event_id.is.null,travel_date_estimate.not.is.null)" : null,
      trello ? "trello_card_id.is.null" : null,
    ].filter(Boolean);
    const { data, error } = await sb
      .from("opportunities")
      .select("id, stage:pipeline_stages!inner(is_won)")
      .eq("stage.is_won", true)
      .gt("closed_at", new Date(now.getTime() - 30 * 24 * 3600_000).toISOString())
      .or(missing.join(","))
      .limit(20);
    if (error) throw new Error(error.message);
    for (const o of data ?? []) {
      const r = await handleOpportunityWon(sb, o.id, { requestDocuments: false });
      errors.push(...r.errors.filter((e) => !e.includes("não configurado") && !e.startsWith("Sem data")));
    }
    return data?.length ?? 0;
  } catch (err) {
    errors.push(`retryWonSync: ${err instanceof Error ? err.message : String(err)}`);
    return 0;
  }
}
