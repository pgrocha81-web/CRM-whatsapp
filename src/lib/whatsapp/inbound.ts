import type { BotInput } from "../bot/types";
import type { WhatsAppInboundMessage } from "./types";

/** Converte uma mensagem recebida da Meta no formato que o bot entende. */
export function toBotInput(message: WhatsAppInboundMessage): BotInput {
  switch (message.type) {
    case "text":
      return { kind: "text", text: message.text?.body ?? "" };
    case "interactive": {
      const reply = message.interactive?.button_reply ?? message.interactive?.list_reply;
      return reply ? { kind: "choice", id: reply.id, title: reply.title } : { kind: "unsupported" };
    }
    case "button":
      // botão de resposta rápida de TEMPLATE (ex.: "Quero renovar")
      return message.button
        ? { kind: "choice", id: message.button.payload, title: message.button.text }
        : { kind: "unsupported" };
    case "audio":
      return { kind: "audio" };
    default:
      return { kind: "unsupported" };
  }
}

/** Texto legível para gravar em messages.content. */
export function inboundPreview(message: WhatsAppInboundMessage): string | null {
  switch (message.type) {
    case "text":
      return message.text?.body ?? null;
    case "interactive":
      return message.interactive?.button_reply?.title ?? message.interactive?.list_reply?.title ?? null;
    case "button":
      return message.button?.text ?? null;
    case "image":
      return message.image?.caption ?? null;
    case "video":
      return message.video?.caption ?? null;
    case "document":
      return message.document?.caption ?? message.document?.filename ?? null;
    case "location":
      return message.location?.name ?? message.location?.address ?? null;
    default:
      return null;
  }
}

const KNOWN_TYPES = new Set([
  "text", "image", "document", "audio", "video", "location", "button", "interactive", "sticker",
]);

export function dbMessageType(message: WhatsAppInboundMessage): string {
  return KNOWN_TYPES.has(message.type) ? message.type : "unknown";
}

/**
 * Marca de origem pela 1ª mensagem. Use links wa.me com texto pré-preenchido:
 *   Corrida na Disney → "Olá! Vim pelo Corrida na Disney"
 *   Orlando com Koala → "Olá! Vim pelo Orlando com Koala"
 */
export function detectBrandSlug(firstText: string | null): string | null {
  if (!firstText) return null;
  const n = firstText.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
  if (/corrida na disney|rundisney|run disney|corridanadisney/.test(n)) return "corrida_na_disney";
  if (/orlando com koala|orlandocomkoala/.test(n)) return "orlando_com_koala";
  return null;
}

/** "5522999999999" -> "+5522999999999" */
export function toE164(waId: string): string {
  return waId.startsWith("+") ? waId : `+${waId}`;
}
