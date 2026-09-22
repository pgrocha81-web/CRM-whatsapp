/**
 * Tipos mínimos do payload de webhook da WhatsApp Cloud API.
 * Referência: https://developers.facebook.com/docs/whatsapp/cloud-api/webhooks/payload-examples
 * Cobre apenas os campos usados hoje — expandir conforme novos tipos de mensagem
 * forem suportados (a API tem muitos campos opcionais).
 */

export interface WhatsAppWebhookPayload {
  object: string; // "whatsapp_business_account"
  entry: WhatsAppEntry[];
}

export interface WhatsAppEntry {
  id: string; // WABA ID
  changes: WhatsAppChange[];
}

export interface WhatsAppChange {
  field: string; // "messages"
  value: {
    messaging_product: "whatsapp";
    metadata: {
      display_phone_number: string;
      phone_number_id: string;
    };
    contacts?: Array<{
      profile: { name: string };
      wa_id: string;
    }>;
    messages?: WhatsAppInboundMessage[];
    statuses?: WhatsAppStatusUpdate[];
  };
}

export interface WhatsAppInboundMessage {
  id: string; // wa_message_id — usado para idempotência
  from: string; // telefone do remetente (sem "+")
  timestamp: string; // unix epoch em segundos, string
  type:
    | "text"
    | "image"
    | "document"
    | "audio"
    | "video"
    | "location"
    | "button"
    | "interactive"
    | "sticker"
    | "unknown";
  text?: { body: string };
  image?: { id: string; mime_type: string; caption?: string };
  document?: { id: string; mime_type: string; filename?: string; caption?: string };
  audio?: { id: string; mime_type: string };
  video?: { id: string; mime_type: string; caption?: string };
  location?: { latitude: number; longitude: number; name?: string; address?: string };
  button?: { text: string; payload: string };
  interactive?: {
    type: "button_reply" | "list_reply" | string;
    button_reply?: { id: string; title: string };
    list_reply?: { id: string; title: string; description?: string };
  };
  /** Presente quando o cliente clicou num anúncio "clique para WhatsApp" */
  referral?: { source_url?: string; source_type?: string; headline?: string };
}

export interface WhatsAppStatusUpdate {
  id: string; // wa_message_id da mensagem enviada por nós
  status: "sent" | "delivered" | "read" | "failed";
  timestamp: string;
  recipient_id: string;
  errors?: Array<{ code: number; title: string; message: string }>;
}
