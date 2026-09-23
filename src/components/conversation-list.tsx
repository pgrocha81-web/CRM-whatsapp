"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { CONVERSATION_STATUS } from "@/lib/ui/labels";

export interface ConversationItem {
  id: string;
  name: string;
  preview: string;
  when: string;
  unread: number;
  status: string;
  botActive: boolean;
  handoff: boolean;
}

export function ConversationList({ items }: { items: ConversationItem[] }) {
  const pathname = usePathname();
  const [filter, setFilter] = useState<"todas" | "equipe" | "naolidas">("todas");
  const selected = pathname.split("/")[2];
  const shown = items.filter((c) =>
    filter === "equipe" ? c.status === "pending_human" : filter === "naolidas" ? c.unread > 0 : true
  );
  return (
    <aside
      className={`${selected ? "hidden md:flex" : "flex"} w-full shrink-0 flex-col border-r border-stone-200 bg-white md:w-80`}
    >
      <div className="border-b border-stone-100 px-4 pb-3 pt-5">
        <h1 className="text-xl font-semibold tracking-tight">Conversas</h1>
        <div className="mt-3 flex gap-1 text-xs">
          {(
            [
              ["todas", "Todas"],
              ["naolidas", "Não lidas"],
              ["equipe", "Com a equipe"],
            ] as const
          ).map(([key, label]) => (
            <button
              key={key}
              onClick={() => setFilter(key)}
              className={`rounded-full px-3 py-1 ${filter === key ? "bg-stone-900 text-white" : "bg-stone-100 text-stone-600 hover:bg-stone-200"}`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>
      <ul className="flex-1 overflow-y-auto">
        {shown.map((c) => {
          const st = CONVERSATION_STATUS[c.status];
          return (
            <li key={c.id}>
              <Link
                href={`/inbox/${c.id}`}
                className={`flex gap-3 border-b border-stone-100 px-4 py-3 hover:bg-stone-50 ${selected === c.id ? "bg-stone-100" : ""}`}
              >
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-stone-200 text-sm font-semibold text-stone-600">
                  {c.name.slice(0, 1).toUpperCase()}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-baseline gap-2">
                    <span className={`truncate text-sm ${c.unread ? "font-semibold" : "font-medium"}`}>{c.name}</span>
                    <span className="ml-auto shrink-0 text-[11px] text-stone-400">{c.when}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="truncate text-xs text-stone-500">{c.preview}</span>
                    {c.unread > 0 && (
                      <span className="ml-auto shrink-0 rounded-full bg-emerald-600 px-1.5 text-[10px] font-semibold leading-4 text-white">{c.unread}</span>
                    )}
                  </div>
                  <div className="mt-1 flex gap-1">
                    {c.botActive && <span className="rounded bg-sky-100 px-1.5 text-[10px] font-medium text-sky-700">🤖 bot</span>}
                    {c.status !== "open" && st && <span className={`rounded px-1.5 text-[10px] font-medium ${st.className}`}>{st.label}</span>}
                    {c.handoff && <span className="rounded bg-red-100 px-1.5 text-[10px] font-medium text-red-700">pediu atendente</span>}
                  </div>
                </div>
              </Link>
            </li>
          );
        })}
        {shown.length === 0 && <li className="px-4 py-10 text-center text-sm text-stone-400">Nenhuma conversa aqui.</li>}
      </ul>
    </aside>
  );
}
