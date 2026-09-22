/**
 * Fluxo 2 — Documentos dos viajantes (disparado quando a venda é fechada).
 * Para cada viajante: nome completo → vencimento do passaporte → [vencimento do
 * visto americano, se o destino é EUA/Orlando].
 * Guarda SÓ as datas (nada de número de documento ou foto — LGPD).
 */
import { formatBR, normalize, parseExpiryDate, titleCase, wantsHuman } from "./parse";
import type { BotContext, BotInput, DocumentsAnswers, OutgoingMessage, StepResult } from "./types";

export type DocumentsStep = "doc_nome" | "doc_passaporte" | "doc_visto" | "fim";

const NO_PASSPORT = { id: "sem_passaporte", title: "Não tem passaporte" };
const NO_VISA = { id: "sem_visto", title: "Não tem visto" };

function ordinal(a: DocumentsAnswers): string {
  return a.total > 1 ? `Viajante ${a.i + 1} de ${a.total}` : "Viajante";
}

export function askDocuments(step: DocumentsStep, a: DocumentsAnswers): OutgoingMessage[] {
  const current = a.viajantes[a.i];
  switch (step) {
    case "doc_nome":
      return [{ type: "text", body: `👤 ${ordinal(a)}: qual o nome completo?` }];
    case "doc_passaporte":
      return [
        {
          type: "buttons",
          body: `Qual a data de vencimento do passaporte de ${current?.nome.split(" ")[0]}? (ex.: 15/03/2030)`,
          buttons: [NO_PASSPORT],
        },
      ];
    case "doc_visto":
      return [
        {
          type: "buttons",
          body: `E o vencimento do visto americano de ${current?.nome.split(" ")[0]}? (ex.: 10/08/2034)`,
          buttons: [NO_VISA],
        },
      ];
    case "fim":
      return [
        {
          type: "text",
          body: "Obrigado! Anotei tudo ✅ Vamos acompanhar os vencimentos e te avisamos com antecedência se algum documento precisar de renovação. 🐨",
        },
      ];
  }
}

export function startDocuments(params: {
  travelersCount: number;
  askUSVisa: boolean;
}): StepResult<DocumentsAnswers> {
  const answers: DocumentsAnswers = {
    total: Math.max(1, Math.min(params.travelersCount, 20)),
    pedir_visto: params.askUSVisa,
    viajantes: [],
    i: 0,
  };
  return {
    step: "doc_nome",
    answers,
    status: "active",
    messages: [
      {
        type: "text",
        body:
          "🎉 Viagem confirmada! Pra deixar tudo pronto, vou anotar a data de vencimento do passaporte" +
          (params.askUSVisa ? " e do visto americano" : "") +
          " de cada viajante 📄\n_Só as datas, não precisa mandar foto nem número do documento._",
      },
      ...askDocuments("doc_nome", answers),
    ],
  };
}

export function handleDocuments(
  state: { step: DocumentsStep; answers: DocumentsAnswers },
  input: BotInput,
  _ctx: BotContext
): StepResult<DocumentsAnswers> {
  const { step } = state;
  const a: DocumentsAnswers = { ...state.answers, viajantes: state.answers.viajantes.map((v) => ({ ...v })) };

  if (step === "fim") return { step, answers: a, messages: [], status: "completed" };

  if (input.kind === "text" && wantsHuman(input.text)) {
    return {
      step,
      answers: a,
      status: "handed_off",
      messages: [{ type: "text", body: "Tudo bem! Já chamei alguém da equipe pra falar com você 😊" }],
    };
  }
  if (input.kind === "audio") {
    return {
      step,
      answers: a,
      status: "active",
      messages: [{ type: "text", body: "Não conseguimos ouvir áudio 🙏 Pode escrever pra mim?" }, ...askDocuments(step, a)],
    };
  }
  if (input.kind === "unsupported") {
    return { step, answers: a, status: "active", messages: askDocuments(step, a) };
  }

  const text = input.kind === "text" ? input.text.trim() : input.title;
  const fail = (error: string): StepResult<DocumentsAnswers> => ({
    step,
    answers: a,
    status: "active",
    messages: [{ type: "text", body: error }, ...askDocuments(step, a).filter((m) => m.type !== "text")],
  });

  let next: DocumentsStep;

  switch (step) {
    case "doc_nome": {
      const clean = text.replace(/[^\p{L}\s'-]/gu, "").trim();
      if (clean.split(" ").length < 2) return fail("Me manda o nome completo, por favor (nome e sobrenome) 🙂");
      a.viajantes[a.i] = { nome: titleCase(clean).slice(0, 120) };
      next = "doc_passaporte";
      break;
    }
    case "doc_passaporte": {
      const none =
        (input.kind === "choice" && input.id === NO_PASSPORT.id) ||
        /^(nao|nao tem|nao tenho|nenhum|sem passaporte)/.test(normalize(text));
      if (none) {
        a.viajantes[a.i]!.passaporte = null;
      } else {
        const d = parseExpiryDate(text);
        if (!d) return fail("Não entendi a data 😅 Pode mandar assim: 15/03/2030");
        a.viajantes[a.i]!.passaporte = d;
      }
      next = a.pedir_visto ? "doc_visto" : "doc_nome";
      break;
    }
    case "doc_visto": {
      const none =
        (input.kind === "choice" && input.id === NO_VISA.id) ||
        /^(nao|nao tem|nao tenho|nenhum|sem visto)/.test(normalize(text));
      if (none) {
        a.viajantes[a.i]!.visto = null;
      } else {
        const d = parseExpiryDate(text);
        if (!d) return fail("Não entendi a data 😅 Pode mandar assim: 10/08/2034");
        a.viajantes[a.i]!.visto = d;
      }
      next = "doc_nome";
      break;
    }
  }

  // terminou o viajante atual?
  if (next === "doc_nome") {
    a.i += 1;
    if (a.i >= a.total) {
      return { step: "fim", answers: a, status: "completed", messages: [confirmation(a), ...askDocuments("fim", a)] };
    }
  }
  return { step: next, answers: a, status: "active", messages: askDocuments(next, a) };
}

function confirmation(a: DocumentsAnswers): OutgoingMessage {
  const lines = a.viajantes.map((v) => {
    const pass = v.passaporte ? formatBR(v.passaporte) : "não tem";
    const visa = a.pedir_visto ? ` · visto: ${v.visto ? formatBR(v.visto) : "não tem"}` : "";
    return `• ${v.nome} — passaporte: ${pass}${visa}`;
  });
  return { type: "text", body: `Confere pra mim:\n${lines.join("\n")}\n\nSe algo estiver errado, é só avisar aqui.` };
}
