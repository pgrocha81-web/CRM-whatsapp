/**
 * Google Calendar via conta de serviço (service account) — sem login interativo,
 * funciona 24/7 no servidor. Setup em docs/INTEGRACOES.md:
 *   1. Criar service account no Google Cloud e ativar a Calendar API
 *   2. Compartilhar a agenda da Koala com o e-mail da service account
 *      ("Fazer alterações nos eventos")
 * Sem dependência externa: o JWT é assinado com node:crypto.
 */
import { createSign } from "node:crypto";
import { addDaysISO } from "../bot/parse";

const SCOPE = "https://www.googleapis.com/auth/calendar.events";

export function isGoogleCalendarConfigured(): boolean {
  return !!(
    process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL &&
    process.env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY &&
    process.env.GOOGLE_CALENDAR_ID
  );
}

function base64url(input: string | Buffer): string {
  return Buffer.from(input).toString("base64").replace(/=+$/, "").replace(/\+/g, "-").replace(/\//g, "_");
}

async function getAccessToken(): Promise<string> {
  const email = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL!;
  // na Vercel a chave costuma ser colada com "\n" literais
  const privateKey = process.env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY!.replace(/\\n/g, "\n");
  const now = Math.floor(Date.now() / 1000);
  const header = base64url(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const claims = base64url(
    JSON.stringify({ iss: email, scope: SCOPE, aud: "https://oauth2.googleapis.com/token", iat: now, exp: now + 3600 })
  );
  const signer = createSign("RSA-SHA256");
  signer.update(`${header}.${claims}`);
  const signature = base64url(signer.sign(privateKey));

  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion: `${header}.${claims}.${signature}`,
    }),
  });
  const json = (await res.json()) as { access_token?: string; error_description?: string; error?: string };
  if (!res.ok || !json.access_token) throw new Error(`Google OAuth: ${json.error_description ?? json.error ?? res.status}`);
  return json.access_token;
}

export interface TripEvent {
  title: string;
  description: string;
  /** yyyy-mm-dd */
  startDate: string;
  /** yyyy-mm-dd (inclusive). Sem volta = evento de 1 dia. */
  endDate: string | null;
}

/** Cria evento de dia inteiro cobrindo a viagem. Retorna o ID do evento. */
export async function createTripEvent(trip: TripEvent): Promise<string> {
  const token = await getAccessToken();
  const calendarId = encodeURIComponent(process.env.GOOGLE_CALENDAR_ID!);
  const res = await fetch(`https://www.googleapis.com/calendar/v3/calendars/${calendarId}/events`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      summary: trip.title,
      description: trip.description,
      start: { date: trip.startDate },
      // no Google, o fim de evento de dia inteiro é EXCLUSIVO → +1 dia
      end: { date: addDaysISO(trip.endDate ?? trip.startDate, 1) },
      reminders: { useDefault: false, overrides: [{ method: "popup", minutes: 7 * 24 * 60 }] },
    }),
  });
  const json = (await res.json()) as { id?: string; error?: { message?: string } };
  if (!res.ok || !json.id) throw new Error(`Google Calendar: ${json.error?.message ?? res.status}`);
  return json.id;
}
