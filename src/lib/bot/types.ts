/**
 * Tipos do motor de bot (roteiro de perguntas no WhatsApp).
 * O motor é PURO: recebe estado + mensagem do cliente e devolve o novo estado
 * e as mensagens a enviar. Não acessa banco nem WhatsApp — isso fica no
 * processador (src/lib/crm/process-inbound.ts). Assim dá para testar tudo.
 */

/** O que o cliente mandou, já normalizado a partir do payload da Meta. */
export type BotInput =
  | { kind: "text"; text: string }
  /** Clique em botão / item de lista (interactive) ou botão de template. */
  | { kind: "choice"; id: string; title: string }
  | { kind: "audio" }
  /** Imagem, figurinha, localização etc. — o bot não usa, repete a pergunta. */
  | { kind: "unsupported" };

export interface ButtonOption {
  id: string;
  /** Máx. 20 caracteres (limite da Meta para reply buttons). */
  title: string;
}

export interface ListOption {
  id: string;
  /** Máx. 24 caracteres (limite da Meta para linhas de lista). */
  title: string;
  description?: string;
}

/** Mensagem que o bot quer enviar. O cliente de envio traduz para a Cloud API. */
export type OutgoingMessage =
  | { type: "text"; body: string }
  | { type: "buttons"; body: string; buttons: ButtonOption[] }
  | { type: "list"; body: string; buttonLabel: string; options: ListOption[] };

export type SessionStatus = "active" | "completed" | "handed_off";

export interface BotContext {
  now: Date;
  /** Marca de origem do lead — "corrida_na_disney" adiciona a pergunta de prova runDisney. */
  brandSlug?: string | null;
  /** Nome de quem assina o atendimento na boas-vindas. */
  attendantName: string;
  /** Link do grupo de promoções (vazio = não manda). */
  promoGroupUrl?: string | null;
}

export interface StepResult<A> {
  step: string;
  answers: A;
  messages: OutgoingMessage[];
  status: SessionStatus;
}

// ------------------------------------------------------------
// Fluxo 1 — qualificação (primeiro contato)
// ------------------------------------------------------------
export type DestinationCode = "orlando" | "eua" | "cruzeiro" | "europa" | "outro";
export type VisaStatus = "all" | "some" | "none";
export type DatesKind = "exatas" | "mes" | "nao_sei";
export type BudgetRange = "ate_15k" | "15_30k" | "30_50k" | "acima_50k" | "nao_sei";
export type PaymentPreference = "pix" | "cartao" | "entrada_parcelas" | "ver_opcoes";

export interface QualificationAnswers {
  nome?: string;
  cidade?: string;
  destino_codigo?: DestinationCode;
  destino?: string;
  visto?: VisaStatus;
  pessoas?: number;
  idades?: number[];
  datas_tipo?: DatesKind;
  /** ISO yyyy-mm-dd */
  data_ida?: string;
  data_volta?: string;
  mes_texto?: string;
  orcamento?: BudgetRange;
  pagamento?: PaymentPreference;
  rundisney?: string | null;
  /** Contador interno de tentativas inválidas na pergunta atual. */
  _tentativas?: number;
}

// ------------------------------------------------------------
// Fluxo 2 — documentos (depois da venda fechada)
// ------------------------------------------------------------
export interface TravelerDocs {
  nome: string;
  /** ISO yyyy-mm-dd; null = não tem */
  passaporte?: string | null;
  visto?: string | null;
}

export interface DocumentsAnswers {
  total: number;
  /** Precisa perguntar visto americano? (destino EUA/Orlando) */
  pedir_visto: boolean;
  viajantes: TravelerDocs[];
  /** Índice do viajante atual (0-based) */
  i: number;
  _tentativas?: number;
}
