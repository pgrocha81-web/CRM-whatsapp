import { describe, expect, it } from "vitest";
import { qualificationToOpportunity } from "../bot-runner";
import { tripSummary, type WonOpportunity } from "../won";
import { buildMessageBody, buildTemplateBody, isInsideCustomerWindow } from "../../whatsapp/send";
import { detectBrandSlug, toBotInput } from "../../whatsapp/inbound";

describe("respostas do bot → oportunidade", () => {
  it("separa adultos e crianças e marca tag de visto", () => {
    const fields = qualificationToOpportunity({
      nome: "João Silva",
      cidade: "Rio de Janeiro",
      destino_codigo: "orlando",
      destino: "Orlando / Disney",
      visto: "none",
      pessoas: 4,
      idades: [38, 35, 8, 4],
      data_ida: "2027-01-15",
      data_volta: "2027-01-25",
      orcamento: "30_50k",
      pagamento: "cartao",
    });
    expect(fields).toMatchObject({
      title: "Orlando / Disney — João Silva",
      adults_count: 2,
      children_count: 2,
      children_ages: [8, 4],
      travel_date_confidence: "exact",
      us_visa_status: "none",
      tags: ["visto"],
    });
  });

  it("sem datas = confiança unknown; Europa não guarda status de visto", () => {
    const fields = qualificationToOpportunity({ destino_codigo: "europa", visto: "all", mes_texto: undefined });
    expect(fields.travel_date_confidence).toBe("unknown");
    expect(fields.us_visa_status).toBeNull();
  });
});

describe("resumo para Calendar/Trello", () => {
  it("monta título e descrição", () => {
    const o = {
      id: "abc",
      destination: "Orlando / Disney",
      destination_code: "orlando",
      origin_city: "Rio de Janeiro",
      travel_date_estimate: "2027-01-15",
      travel_return_date: "2027-01-25",
      travelers_count: 4,
      traveler_ages: [38, 35, 8, 4],
      us_visa_status: "some",
      budget_range: "30_50k",
      payment_preference: "cartao",
      closed_value_cents: 4250000,
      contact: { id: "c", name: "João Silva", phone: "+5521999999999", whatsapp_id: "5521999999999" },
    } as unknown as WonOpportunity;
    const s = tripSummary(o, "https://app.koalaturismo.com.br/");
    expect(s.title).toBe("✈️ João Silva — Orlando / Disney");
    expect(s.description).toContain("Datas: 15/01/2027 a 25/01/2027");
    expect(s.description).toContain("idades: 38, 35, 8, 4");
    expect(s.description).toContain("Visto americano: alguns têm");
    expect(s.description).toMatch(/Valor fechado: R\$\s?42\.500,00/);
    expect(s.description).toContain("https://app.koalaturismo.com.br/oportunidades/abc");
  });
});

describe("WhatsApp", () => {
  it("monta lista e botões respeitando limites da Meta", () => {
    const list = buildMessageBody("5521", {
      type: "list",
      body: "Qual destino?",
      buttonLabel: "Ver destinos",
      options: [{ id: "eua", title: "Outros destinos nos EUA" }],
    }) as { interactive: { action: { sections: Array<{ rows: Array<{ title: string }> }> } } };
    expect(list.interactive.action.sections[0]!.rows[0]!.title.length).toBeLessThanOrEqual(24);

    const buttons = buildMessageBody("5521", {
      type: "buttons",
      body: "Visto?",
      buttons: [{ id: "a", title: "Um título grande demais pra caber" }],
    }) as { interactive: { action: { buttons: Array<{ reply: { title: string } }> } } };
    expect(buttons.interactive.action.buttons[0]!.reply.title.length).toBeLessThanOrEqual(20);
  });

  it("template com variáveis e payload de botão", () => {
    const body = buildTemplateBody("5521", {
      name: "koala_visto_vencendo",
      bodyParams: ["João", "Maria", "10/03/2027"],
      quickReplyPayloads: ["RENOVAR_VISTO:123"],
    }) as { template: { components: unknown[] } };
    expect(body.template.components).toEqual([
      { type: "body", parameters: [{ type: "text", text: "João" }, { type: "text", text: "Maria" }, { type: "text", text: "10/03/2027" }] },
      { type: "button", sub_type: "quick_reply", index: "0", parameters: [{ type: "payload", payload: "RENOVAR_VISTO:123" }] },
    ]);
  });

  it("janela de 24h", () => {
    const now = new Date("2026-09-22T16:00:00Z");
    expect(isInsideCustomerWindow("2026-09-21T17:00:00Z", now)).toBe(true);
    expect(isInsideCustomerWindow("2026-09-21T15:00:00Z", now)).toBe(false);
    expect(isInsideCustomerWindow(null, now)).toBe(false);
  });

  it("converte cliques e áudio", () => {
    expect(
      toBotInput({ id: "1", from: "55", timestamp: "0", type: "interactive", interactive: { type: "list_reply", list_reply: { id: "orlando", title: "Orlando / Disney" } } })
    ).toEqual({ kind: "choice", id: "orlando", title: "Orlando / Disney" });
    expect(toBotInput({ id: "1", from: "55", timestamp: "0", type: "button", button: { text: "Quero renovar", payload: "RENOVAR_VISTO:9" } })).toEqual({
      kind: "choice",
      id: "RENOVAR_VISTO:9",
      title: "Quero renovar",
    });
    expect(toBotInput({ id: "1", from: "55", timestamp: "0", type: "audio" })).toEqual({ kind: "audio" });
  });

  it("detecta a marca pela primeira mensagem", () => {
    expect(detectBrandSlug("Olá! Vim pelo Corrida na Disney")).toBe("corrida_na_disney");
    expect(detectBrandSlug("oi, vi no @orlandocomkoala")).toBe("orlando_com_koala");
    expect(detectBrandSlug("oi")).toBeNull();
  });
});
