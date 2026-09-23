import { after, NextRequest, NextResponse } from "next/server";
import { processWebhookEvent, type WebhookEventRow } from "@/lib/crm/process-inbound";
import { verifyMetaSignature } from "@/lib/whatsapp/verify-signature";
import { createSupabaseServiceClient } from "@/lib/supabase/server";
import type { WhatsAppWebhookPayload } from "@/lib/whatsapp/types";

/**
 * Webhook oficial da WhatsApp Cloud API.
 *
 * GET  -> verificação de assinatura do webhook (feita uma vez, ao configurar na Meta)
 * POST -> recebimento de eventos reais (mensagens, status de entrega)
 *
 * Fluxo: valida assinatura HMAC → registra em webhook_events (dedupe) →
 * responde 200 na hora → processa DEPOIS da resposta (after): contato,
 * conversa, oportunidade no funil e bot de perguntas.
 * Se o processamento falhar, o evento fica processed=false e a rotina de
 * hora em hora reprocessa (src/lib/avisos/jobs.ts).
 */

// ------------------------------------------------------------
// GET — verificação do webhook (Meta chama isso uma vez na configuração)
// https://developers.facebook.com/docs/graph-api/webhooks/getting-started#verification-requests
// ------------------------------------------------------------
export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const mode = searchParams.get("hub.mode");
  const token = searchParams.get("hub.verify_token");
  const challenge = searchParams.get("hub.challenge");

  const expectedToken = process.env.WHATSAPP_WEBHOOK_VERIFY_TOKEN;

  if (!expectedToken) {
    console.error(
      "[webhook/whatsapp] WHATSAPP_WEBHOOK_VERIFY_TOKEN não configurada no ambiente."
    );
    return new NextResponse("Server misconfigured", { status: 500 });
  }

  if (mode === "subscribe" && token === expectedToken) {
    return new NextResponse(challenge ?? "", { status: 200 });
  }

  return new NextResponse("Forbidden", { status: 403 });
}

// ------------------------------------------------------------
// POST — recebimento de eventos
// ------------------------------------------------------------
export async function POST(request: NextRequest) {
  const rawBody = await request.text();
  const signature = request.headers.get("x-hub-signature-256");
  const appSecret = process.env.META_APP_SECRET;

  if (!appSecret) {
    console.error("[webhook/whatsapp] META_APP_SECRET não configurado.");
    // Responde 200 mesmo assim para não acumular retries da Meta;
    // o erro real fica registrado no log do servidor (Vercel).
    return NextResponse.json({ received: true }, { status: 200 });
  }

  const isValidSignature = verifyMetaSignature(rawBody, signature, appSecret);
  if (!isValidSignature) {
    console.warn("[webhook/whatsapp] Assinatura inválida — payload rejeitado.");
    return new NextResponse("Invalid signature", { status: 401 });
  }

  let payload: WhatsAppWebhookPayload;
  try {
    payload = JSON.parse(rawBody);
  } catch {
    return new NextResponse("Invalid JSON", { status: 400 });
  }

  const supabase = createSupabaseServiceClient();

  // Extrai uma dedupe_key por evento. Mensagens usam o wa_message_id (id único
  // e estável da Meta). Status updates usam id da mensagem + status, porque a
  // Meta pode reenviar o mesmo status mais de uma vez.
  const entries = payload.entry ?? [];

  for (const entry of entries) {
    for (const change of entry.changes ?? []) {
      const value = change.value;

      for (const message of value.messages ?? []) {
        const dedupeKey = `message:${message.id}`;
        await recordAndMaybeProcessEvent({
          supabase,
          dedupeKey,
          eventType: "message",
          payload: { entry_id: entry.id, change, message },
        });
      }

      for (const status of value.statuses ?? []) {
        const dedupeKey = `status:${status.id}:${status.status}`;
        await recordAndMaybeProcessEvent({
          supabase,
          dedupeKey,
          eventType: "status",
          payload: { entry_id: entry.id, change, status },
        });
      }
    }
  }

  // A Meta espera 200 rapidamente (em até alguns segundos) ou re-envia o evento.
  // O processamento (contato, conversa, bot) roda via after() — ver abaixo.
  return NextResponse.json({ received: true }, { status: 200 });
}

async function recordAndMaybeProcessEvent(params: {
  supabase: ReturnType<typeof createSupabaseServiceClient>;
  dedupeKey: string;
  eventType: "message" | "status";
  payload: Record<string, unknown>;
}) {
  const { supabase, dedupeKey, eventType, payload } = params;

  // Idempotência: dedupe_key é UNIQUE — um insert conflitante é simplesmente
  // ignorado, garantindo que o mesmo wa_message_id nunca seja processado 2x,
  // mesmo se a Meta reenviar o webhook (retry por timeout, etc).
  const { data: inserted, error } = await supabase
    .from("webhook_events")
    .insert({
      dedupe_key: dedupeKey,
      event_type: eventType,
      payload,
      processed: false,
    })
    .select("id, event_type, payload")
    .single();

  if (error) {
    // code 23505 = unique_violation -> evento duplicado, ignorar silenciosamente
    if (error.code === "23505") {
      console.info(`[webhook/whatsapp] Evento duplicado ignorado: ${dedupeKey}`);
      return;
    }
    console.error("[webhook/whatsapp] Falha ao registrar webhook_event:", error);
    return;
  }

  // Processa depois de responder 200 à Meta (não atrasa a resposta).
  after(() => processWebhookEvent(supabase, inserted as WebhookEventRow));
}
