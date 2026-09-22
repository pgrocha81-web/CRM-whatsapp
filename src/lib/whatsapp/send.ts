/**
 * Cliente de ENVIO da WhatsApp Cloud API.
 * Docs: https://developers.facebook.com/docs/whatsapp/cloud-api/messages
 *
 * Regra da Meta que o resto do sistema precisa respeitar:
 *  - dentro de 24h da última mensagem do cliente → texto livre, botões, listas
 *  - fora dessa janela → SOMENTE template aprovado (sendTemplate)
 */
import type { OutgoingMessage } from "../bot/types";

const GRAPH_VERSION = process.env.WHATSAPP_GRAPH_VERSION || "v23.0";

export interface SendResult {
  ok: boolean;
  waMessageId?: string;
  error?: string;
  /** Corpo exato enviado — guardado em messages.raw_payload */
  requestBody: Record<string, unknown>;
}

export const CUSTOMER_WINDOW_MS = 24 * 60 * 60 * 1000;

export function isInsideCustomerWindow(lastCustomerMessageAt: string | null, now = new Date()): boolean {
  if (!lastCustomerMessageAt) return false;
  return now.getTime() - new Date(lastCustomerMessageAt).getTime() < CUSTOMER_WINDOW_MS;
}

/** Monta o corpo da Cloud API para uma mensagem do bot (texto / botões / lista). */
export function buildMessageBody(to: string, message: OutgoingMessage): Record<string, unknown> {
  const base = { messaging_product: "whatsapp", recipient_type: "individual", to };
  switch (message.type) {
    case "text":
      return { ...base, type: "text", text: { body: message.body, preview_url: true } };
    case "buttons":
      return {
        ...base,
        type: "interactive",
        interactive: {
          type: "button",
          body: { text: message.body },
          action: {
            buttons: message.buttons.slice(0, 3).map((b) => ({
              type: "reply",
              reply: { id: b.id, title: b.title.slice(0, 20) },
            })),
          },
        },
      };
    case "list":
      return {
        ...base,
        type: "interactive",
        interactive: {
          type: "list",
          body: { text: message.body },
          action: {
            button: message.buttonLabel.slice(0, 20),
            sections: [
              {
                title: "Opções",
                rows: message.options.slice(0, 10).map((o) => ({
                  id: o.id,
                  title: o.title.slice(0, 24),
                  ...(o.description ? { description: o.description.slice(0, 72) } : {}),
                })),
              },
            ],
          },
        },
      };
  }
}

export interface TemplateParams {
  name: string;
  language?: string; // pt_BR
  /** Valores das variáveis {{1}}, {{2}}... do corpo do template, na ordem. */
  bodyParams: string[];
  /** Payload de cada botão de resposta rápida do template (na ordem), ex.: "RENOVAR_VISTO:<id>". */
  quickReplyPayloads?: string[];
}

export function buildTemplateBody(to: string, t: TemplateParams): Record<string, unknown> {
  return {
    messaging_product: "whatsapp",
    to,
    type: "template",
    template: {
      name: t.name,
      language: { code: t.language ?? "pt_BR" },
      components: [
        ...(t.bodyParams.length
          ? [{ type: "body", parameters: t.bodyParams.map((text) => ({ type: "text", text })) }]
          : []),
        ...(t.quickReplyPayloads ?? []).map((payload, index) => ({
          type: "button",
          sub_type: "quick_reply",
          index: String(index),
          parameters: [{ type: "payload", payload }],
        })),
      ],
    },
  };
}

async function post(body: Record<string, unknown>): Promise<SendResult> {
  const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID;
  const token = process.env.WHATSAPP_ACCESS_TOKEN;
  if (!phoneNumberId || !token) {
    return { ok: false, error: "WHATSAPP_PHONE_NUMBER_ID / WHATSAPP_ACCESS_TOKEN não configurados", requestBody: body };
  }
  try {
    const res = await fetch(`https://graph.facebook.com/${GRAPH_VERSION}/${phoneNumberId}/messages`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const json = (await res.json().catch(() => ({}))) as {
      messages?: Array<{ id: string }>;
      error?: { message?: string; code?: number };
    };
    if (!res.ok) {
      return { ok: false, error: `${res.status} ${json.error?.code ?? ""} ${json.error?.message ?? ""}`.trim(), requestBody: body };
    }
    return { ok: true, waMessageId: json.messages?.[0]?.id, requestBody: body };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err), requestBody: body };
  }
}

export function sendMessage(to: string, message: OutgoingMessage): Promise<SendResult> {
  return post(buildMessageBody(to, message));
}

export function sendTemplate(to: string, template: TemplateParams): Promise<SendResult> {
  return post(buildTemplateBody(to, template));
}

/** Texto legível de uma mensagem do bot, para gravar em messages.content. */
export function messagePreview(message: OutgoingMessage): string {
  switch (message.type) {
    case "text":
      return message.body;
    case "buttons":
      return `${message.body}\n[${message.buttons.map((b) => b.title).join("] [")}]`;
    case "list":
      return `${message.body}\n${message.options.map((o, i) => `${i + 1}. ${o.title}`).join("\n")}`;
  }
}
