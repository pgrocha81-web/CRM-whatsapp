"use client";

import Link from "next/link";
import { useActionState, useEffect, useRef } from "react";
import { closeConversation, markConversationRead, sendAgentMessage, takeOverConversation } from "@/app/(dashboard)/actions";
import { ActionButton, Feedback } from "./forms";

export interface MessageItem {
  id: string;
  direction: "inbound" | "outbound";
  senderType: string;
  content: string | null;
  messageType: string;
  status: string | null;
  failure: string | null;
  time: string;
}

export function ConversationView({
  conversationId,
  name,
  phone,
  status,
  botActive,
  insideWindow,
  unread,
  messages,
  opportunityHref,
}: {
  conversationId: string;
  name: string;
  phone: string;
  status: string;
  botActive: boolean;
  insideWindow: boolean;
  unread: number;
  messages: MessageItem[];
  opportunityHref: string | null;
}) {
  const bottom = useRef<HTMLDivElement>(null);
  const [state, formAction, pending] = useActionState(sendAgentMessage.bind(null, conversationId), null);
  const formRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    bottom.current?.scrollIntoView({ block: "end" });
  }, [messages.length]);

  useEffect(() => {
    if (unread > 0) void markConversationRead(conversationId);
  }, [conversationId, unread]);

  useEffect(() => {
    if (state?.ok) formRef.current?.reset();
  }, [state]);

  return (
    <div className="flex h-full flex-col">
      <header className="flex flex-wrap items-center gap-2 border-b border-stone-200 bg-white px-4 py-3">
        <Link href="/inbox" className="mr-1 text-stone-500 md:hidden">
          ←
        </Link>
        <div className="mr-auto min-w-0">
          <div className="truncate font-semibold">{name}</div>
          <div className="text-xs text-stone-500">
            {phone}
            {botActive ? " · 🤖 bot respondendo" : status === "pending_human" ? " · com a equipe" : ""}
          </div>
        </div>
        {opportunityHref && (
          <Link href={opportunityHref} className="rounded-lg border border-stone-300 bg-white px-3 py-1.5 text-sm hover:bg-stone-100">
            Oportunidade
          </Link>
        )}
        {status !== "pending_human" && (
          <ActionButton action={() => takeOverConversation(conversationId)}>Assumir</ActionButton>
        )}
        <ActionButton action={() => closeConversation(conversationId)} confirm="Encerrar este atendimento?">
          Encerrar
        </ActionButton>
      </header>

      <div className="flex-1 space-y-2 overflow-y-auto bg-[#efeae2] px-3 py-4 md:px-6">
        {messages.map((m) => {
          const inbound = m.direction === "inbound";
          const bot = m.senderType === "automation";
          return (
            <div key={m.id} className={`flex ${inbound ? "justify-start" : "justify-end"}`}>
              <div
                className={`max-w-[85%] rounded-lg px-3 py-2 text-sm shadow-sm md:max-w-[65%] ${
                  inbound ? "bg-white" : bot ? "bg-[#d9fdd3]" : "bg-[#c8f0ff]"
                }`}
              >
                {!inbound && <div className="mb-0.5 text-[10px] font-semibold uppercase text-stone-500">{bot ? "🤖 bot" : "equipe"}</div>}
                <div className="whitespace-pre-wrap break-words">
                  {m.content ?? <span className="italic text-stone-400">[{m.messageType}]</span>}
                </div>
                <div className="mt-1 text-right text-[10px] text-stone-500">
                  {m.time}
                  {m.status === "failed" && <span className="ml-1 text-red-600" title={m.failure ?? ""}>✕ não enviada</span>}
                  {m.status === "read" && <span className="ml-1 text-sky-600">✓✓</span>}
                  {m.status === "delivered" && <span className="ml-1">✓✓</span>}
                </div>
              </div>
            </div>
          );
        })}
        {messages.length === 0 && <p className="text-center text-sm text-stone-500">Sem mensagens.</p>}
        <div ref={bottom} />
      </div>

      <form ref={formRef} action={formAction} className="border-t border-stone-200 bg-white p-3">
        {!insideWindow ? (
          <p className="text-sm text-stone-500">
            ⏳ O cliente não fala há mais de 24h. Pelo WhatsApp oficial só dá para enviar modelo aprovado — responda quando ele mandar mensagem.
          </p>
        ) : (
          <div className="flex items-end gap-2">
            <textarea
              name="text"
              rows={1}
              required
              placeholder={botActive ? "Ao enviar, você assume a conversa" : "Escreva uma mensagem"}
              className="max-h-40 min-h-[42px] flex-1 resize-y rounded-lg border border-stone-300 px-3 py-2 text-sm outline-none focus:border-stone-900"
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  e.currentTarget.form?.requestSubmit();
                }
              }}
            />
            <button disabled={pending} className="rounded-lg bg-emerald-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-emerald-700 disabled:opacity-60">
              {pending ? "…" : "Enviar"}
            </button>
          </div>
        )}
        <div className="mt-1">
          <Feedback state={state?.ok ? null : state} />
        </div>
      </form>
    </div>
  );
}
