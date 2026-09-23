import { describe, expect, it } from "vitest";
import { checkTravelerDocuments, expiryState, isTripReminderDue } from "../rules";

const today = "2026-09-22";

describe("aviso de 1 semana", () => {
  it("dispara de 5 a 7 dias antes", () => {
    expect(isTripReminderDue("2026-09-29", today)).toBe(true); // 7 dias
    expect(isTripReminderDue("2026-09-27", today)).toBe(true); // 5 dias (rotina falhou)
    expect(isTripReminderDue("2026-09-30", today)).toBe(false); // 8 dias
    expect(isTripReminderDue("2026-09-26", today)).toBe(false); // 4 dias
    expect(isTripReminderDue(null, today)).toBe(false);
  });
});

describe("vencimentos", () => {
  it("classifica janela de 6 meses", () => {
    expect(expiryState("2027-03-22", today)).toBe("expiring");
    expect(expiryState("2027-03-23", today)).toBe("ok");
    expect(expiryState("2026-09-10", today)).toBe("expired_recent");
    expect(expiryState("2026-01-01", today)).toBe("expired_old");
    expect(expiryState(null, today)).toBeNull();
  });
});

describe("documentos x viagem", () => {
  const traveler = {
    name: "João",
    passportExpiresOn: "2030-01-01",
    hasPassport: true,
    usVisaExpiresOn: "2034-01-01",
    hasUSVisa: true,
  };

  it("tudo certo = sem alerta", () => {
    expect(checkTravelerDocuments({ destinationCode: "orlando", departure: "2027-01-10", returnDate: "2027-01-20" }, traveler)).toEqual([]);
  });

  it("visto vence durante a viagem = bloqueio", () => {
    const issues = checkTravelerDocuments(
      { destinationCode: "orlando", departure: "2027-01-10", returnDate: "2027-01-20" },
      { ...traveler, usVisaExpiresOn: "2027-01-15" }
    );
    expect(issues).toHaveLength(1);
    expect(issues[0]).toMatchObject({ document: "us_visa", severity: "blocker" });
    expect(issues[0]!.message).toContain("15/01/2027");
  });

  it("sem visto para os EUA = bloqueio; visto não informado = sem alerta ainda", () => {
    const trip = { destinationCode: "eua", departure: "2027-01-10", returnDate: null };
    expect(checkTravelerDocuments(trip, { ...traveler, usVisaExpiresOn: null, hasUSVisa: false })[0]?.severity).toBe("blocker");
    expect(checkTravelerDocuments(trip, { ...traveler, usVisaExpiresOn: null, hasUSVisa: null })).toEqual([]);
  });

  it("EUA: brasileiro não precisa dos 6 meses de passaporte", () => {
    const issues = checkTravelerDocuments(
      { destinationCode: "orlando", departure: "2027-01-10", returnDate: "2027-01-20" },
      { ...traveler, passportExpiresOn: "2027-02-01" }
    );
    expect(issues).toEqual([]);
  });

  it("Europa: passaporte com menos de 6 meses na ida = aviso", () => {
    const issues = checkTravelerDocuments(
      { destinationCode: "europa", departure: "2027-01-10", returnDate: "2027-01-20" },
      { ...traveler, passportExpiresOn: "2027-05-01" }
    );
    expect(issues).toHaveLength(1);
    expect(issues[0]).toMatchObject({ document: "passport", severity: "warning" });
  });

  it("passaporte vence antes da volta = bloqueio (e cruzeiro vira aviso)", () => {
    const t = { ...traveler, passportExpiresOn: "2027-01-15" };
    expect(checkTravelerDocuments({ destinationCode: "europa", departure: "2027-01-10", returnDate: "2027-01-20" }, t)[0]?.severity).toBe("blocker");
    expect(checkTravelerDocuments({ destinationCode: "cruzeiro", departure: "2027-01-10", returnDate: "2027-01-20" }, t)[0]?.severity).toBe("warning");
  });
});
