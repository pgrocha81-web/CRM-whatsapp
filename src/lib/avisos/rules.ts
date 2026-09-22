/**
 * Regras (puras) dos avisos automáticos:
 *  - viagem daqui a 1 semana
 *  - passaporte / visto americano vencendo em até 6 meses
 *  - documento que vence antes ou durante a viagem (conflito → alerta para a equipe)
 */
import { addDaysISO, addMonthsISO, formatBR } from "../bot/parse";

export const TRIP_REMINDER_DAYS = 7;
/** Se a rotina falhar alguns dias, ainda manda até 5 dias antes (o texto diz "1 semana"). */
export const TRIP_REMINDER_MIN_DAYS = 5;
export const EXPIRY_WINDOW_MONTHS = 6;
/** Documento vencido há mais que isso não gera mensagem ao cliente (evita spam ao importar base antiga). */
export const EXPIRED_GRACE_DAYS = 30;

/** Viagem entra no aviso quando faltam de 5 a 7 dias (tolera rotina que falhou alguns dias). */
export function isTripReminderDue(travelDate: string | null, today: string): boolean {
  if (!travelDate) return false;
  return travelDate >= addDaysISO(today, TRIP_REMINDER_MIN_DAYS) && travelDate <= addDaysISO(today, TRIP_REMINDER_DAYS);
}

export type ExpiryState = "ok" | "expiring" | "expired_recent" | "expired_old";

export function expiryState(expiresOn: string | null, today: string): ExpiryState | null {
  if (!expiresOn) return null;
  if (expiresOn < addDaysISO(today, -EXPIRED_GRACE_DAYS)) return "expired_old";
  if (expiresOn < today) return "expired_recent";
  if (expiresOn <= addMonthsISO(today, EXPIRY_WINDOW_MONTHS)) return "expiring";
  return "ok";
}

export interface TripForCheck {
  destinationCode: string | null;
  departure: string | null;
  returnDate: string | null;
}

export interface TravelerForCheck {
  name: string;
  passportExpiresOn: string | null;
  hasPassport: boolean | null;
  usVisaExpiresOn: string | null;
  hasUSVisa: boolean | null;
}

export interface DocumentIssue {
  document: "passport" | "us_visa";
  severity: "blocker" | "warning";
  message: string;
}

/**
 * Confere os documentos de um viajante para uma viagem.
 * EUA/Orlando: passaporte válido até a volta + visto americano válido até a volta
 *   (brasileiros são isentos da regra dos 6 meses nos EUA).
 * Europa/outros: passaporte com pelo menos 6 meses de validade na data de ida
 *   (exigência de muitos países — a equipe confirma caso a caso).
 * Cruzeiro: roteiros só no Brasil não exigem passaporte → vira aviso, não bloqueio.
 */
export function checkTravelerDocuments(trip: TripForCheck, t: TravelerForCheck): DocumentIssue[] {
  const issues: DocumentIssue[] = [];
  if (!trip.departure) return issues;
  const endOfTrip = trip.returnDate ?? trip.departure;
  const isUS = trip.destinationCode === "orlando" || trip.destinationCode === "eua";
  const isCruise = trip.destinationCode === "cruzeiro";
  const passportSeverity = isCruise ? "warning" : "blocker";

  if (!t.passportExpiresOn) {
    if (t.hasPassport === false) {
      issues.push({
        document: "passport",
        severity: passportSeverity,
        message: `${t.name} não tem passaporte${isCruise ? " (confirmar se o roteiro exige)" : ""}.`,
      });
    }
    // null + hasPassport desconhecido = ainda não informado; não é conflito
  } else if (t.passportExpiresOn < endOfTrip) {
    issues.push({
      document: "passport",
      severity: passportSeverity,
      message: `Passaporte de ${t.name} vence em ${formatBR(t.passportExpiresOn)}, antes do fim da viagem (${formatBR(endOfTrip)}).`,
    });
  } else if (!isUS && t.passportExpiresOn < addMonthsISO(trip.departure, 6)) {
    issues.push({
      document: "passport",
      severity: "warning",
      message: `Passaporte de ${t.name} vence em ${formatBR(t.passportExpiresOn)} — menos de 6 meses de validade na ida (${formatBR(trip.departure)}). Confirmar a exigência do destino.`,
    });
  }

  if (isUS) {
    if (!t.usVisaExpiresOn) {
      if (t.hasUSVisa === false) {
        issues.push({ document: "us_visa", severity: "blocker", message: `${t.name} não tem visto americano.` });
      }
    } else if (t.usVisaExpiresOn < endOfTrip) {
      issues.push({
        document: "us_visa",
        severity: "blocker",
        message: `Visto americano de ${t.name} vence em ${formatBR(t.usVisaExpiresOn)}, antes do fim da viagem (${formatBR(endOfTrip)}).`,
      });
    }
  }
  return issues;
}
