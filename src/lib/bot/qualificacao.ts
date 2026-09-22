/**
 * Fluxo 1 — Qualificação do lead (roteiro aprovado pelo Piero em 22/09/2026).
 * Uma pergunta por mensagem; onde dá, botão ou lista.
 *
 * Ordem: nome → cidade → destino → [qual destino] → [visto, se EUA] → pessoas
 *        → idades → datas → [ida → volta | mês] → orçamento → pagamento
 *        → [prova runDisney, se veio do Corrida na Disney] → encerramento
 *
 * Os textos ficam todos neste arquivo para facilitar ajustes.
 */
import {
  formatBR,
  isBusinessHours,
  matchChoice,
  normalize,
  parseAges,
  parsePeopleCount,
  parseTravelDate,
  titleCase,
  todayISO,
  wantsHuman,
  type ChoiceSpec,
} from "./parse";
import type {
  BotContext,
  BotInput,
  BudgetRange,
  DatesKind,
  DestinationCode,
  OutgoingMessage,
  PaymentPreference,
  QualificationAnswers,
  StepResult,
  VisaStatus,
} from "./types";

export type QualificationStep =
  | "nome"
  | "cidade"
  | "destino"
  | "destino_outro"
  | "visto"
  | "pessoas"
  | "idades"
  | "datas"
  | "data_ida"
  | "data_volta"
  | "mes"
  | "orcamento"
  | "pagamento"
  | "rundisney"
  | "fim";

// ------------------------------------------------------------
// Opções
// ------------------------------------------------------------
export const DESTINATIONS: ChoiceSpec<DestinationCode>[] = [
  { id: "orlando", title: "Orlando / Disney", synonyms: ["orlando", "disney", "universal", "epic universe", "seaworld", "rundisney"] },
  {
    id: "eua",
    title: "Outros destinos nos EUA",
    synonyms: ["eua", "estados unidos", "usa", "nova york", "new york", "ny", "miami", "las vegas", "california", "los angeles", "chicago", "boston", "washington", "san francisco", "texas", "havai"],
  },
  { id: "cruzeiro", title: "Cruzeiro", synonyms: ["cruzeiro", "navio", "msc", "costa cruzeiros", "royal caribbean"] },
  {
    id: "europa",
    title: "Europa",
    synonyms: ["europa", "portugal", "lisboa", "paris", "franca", "italia", "roma", "espanha", "madri", "londres", "inglaterra", "alemanha", "suica", "grecia"],
  },
  { id: "outro", title: "Outro destino" },
];

const VISA: ChoiceSpec<VisaStatus>[] = [
  { id: "all", title: "Todos têm", synonyms: ["todos", "sim", "temos", "tenho", "ja temos", "ja tenho"] },
  { id: "some", title: "Alguns têm", synonyms: ["alguns", "algumas", "nem todos", "parte"] },
  { id: "none", title: "Ninguém tem", synonyms: ["ninguem", "nao", "nenhum", "nao temos", "nao tenho"] },
];

const DATES: ChoiceSpec<DatesKind>[] = [
  { id: "exatas", title: "Datas definidas", synonyms: ["sim", "definidas", "ja tenho", "tenho"] },
  { id: "mes", title: "Só o mês", synonyms: ["mes", "so o mes", "mais ou menos"] },
  { id: "nao_sei", title: "Ainda não sei", synonyms: ["nao sei", "nao", "ainda nao", "sem data"] },
];

export const BUDGETS: ChoiceSpec<BudgetRange>[] = [
  { id: "ate_15k", title: "Até R$ 15 mil" },
  { id: "15_30k", title: "R$ 15 a 30 mil" },
  { id: "30_50k", title: "R$ 30 a 50 mil" },
  { id: "acima_50k", title: "Acima de R$ 50 mil" },
  { id: "nao_sei", title: "Ainda não sei", synonyms: ["nao sei", "nao tenho ideia", "depende"] },
];

export const PAYMENTS: ChoiceSpec<PaymentPreference>[] = [
  { id: "pix", title: "PIX à vista", synonyms: ["pix", "a vista", "avista", "dinheiro", "transferencia"] },
  { id: "cartao", title: "Cartão parcelado", synonyms: ["cartao", "parcelado", "credito", "parcelar"] },
  { id: "entrada_parcelas", title: "Entrada + parcelas", synonyms: ["entrada", "boleto"] },
  { id: "ver_opcoes", title: "Quero ver as opções", synonyms: ["opcoes", "tanto faz", "nao sei", "ver"] },
];

export function isUSDestination(code: DestinationCode | undefined): boolean {
  return code === "orlando" || code === "eua";
}

// ------------------------------------------------------------
// Perguntas
// ------------------------------------------------------------
export function askQualification(step: QualificationStep, a: QualificationAnswers, ctx: BotContext): OutgoingMessage[] {
  const nome = a.nome?.split(" ")[0] ?? "";
  switch (step) {
    case "nome":
      return [{ type: "text", body: "Pra começar: qual é o seu nome?" }];
    case "cidade":
      return [{ type: "text", body: `Prazer, ${nome}! 😊 De qual cidade vocês vão sair?` }];
    case "destino":
      return [
        {
          type: "list",
          body: "Qual destino vocês querem conhecer?",
          buttonLabel: "Ver destinos",
          options: DESTINATIONS.map(({ id, title }) => ({ id, title })),
        },
      ];
    case "destino_outro":
      return [{ type: "text", body: "Legal! Qual destino? ✈️" }];
    case "visto":
      return [
        {
          type: "buttons",
          body: "Vocês já têm visto americano válido?",
          buttons: VISA.map(({ id, title }) => ({ id, title })),
        },
      ];
    case "pessoas":
      return [{ type: "text", body: "Quantas pessoas vão viajar, contando com você?" }];
    case "idades":
      return [
        {
          type: "text",
          body:
            a.pessoas === 1
              ? "Qual a sua idade?"
              : "Qual a idade de cada uma? (ex.: 38, 35, 8, 4)" +
                (a.destino_codigo === "orlando" ? "\n_Na Disney a idade muda o preço do ingresso, por isso pergunto_ 😉" : ""),
        },
      ];
    case "datas":
      return [
        {
          type: "buttons",
          body: "Vocês já têm as datas da viagem?",
          buttons: DATES.map(({ id, title }) => ({ id, title })),
        },
      ];
    case "data_ida":
      return [{ type: "text", body: "Qual a data de ida? (ex.: 15/01/2027)" }];
    case "data_volta":
      return [{ type: "text", body: "E a data de volta?" }];
    case "mes":
      return [{ type: "text", body: "Qual mês e por quantos dias, mais ou menos? (ex.: julho, uns 10 dias)" }];
    case "orcamento":
      return [
        {
          type: "list",
          body: "Quanto vocês pensam em investir no pacote, para o grupo todo?",
          buttonLabel: "Ver faixas",
          options: BUDGETS.map(({ id, title }) => ({ id, title })),
        },
      ];
    case "pagamento":
      return [
        {
          type: "list",
          body: "Qual forma de pagamento é melhor pra vocês?",
          buttonLabel: "Ver opções",
          options: PAYMENTS.map(({ id, title }) => ({ id, title })),
        },
      ];
    case "rundisney":
      return [{ type: "text", body: "Vai correr alguma prova runDisney? 🏃 Qual? (se não, responda \"não\")" }];
    case "fim":
      return [closingMessage(a, ctx)];
  }
}

function welcome(ctx: BotContext): OutgoingMessage {
  return {
    type: "text",
    body:
      `Olá! Sou o ${ctx.attendantName}, da Koala Turismo 🐨\n` +
      "Vou te fazer umas perguntas rápidas pra montar sua cotação, leva uns 2 minutinhos.\n\n" +
      "🔇 Por aqui não ouvimos áudio nem atendemos ligação, tá? Só texto 😉",
  };
}

export function datesSummary(a: QualificationAnswers): string {
  if (a.data_ida && a.data_volta) return `${formatBR(a.data_ida)} a ${formatBR(a.data_volta)}`;
  if (a.data_ida) return `ida ${formatBR(a.data_ida)}`;
  if (a.mes_texto) return a.mes_texto;
  return "datas a definir";
}

export function budgetLabel(id: BudgetRange | undefined): string {
  return BUDGETS.find((b) => b.id === id)?.title ?? "a definir";
}

function closingMessage(a: QualificationAnswers, ctx: BotContext): OutgoingMessage {
  const nome = a.nome?.split(" ")[0] ?? "";
  const hours = isBusinessHours(ctx.now)
    ? "Já passei sua cotação pro nosso time. Respondemos de seg. a sex., das 9h às 18h."
    : "Recebemos fora do horário, te respondemos no próximo dia útil a partir das 9h. 🌙";
  const promo = ctx.promoGroupUrl
    ? `\n\nEnquanto isso, entra no nosso grupo de promoções 👉 ${ctx.promoGroupUrl}`
    : "";
  return {
    type: "text",
    body:
      `Perfeito, ${nome}! Anotei tudo:\n` +
      `📍 ${a.destino ?? "-"} · 👥 ${a.pessoas ?? "-"} ${a.pessoas === 1 ? "pessoa" : "pessoas"} · 📅 ${datesSummary(a)} · 💰 ${budgetLabel(a.orcamento)}\n\n` +
      hours +
      promo,
  };
}

// ------------------------------------------------------------
// Próximo passo (considera perguntas condicionais)
// ------------------------------------------------------------
function nextStep(current: QualificationStep, a: QualificationAnswers, ctx: BotContext): QualificationStep {
  switch (current) {
    case "nome":
      return "cidade";
    case "cidade":
      return "destino";
    case "destino":
      if (a.destino_codigo === "outro" && !a.destino) return "destino_outro";
      return isUSDestination(a.destino_codigo) ? "visto" : "pessoas";
    case "destino_outro":
      return "pessoas";
    case "visto":
      return "pessoas";
    case "pessoas":
      return "idades";
    case "idades":
      return "datas";
    case "datas":
      if (a.datas_tipo === "exatas") return a.data_ida ? "data_volta" : "data_ida";
      if (a.datas_tipo === "mes") return "mes";
      return "orcamento";
    case "data_ida":
      return "data_volta";
    case "data_volta":
    case "mes":
      return "orcamento";
    case "orcamento":
      return "pagamento";
    case "pagamento":
      return ctx.brandSlug === "corrida_na_disney" ? "rundisney" : "fim";
    case "rundisney":
    case "fim":
      return "fim";
  }
}

// ------------------------------------------------------------
// API pública
// ------------------------------------------------------------
export function startQualification(ctx: BotContext): StepResult<QualificationAnswers> {
  const answers: QualificationAnswers = {};
  return {
    step: "nome",
    answers,
    messages: [welcome(ctx), ...askQualification("nome", answers, ctx)],
    status: "active",
  };
}

type Parsed = { ok: true; answers: QualificationAnswers } | { ok: false; error: string };

export function handleQualification(
  state: { step: QualificationStep; answers: QualificationAnswers },
  input: BotInput,
  ctx: BotContext
): StepResult<QualificationAnswers> {
  const { step } = state;
  const answers = { ...state.answers };

  if (step === "fim") {
    return { step, answers, messages: [], status: "completed" };
  }

  if (input.kind === "text" && wantsHuman(input.text)) {
    return {
      step,
      answers,
      status: "handed_off",
      messages: [
        {
          type: "text",
          body: isBusinessHours(ctx.now)
            ? "Tudo bem! Já chamei alguém da equipe pra falar com você 😊"
            : "Tudo bem! Já avisei a equipe. Estamos fora do horário agora, te respondemos no próximo dia útil a partir das 9h 😊",
        },
      ],
    };
  }

  if (input.kind === "audio") {
    return {
      step,
      answers,
      status: "active",
      messages: [{ type: "text", body: "Não conseguimos ouvir áudio 🙏 Pode escrever pra mim?" }, ...askQualification(step, answers, ctx)],
    };
  }

  if (input.kind === "unsupported") {
    return { step, answers, status: "active", messages: askQualification(step, answers, ctx) };
  }

  const parsed = parseAnswer(step, input, answers, ctx);

  if (!parsed.ok) {
    const tentativas = (answers._tentativas ?? 0) + 1;
    return {
      step,
      answers: { ...answers, _tentativas: tentativas },
      status: "active",
      // texto de erro + reenvia botões/lista (texto simples não precisa repetir)
      messages: [
        { type: "text", body: parsed.error },
        ...askQualification(step, answers, ctx).filter((m) => m.type !== "text"),
      ],
    };
  }

  const updated: QualificationAnswers = { ...parsed.answers, _tentativas: 0 };
  const next = nextStep(step, updated, ctx);
  return {
    step: next,
    answers: updated,
    status: next === "fim" ? "completed" : "active",
    messages: askQualification(next, updated, ctx),
  };
}

function parseAnswer(
  step: QualificationStep,
  input: { kind: "text"; text: string } | { kind: "choice"; id: string; title: string },
  a: QualificationAnswers,
  ctx: BotContext
): Parsed {
  const text = input.kind === "text" ? input.text.trim() : input.title;
  const tentativas = a._tentativas ?? 0;

  switch (step) {
    case "nome": {
      const clean = text.replace(/^(meu nome e|meu nome é|me chamo|sou o|sou a|sou)\s+/i, "").replace(/[^\p{L}\s'-]/gu, "").trim();
      if (clean.length < 2) return { ok: false, error: "Não entendi 😅 Me diz seu nome, por favor." };
      return { ok: true, answers: { ...a, nome: titleCase(clean).slice(0, 80) } };
    }
    case "cidade": {
      if (text.length < 2) return { ok: false, error: "Me diz a cidade de onde vocês vão sair, por favor." };
      return { ok: true, answers: { ...a, cidade: titleCase(text).slice(0, 80) } };
    }
    case "destino": {
      const code = matchChoice(input, DESTINATIONS);
      if (code === "outro" || code === null) {
        // texto livre que não bate com a lista vira o próprio destino ("Cancún", "Chile"...)
        if (input.kind === "text" && code === null && text.length >= 3) {
          return { ok: true, answers: { ...a, destino_codigo: "outro", destino: titleCase(text).slice(0, 80) } };
        }
        return { ok: true, answers: { ...a, destino_codigo: "outro", destino: undefined } };
      }
      const title = DESTINATIONS.find((d) => d.id === code)!.title;
      // se digitou uma cidade específica dos EUA (ex.: "Nova York"), guarda o que digitou
      const destino = code === "eua" && input.kind === "text" ? titleCase(text).slice(0, 80) : title;
      return { ok: true, answers: { ...a, destino_codigo: code, destino } };
    }
    case "destino_outro": {
      if (text.length < 2) return { ok: false, error: "Me diz qual destino, por favor 🙂" };
      return { ok: true, answers: { ...a, destino: titleCase(text).slice(0, 80) } };
    }
    case "visto": {
      const v = matchChoice(input, VISA);
      if (!v) return { ok: false, error: "Toque numa das opções: Todos têm, Alguns têm ou Ninguém tem 🙂" };
      return { ok: true, answers: { ...a, visto: v } };
    }
    case "pessoas": {
      const n = parsePeopleCount(text);
      if (!n) return { ok: false, error: "Me diz só o número, por favor (ex.: 4)" };
      return { ok: true, answers: { ...a, pessoas: n } };
    }
    case "idades": {
      const ages = parseAges(text);
      const expected = a.pessoas ?? ages.length;
      if (ages.length === 0) return { ok: false, error: "Me manda as idades em números, por favor (ex.: 38, 35, 8)" };
      // depois de 1 tentativa errada aceita o que vier, pra não travar o cliente
      if (ages.length !== expected && tentativas < 1) {
        return {
          ok: false,
          error: `Recebi ${ages.length} ${ages.length === 1 ? "idade" : "idades"}, mas são ${expected} pessoas. Pode mandar a idade de cada uma? (ex.: 38, 35, 8)`,
        };
      }
      return { ok: true, answers: { ...a, idades: ages } };
    }
    case "datas": {
      // cliente pode já digitar a data direto em vez de tocar no botão
      if (input.kind === "text") {
        const direct = parseTravelDate(text, ctx.now);
        if (direct) return { ok: true, answers: { ...a, datas_tipo: "exatas", data_ida: direct } };
      }
      const k = matchChoice(input, DATES);
      if (!k) {
        if (input.kind === "text" && text.length >= 3) {
          // "julho", "fim do ano"... trata como "só o mês"
          return { ok: true, answers: { ...a, datas_tipo: "mes", mes_texto: text.slice(0, 120) } };
        }
        return { ok: false, error: "Toque numa das opções 🙂" };
      }
      return { ok: true, answers: { ...a, datas_tipo: k } };
    }
    case "data_ida": {
      const d = parseTravelDate(text, ctx.now);
      if (!d) return { ok: false, error: "Não entendi a data 😅 Pode mandar assim: 15/01/2027" };
      if (d < todayISO(ctx.now)) return { ok: false, error: "Essa data já passou 🤔 Qual a data de ida?" };
      return { ok: true, answers: { ...a, data_ida: d } };
    }
    case "data_volta": {
      const d = parseTravelDate(text, ctx.now);
      if (!d) return { ok: false, error: "Não entendi a data 😅 Pode mandar assim: 25/01/2027" };
      if (a.data_ida && d < a.data_ida) {
        // "15/01" digitado depois de uma ida em dezembro: tenta o ano seguinte
        const nextYear = String(Number(d.slice(0, 4)) + 1) + d.slice(4);
        if (nextYear >= a.data_ida && !/\d{4}/.test(text)) return { ok: true, answers: { ...a, data_volta: nextYear } };
        return { ok: false, error: `A volta precisa ser depois da ida (${formatBR(a.data_ida)}). Qual a data de volta?` };
      }
      return { ok: true, answers: { ...a, data_volta: d } };
    }
    case "mes": {
      if (text.length < 3) return { ok: false, error: "Me diz o mês e mais ou menos quantos dias 🙂" };
      return { ok: true, answers: { ...a, mes_texto: text.slice(0, 120) } };
    }
    case "orcamento": {
      const b = matchChoice(input, BUDGETS) ?? budgetFromText(text);
      if (!b) return { ok: false, error: "Toque numa das faixas da lista 🙂" };
      return { ok: true, answers: { ...a, orcamento: b } };
    }
    case "pagamento": {
      const p = matchChoice(input, PAYMENTS);
      if (!p) return { ok: false, error: "Toque numa das opções da lista 🙂" };
      return { ok: true, answers: { ...a, pagamento: p } };
    }
    case "rundisney": {
      const n = normalize(text);
      const none = /^(nao|n|nenhuma|nao vou|nao vou correr)\b/.test(n);
      return { ok: true, answers: { ...a, rundisney: none ? null : text.slice(0, 120) } };
    }
    case "fim":
      return { ok: true, answers: a };
  }
}

/** "uns 20 mil", "R$ 35.000", "50k" → faixa */
export function budgetFromText(text: string): BudgetRange | null {
  const n = normalize(text).replace(/\./g, "").replace(/,\d+/, "");
  const m = n.match(/(\d+)\s*(mil|k)?/);
  if (!m) return null;
  let value = Number(m[1]);
  if (m[2]) value *= 1000;
  if (value < 1000) return null;
  if (value <= 15000) return "ate_15k";
  if (value <= 30000) return "15_30k";
  if (value <= 50000) return "30_50k";
  return "acima_50k";
}
