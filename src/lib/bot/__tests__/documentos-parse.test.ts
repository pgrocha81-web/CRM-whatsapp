import { describe, expect, it } from "vitest";
import { handleDocuments, startDocuments, type DocumentsStep } from "../documentos";
import {
  addMonthsISO,
  isBusinessHours,
  matchChoice,
  parseAges,
  parseExpiryDate,
  parsePeopleCount,
  parseTravelDate,
  todayISO,
} from "../parse";
import type { BotContext, BotInput, DocumentsAnswers, StepResult } from "../types";

const NOW = new Date("2026-09-22T16:00:00Z");
const ctx: BotContext = { now: NOW, attendantName: "Piero" };
const t = (text: string): BotInput => ({ kind: "text", text });

describe("parse", () => {
  it("hoje no fuso de São Paulo (23h de SP ainda é o mesmo dia)", () => {
    expect(todayISO(new Date("2026-09-23T02:30:00Z"))).toBe("2026-09-22");
  });

  it("datas de viagem", () => {
    expect(parseTravelDate("15/01/2027", NOW)).toBe("2027-01-15");
    expect(parseTravelDate("15/01/27", NOW)).toBe("2027-01-15");
    expect(parseTravelDate("15/01", NOW)).toBe("2027-01-15"); // já passou este ano → próximo
    expect(parseTravelDate("10/12", NOW)).toBe("2026-12-10");
    expect(parseTravelDate("dia 5 de março", NOW)).toBe("2027-03-05");
    expect(parseTravelDate("31/02/2027", NOW)).toBeNull();
    expect(parseTravelDate("amanhã", NOW)).toBeNull();
  });

  it("datas de vencimento exigem ano e aceitam mês/ano", () => {
    expect(parseExpiryDate("15/03/2030")).toBe("2030-03-15");
    expect(parseExpiryDate("03/2030")).toBe("2030-03-01");
    expect(parseExpiryDate("março de 2030")).toBe("2030-03-01");
    expect(parseExpiryDate("15/03")).toBeNull();
  });

  it("pessoas e idades", () => {
    expect(parsePeopleCount("somos 4")).toBe(4);
    expect(parsePeopleCount("duas")).toBe(2);
    expect(parsePeopleCount("casal")).toBe(2);
    expect(parsePeopleCount("zero")).toBeNull();
    expect(parseAges("38 anos, 35, 8 e 1 ano")).toEqual([38, 35, 8, 1]);
  });

  it("escolhas por sinônimo sem confundir palavras parecidas", () => {
    const opts = [
      { id: "a", title: "Todos têm", synonyms: ["todos", "sim"] },
      { id: "b", title: "Ninguém tem", synonyms: ["nao"] },
    ];
    expect(matchChoice({ kind: "text", text: "Sim, todos" }, opts)).toBe("a");
    expect(matchChoice({ kind: "text", text: "não" }, opts)).toBe("b");
    expect(matchChoice({ kind: "text", text: "simples" }, opts)).toBeNull();
  });

  it("horário comercial: seg-sex 9h-18h de São Paulo", () => {
    expect(isBusinessHours(new Date("2026-09-22T12:00:00Z"))).toBe(true); // ter 9h
    expect(isBusinessHours(new Date("2026-09-22T11:59:00Z"))).toBe(false); // ter 8h59
    expect(isBusinessHours(new Date("2026-09-22T21:00:00Z"))).toBe(false); // ter 18h
    expect(isBusinessHours(new Date("2026-09-27T15:00:00Z"))).toBe(false); // domingo
  });

  it("soma de meses respeita fim de mês", () => {
    expect(addMonthsISO("2026-08-31", 6)).toBe("2027-02-28");
  });
});

describe("fluxo de documentos", () => {
  function run(inputs: BotInput[], travelersCount = 2, askUSVisa = true) {
    let r: StepResult<DocumentsAnswers> = startDocuments({ travelersCount, askUSVisa });
    for (const input of inputs) {
      r = handleDocuments({ step: r.step as DocumentsStep, answers: r.answers }, input, ctx);
    }
    return r;
  }

  it("pede nome, passaporte e visto de cada viajante", () => {
    const r = run([
      t("joão da silva"),
      t("15/03/2030"),
      t("10/08/2034"),
      t("Maria Souza"),
      { kind: "choice", id: "sem_passaporte", title: "Não tem passaporte" },
      t("não tem"),
    ]);
    expect(r.status).toBe("completed");
    expect(r.answers.viajantes).toEqual([
      { nome: "João da Silva", passaporte: "2030-03-15", visto: "2034-08-10" },
      { nome: "Maria Souza", passaporte: null, visto: null },
    ]);
    expect((r.messages[0] as { body: string }).body).toContain("João da Silva — passaporte: 15/03/2030 · visto: 10/08/2034");
  });

  it("destino fora dos EUA não pergunta visto", () => {
    const r = run([t("Ana Lima"), t("01/01/2031")], 1, false);
    expect(r.status).toBe("completed");
    expect(r.answers.viajantes[0]).toEqual({ nome: "Ana Lima", passaporte: "2031-01-01" });
  });

  it("exige nome e sobrenome e data válida", () => {
    expect(run([t("Ana")]).step).toBe("doc_nome");
    const r = run([t("Ana Lima"), t("logo logo")]);
    expect(r.step).toBe("doc_passaporte");
    expect(r.messages.map((m) => m.type)).toEqual(["text", "buttons"]);
  });
});
