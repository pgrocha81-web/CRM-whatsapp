import { describe, expect, it } from "vitest";
import { handleQualification, startQualification, budgetFromText, type QualificationStep } from "../qualificacao";
import type { BotContext, BotInput, QualificationAnswers, StepResult } from "../types";

// terça-feira 22/09/2026, 13h em São Paulo (horário comercial)
const NOW = new Date("2026-09-22T16:00:00Z");
const ctx: BotContext = { now: NOW, attendantName: "Piero", promoGroupUrl: "https://chat.whatsapp.com/abc" };

const t = (text: string): BotInput => ({ kind: "text", text });
const pick = (id: string, title = id): BotInput => ({ kind: "choice", id, title });

/** Roda uma sequência de respostas a partir do início. */
function run(inputs: BotInput[], context: BotContext = ctx) {
  let r: StepResult<QualificationAnswers> = startQualification(context);
  const all = [r];
  for (const input of inputs) {
    r = handleQualification({ step: r.step as QualificationStep, answers: r.answers }, input, context);
    all.push(r);
  }
  return { last: r, all };
}

describe("roteiro de qualificação", () => {
  it("começa com boas-vindas + pergunta do nome", () => {
    const r = startQualification(ctx);
    expect(r.step).toBe("nome");
    expect(r.messages).toHaveLength(2);
    expect(r.messages[0]).toMatchObject({ type: "text" });
    expect((r.messages[0] as { body: string }).body).toContain("Sou o Piero, da Koala Turismo");
    expect((r.messages[0] as { body: string }).body).toContain("não ouvimos áudio");
  });

  it("fluxo completo Orlando com datas exatas", () => {
    const { last, all } = run([
      t("meu nome é joão da silva"),
      t("Rio de Janeiro"),
      pick("orlando", "Orlando / Disney"),
      pick("some", "Alguns têm"),
      t("4"),
      t("38, 35, 8 e 4"),
      pick("exatas", "Datas definidas"),
      t("15/01/2027"),
      t("25/01/2027"),
      pick("30_50k", "R$ 30 a 50 mil"),
      pick("cartao", "Cartão parcelado"),
    ]);
    expect(all.map((r) => r.step)).toEqual([
      "nome", "cidade", "destino", "visto", "pessoas", "idades", "datas", "data_ida", "data_volta", "orcamento", "pagamento", "fim",
    ]);
    expect(last.status).toBe("completed");
    expect(last.answers).toMatchObject({
      nome: "João da Silva",
      cidade: "Rio de Janeiro",
      destino_codigo: "orlando",
      destino: "Orlando / Disney",
      visto: "some",
      pessoas: 4,
      idades: [38, 35, 8, 4],
      data_ida: "2027-01-15",
      data_volta: "2027-01-25",
      orcamento: "30_50k",
      pagamento: "cartao",
    });
    const closing = (last.messages[0] as { body: string }).body;
    expect(closing).toContain("Perfeito, João!");
    expect(closing).toContain("15/01/2027 a 25/01/2027");
    expect(closing).toContain("R$ 30 a 50 mil");
    expect(closing).toContain("seg. a sex., das 9h às 18h");
    expect(closing).toContain("https://chat.whatsapp.com/abc");
  });

  it("Europa pula a pergunta de visto; 'ainda não sei' pula as datas", () => {
    const { all, last } = run([t("Ana"), t("Niterói"), pick("europa", "Europa"), t("2"), t("30 32"), pick("nao_sei"), pick("ate_15k"), pick("pix")]);
    expect(all.map((r) => r.step)).toEqual(["nome", "cidade", "destino", "pessoas", "idades", "datas", "orcamento", "pagamento", "fim"]);
    expect(last.answers.visto).toBeUndefined();
    expect((last.messages[0] as { body: string }).body).toContain("datas a definir");
  });

  it("destino digitado: 'Nova York' vira EUA e pergunta visto; 'Cancún' vira outro destino", () => {
    const ny = run([t("Ana"), t("Niterói"), t("quero ir pra Nova York")]);
    expect(ny.last.step).toBe("visto");
    expect(ny.last.answers.destino_codigo).toBe("eua");

    const cancun = run([t("Ana"), t("Niterói"), t("Cancún")]);
    expect(cancun.last.step).toBe("pessoas");
    expect(cancun.last.answers).toMatchObject({ destino_codigo: "outro", destino: "Cancún" });
  });

  it("escolher 'Outro destino' na lista pergunta qual", () => {
    const { last } = run([t("Ana"), t("Niterói"), pick("outro", "Outro destino"), t("chile")]);
    expect(last.step).toBe("pessoas");
    expect(last.answers.destino).toBe("Chile");
  });

  it("aceita o número da opção digitado", () => {
    const { last } = run([t("Ana"), t("Niterói"), t("3")]);
    expect(last.answers.destino_codigo).toBe("cruzeiro");
  });

  it("'só o mês' guarda o texto livre", () => {
    const { last } = run([t("Ana"), t("Niterói"), pick("europa"), t("2"), t("30, 32"), pick("mes"), t("julho, uns 10 dias")]);
    expect(last.step).toBe("orcamento");
    expect(last.answers.mes_texto).toBe("julho, uns 10 dias");
  });

  it("data digitada direto na pergunta de datas já conta como data de ida", () => {
    const { last } = run([t("Ana"), t("Niterói"), pick("europa"), t("2"), t("30, 32"), t("10/07/2027")]);
    expect(last.step).toBe("data_volta");
    expect(last.answers.data_ida).toBe("2027-07-10");
  });

  it("idades: pede de novo uma vez se a quantidade não bate, depois aceita", () => {
    const first = run([t("Ana"), t("Niterói"), pick("europa"), t("3"), t("30, 32")]);
    expect(first.last.step).toBe("idades");
    expect((first.last.messages[0] as { body: string }).body).toContain("Recebi 2 idades, mas são 3 pessoas");
    const second = run([t("Ana"), t("Niterói"), pick("europa"), t("3"), t("30, 32"), t("30, 32")]);
    expect(second.last.step).toBe("datas");
  });

  it("bebê em meses conta como 0", () => {
    const { last } = run([t("Ana"), t("Niterói"), pick("europa"), t("3"), t("30, 32 e 8 meses")]);
    expect(last.answers.idades).toEqual([30, 32, 0]);
  });

  it("rejeita data de volta antes da ida", () => {
    const { last } = run([t("Ana"), t("Niterói"), pick("europa"), t("2"), t("30 32"), pick("exatas"), t("20/01/2027"), t("10/01/2027")]);
    expect(last.step).toBe("data_volta");
    expect((last.messages[0] as { body: string }).body).toContain("A volta precisa ser depois da ida");
  });

  it("volta sem ano depois de ida em dezembro vai para o ano seguinte", () => {
    const { last } = run([t("Ana"), t("Niterói"), pick("europa"), t("2"), t("30 32"), pick("exatas"), t("20/12"), t("05/01")]);
    expect(last.answers.data_ida).toBe("2026-12-20");
    expect(last.answers.data_volta).toBe("2027-01-05");
  });

  it("áudio: avisa que não ouve e repete a pergunta", () => {
    const { last } = run([t("Ana"), { kind: "audio" }]);
    expect(last.step).toBe("cidade");
    expect((last.messages[0] as { body: string }).body).toContain("Não conseguimos ouvir áudio");
    expect(last.messages).toHaveLength(2);
  });

  it("'atendente' a qualquer momento passa para a equipe", () => {
    const { last } = run([t("Ana"), t("quero falar com um atendente")]);
    expect(last.status).toBe("handed_off");
  });

  it("erro em pergunta com lista reenvia a lista", () => {
    const { last } = run([t("Ana"), t("Niterói"), pick("europa"), t("2"), t("30 32"), pick("nao_sei"), t("sei lá")]);
    expect(last.step).toBe("orcamento");
    expect(last.messages.map((m) => m.type)).toEqual(["text", "list"]);
  });

  it("orçamento digitado em reais cai na faixa certa", () => {
    expect(budgetFromText("uns 20 mil")).toBe("15_30k");
    expect(budgetFromText("R$ 35.000")).toBe("30_50k");
    expect(budgetFromText("80k")).toBe("acima_50k");
    expect(budgetFromText("10000")).toBe("ate_15k");
  });

  it("lead do Corrida na Disney recebe a pergunta da prova runDisney", () => {
    const corrida = { ...ctx, brandSlug: "corrida_na_disney" };
    const { last, all } = run(
      [t("Ana"), t("Niterói"), pick("orlando"), pick("all"), t("1"), t("40"), pick("nao_sei"), pick("15_30k"), pick("pix"), t("Meia maratona Disney Princess")],
      corrida
    );
    expect(all.at(-2)!.step).toBe("rundisney");
    expect(last.status).toBe("completed");
    expect(last.answers.rundisney).toBe("Meia maratona Disney Princess");
  });

  it("fora do horário, o encerramento avisa o próximo dia útil", () => {
    const sabado = { ...ctx, now: new Date("2026-09-26T15:00:00Z") };
    const { last } = run([t("Ana"), t("Niterói"), pick("europa"), t("1"), t("30"), pick("nao_sei"), pick("ate_15k"), pick("pix")], sabado);
    expect((last.messages[0] as { body: string }).body).toContain("fora do horário");
  });
});
