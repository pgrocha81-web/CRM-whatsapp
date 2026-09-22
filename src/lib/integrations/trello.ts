/**
 * Trello — cria um card na lista escolhida quando a venda é fechada.
 * Chave e token em https://trello.com/power-ups/admin (ver docs/INTEGRACOES.md).
 */

export function isTrelloConfigured(): boolean {
  return !!(process.env.TRELLO_API_KEY && process.env.TRELLO_TOKEN && process.env.TRELLO_LIST_ID);
}

export interface TrelloCardInput {
  name: string;
  description: string;
  /** yyyy-mm-dd — vira a data de entrega do card (data da ida) */
  dueDate: string | null;
}

export async function createTrelloCard(card: TrelloCardInput): Promise<string> {
  const params = new URLSearchParams({
    key: process.env.TRELLO_API_KEY!,
    token: process.env.TRELLO_TOKEN!,
    idList: process.env.TRELLO_LIST_ID!,
    name: card.name.slice(0, 250),
    desc: card.description.slice(0, 16000),
    pos: "top",
  });
  // meio-dia em São Paulo para a data não "voltar" um dia por causa do fuso
  if (card.dueDate) params.set("due", `${card.dueDate}T15:00:00.000Z`);
  if (process.env.TRELLO_LABEL_IDS) params.set("idLabels", process.env.TRELLO_LABEL_IDS);

  const res = await fetch(`https://api.trello.com/1/cards?${params.toString()}`, {
    method: "POST",
    headers: { Accept: "application/json" },
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`Trello: ${res.status} ${text.slice(0, 200)}`);
  const json = JSON.parse(text) as { id?: string };
  if (!json.id) throw new Error("Trello: resposta sem id");
  return json.id;
}
