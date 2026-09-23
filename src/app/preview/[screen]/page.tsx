import { notFound } from "next/navigation";
import { Board } from "@/components/board";
import { ConversationList } from "@/components/conversation-list";
import { ConversationView } from "@/components/conversation-view";
import { TravelerList } from "@/components/travelers";
import { NavLinks } from "@/components/nav-links";

/**
 * Pré-visualização das telas com dados FICTÍCIOS, só para desenvolvimento
 * (ENABLE_PREVIEW=1). Em produção responde 404.
 */
export default async function Preview({ params }: { params: Promise<{ screen: string }> }) {
  if (process.env.ENABLE_PREVIEW !== "1") notFound();
  const { screen } = await params;

  const stages = [
    ["NOVO LEAD", "#3b82f6"], ["QUALIFICAÇÃO", "#6366f1"], ["ORÇAMENTO EM PREPARAÇÃO", "#f59e0b"],
    ["ORÇAMENTO ENVIADO", "#f59e0b"], ["NEGOCIAÇÃO", "#f97316"], ["VENDA FECHADA", "#22c55e"], ["PERDIDO", "#ef4444"],
  ].map(([name, color], i) => ({ id: `s${i}`, name: name!, color: color!, is_won: name === "VENDA FECHADA", is_lost: name === "PERDIDO" }));
  const card = (id: string, stageId: string, contactName: string, destination: string, extra: object = {}) => ({
    id, stageId, title: destination, contactName, destination, dates: "15/01 → 25/01/2027", travelers: 4, budget: "R$ 30 a 50 mil",
    valueText: null, tags: [], temperature: "undefined", lastActivity: "", lastActivityLabel: "2 h", syncError: null, hasQuote: false, ...extra,
  });
  const cards = [
    card("1", "s0", "Mariana Costa", "Orlando / Disney", { dates: "datas a definir", budget: null, lastActivityLabel: "5 min" }),
    card("2", "s1", "João Silva", "Orlando / Disney", { tags: ["visto"], temperature: "hot" }),
    card("3", "s2", "Ana Lima", "Europa", { travelers: 2, dates: "julho, uns 10 dias", budget: "R$ 15 a 30 mil" }),
    card("4", "s2", "Carlos Souza", "Cruzeiro", { travelers: 3, temperature: "warm" }),
    card("5", "s3", "Fernanda Rocha", "Beto Carrero", { travelers: 2, hasQuote: true, dates: "13/03 → 17/03/2027", budget: null, valueText: "R$ 3.568,38" }),
    card("6", "s5", "Paulo Mendes", "Orlando / Disney", { valueText: "R$ 42.500,00", tags: ["visto"], syncError: "Trello não configurado" }),
  ];

  const frame = (children: React.ReactNode) => (
    <div className="flex min-h-screen flex-col bg-stone-50 md:flex-row">
      <aside className="flex shrink-0 items-center justify-between border-b border-stone-200 bg-white px-4 py-3 md:sticky md:top-0 md:h-screen md:w-56 md:flex-col md:items-stretch md:justify-start md:border-b-0 md:border-r md:px-3 md:py-5">
        <div className="flex items-center gap-2 md:mb-6 md:px-2">
          <span className="text-2xl">🐨</span>
          <div className="text-sm font-semibold">Koala Turismo</div>
        </div>
        <NavLinks badges={{ inbox: 3, tarefas: 7 }} />
      </aside>
      <main className="min-w-0 flex-1 pb-20 md:pb-0">{children}</main>
    </div>
  );

  if (screen === "funil") {
    return frame(
      <div className="flex h-[calc(100dvh-110px)] flex-col md:h-screen">
        <div className="flex items-baseline gap-3 px-4 pb-3 pt-5 md:px-6">
          <h1 className="text-xl font-semibold tracking-tight">Funil</h1>
          <span className="text-sm text-stone-500">{cards.length} oportunidades</span>
        </div>
        <Board stages={stages} cards={cards} readOnly />
      </div>
    );
  }

  if (screen === "inbox") {
    return frame(
      <div className="flex h-[calc(100dvh-110px)] md:h-screen">
        <ConversationList
          items={[
            { id: "c1", name: "João Silva", preview: "Você: Qual forma de pagamento é melhor pra vocês?", when: "2 min", unread: 0, status: "open", botActive: true, handoff: false },
            { id: "c2", name: "Mariana Costa", preview: "quero falar com um atendente", when: "10 min", unread: 2, status: "pending_human", botActive: false, handoff: true },
            { id: "c3", name: "Fernanda Rocha", preview: "Você: Fernanda, seu orçamento está pronto! ✈️🐨", when: "1 h", unread: 0, status: "pending_human", botActive: false, handoff: false },
          ]}
        />
        <div className="flex min-w-0 flex-1 flex-col">
          <ConversationView
            conversationId="c1"
            name="João Silva"
            phone="+55 22 99999-0000"
            status="open"
            botActive
            insideWindow
            unread={0}
            opportunityHref="#"
            messages={[
              { id: "m1", direction: "inbound", senderType: "customer", content: "Olá! Quero um orçamento pra Disney", messageType: "text", status: "received", failure: null, time: "22/09 10:02" },
              { id: "m2", direction: "outbound", senderType: "automation", content: "Olá! Sou o Piero, da Koala Turismo 🐨\nVou te fazer umas perguntas rápidas pra montar sua cotação, leva uns 2 minutinhos.\n\n🔇 Por aqui não ouvimos áudio nem atendemos ligação, tá? Só texto 😉", messageType: "text", status: "read", failure: null, time: "22/09 10:02" },
              { id: "m3", direction: "outbound", senderType: "automation", content: "Pra começar: qual é o seu nome?", messageType: "text", status: "read", failure: null, time: "22/09 10:02" },
              { id: "m4", direction: "inbound", senderType: "customer", content: "João Silva", messageType: "text", status: "received", failure: null, time: "22/09 10:03" },
              { id: "m5", direction: "outbound", senderType: "automation", content: "Qual destino vocês querem conhecer?\n1. Orlando / Disney\n2. Outros destinos nos EUA\n3. Cruzeiro\n4. Europa\n5. Outro destino", messageType: "interactive", status: "read", failure: null, time: "22/09 10:03" },
              { id: "m6", direction: "inbound", senderType: "customer", content: "Orlando / Disney", messageType: "interactive", status: "received", failure: null, time: "22/09 10:04" },
              { id: "m7", direction: "outbound", senderType: "agent", content: "Oi João! Aqui é o Piero, já vou te ajudar com os ingressos também 😉", messageType: "text", status: "delivered", failure: null, time: "22/09 10:06" },
            ]}
          />
        </div>
      </div>
    );
  }

  if (screen === "viajantes") {
    return frame(
      <div className="mx-auto max-w-xl px-4 py-5">
        <section className="rounded-xl border border-stone-200 bg-white p-5">
          <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-stone-500">Viajantes e documentos</h2>
          <TravelerList
            contactId="x"
            askVisa
            today="2026-09-23"
            travelers={[
              { id: "t1", full_name: "João da Silva", birth_date: null, passport_expires_on: "2030-03-15", has_passport: true, us_visa_expires_on: "2027-01-15", has_us_visa: true },
              { id: "t2", full_name: "Maria Souza", birth_date: null, passport_expires_on: "2027-02-01", has_passport: true, us_visa_expires_on: null, has_us_visa: false },
              { id: "t3", full_name: "Pedro Silva", birth_date: null, passport_expires_on: "2026-08-10", has_passport: true, us_visa_expires_on: null, has_us_visa: null },
            ]}
          />
        </section>
      </div>
    );
  }
  notFound();
}
