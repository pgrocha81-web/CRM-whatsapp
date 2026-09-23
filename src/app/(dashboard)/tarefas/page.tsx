import Link from "next/link";
import { createManualTask } from "../actions";
import { ActionForm, Field, inputClass } from "@/components/forms";
import { TaskCheck } from "@/components/task-check";
import { requireStaff } from "@/lib/auth";
import { todayISO } from "@/lib/bot/parse";
import { dateBR } from "@/lib/ui/labels";

export const dynamic = "force-dynamic";

const PRIORITY: Record<string, { icon: string; order: number }> = {
  urgent: { icon: "🔴", order: 0 },
  high: { icon: "🟡", order: 1 },
  normal: { icon: "⚪", order: 2 },
  low: { icon: "·", order: 3 },
};

export default async function TarefasPage({ searchParams }: { searchParams: Promise<{ ver?: string }> }) {
  const { ver } = await searchParams;
  const showDone = ver === "concluidas";
  const { supabase } = await requireStaff();
  const { data } = await supabase
    .from("tasks")
    .select("id, description, priority, status, due_date, source, completed_at, contact:contacts(id, name), opportunity_id")
    .in("status", showDone ? ["done"] : ["pending", "in_progress"])
    .order(showDone ? "completed_at" : "due_date", { ascending: !showDone, nullsFirst: false })
    .limit(300);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const tasks = ((data ?? []) as any[]).sort((a, b) =>
    showDone ? 0 : (PRIORITY[a.priority]?.order ?? 9) - (PRIORITY[b.priority]?.order ?? 9)
  );
  const today = todayISO(new Date());

  return (
    <div className="mx-auto max-w-3xl px-4 py-5 md:px-8">
      <div className="flex items-baseline gap-3">
        <h1 className="text-xl font-semibold tracking-tight">Tarefas</h1>
        <Link href={showDone ? "/tarefas" : "/tarefas?ver=concluidas"} className="ml-auto text-sm text-stone-500 hover:text-stone-900">
          {showDone ? "← pendentes" : "ver concluídas"}
        </Link>
      </div>

      {!showDone && (
        <details className="mt-3 rounded-xl border border-stone-200 bg-white p-4">
          <summary className="cursor-pointer text-sm font-medium">+ Nova tarefa</summary>
          <ActionForm action={createManualTask} submitLabel="Criar">
            <div className="mt-3 grid gap-3 sm:grid-cols-[1fr_160px_140px]">
              <Field label="O que fazer">
                <input name="description" required className={inputClass} />
              </Field>
              <Field label="Até">
                <input type="date" name="due_date" defaultValue={today} className={inputClass} />
              </Field>
              <Field label="Prioridade">
                <select name="priority" defaultValue="normal" className={inputClass}>
                  <option value="urgent">Urgente</option>
                  <option value="high">Alta</option>
                  <option value="normal">Normal</option>
                  <option value="low">Baixa</option>
                </select>
              </Field>
            </div>
          </ActionForm>
        </details>
      )}

      <ul className="mt-4 divide-y divide-stone-100 rounded-xl border border-stone-200 bg-white">
        {tasks.map((t) => {
          const contact = Array.isArray(t.contact) ? t.contact[0] : t.contact;
          const late = !showDone && t.due_date && t.due_date < today;
          return (
            <li key={t.id} className="flex gap-3 px-4 py-3">
              <TaskCheck id={t.id} done={t.status === "done"} />
              <div className="min-w-0 flex-1">
                <div className={`text-sm ${t.status === "done" ? "text-stone-400 line-through" : ""}`}>
                  <span className="mr-1">{PRIORITY[t.priority]?.icon}</span>
                  {t.description}
                </div>
                <div className="mt-0.5 flex flex-wrap gap-x-3 text-xs text-stone-500">
                  {contact && (
                    <Link href={t.opportunity_id ? `/oportunidades/${t.opportunity_id}` : `/clientes/${contact.id}`} className="hover:underline">
                      {contact.name ?? "cliente"}
                    </Link>
                  )}
                  {t.due_date && <span className={late ? "font-medium text-red-600" : ""}>{late ? "atrasada · " : ""}{dateBR(t.due_date)}</span>}
                  {t.source === "automation" && <span>🤖 automática</span>}
                </div>
              </div>
            </li>
          );
        })}
        {tasks.length === 0 && <li className="px-4 py-10 text-center text-sm text-stone-400">{showDone ? "Nada concluído ainda." : "Tudo em dia 🎉"}</li>}
      </ul>
    </div>
  );
}
