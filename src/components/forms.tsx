"use client";

import { useActionState, useState, useTransition } from "react";
import type { ActionResult } from "@/app/(dashboard)/actions";

export const inputClass =
  "w-full rounded-lg border border-stone-300 bg-white px-3 py-2 text-sm outline-none focus:border-stone-900 disabled:bg-stone-50";

export function Field({ label, children, className = "" }: { label: string; children: React.ReactNode; className?: string }) {
  return (
    <label className={`block ${className}`}>
      <span className="mb-1 block text-xs font-medium text-stone-600">{label}</span>
      {children}
    </label>
  );
}

export function Feedback({ state }: { state: ActionResult | null }) {
  if (!state) return null;
  return state.ok ? (
    state.message ? <span className="text-sm text-emerald-700">{state.message}</span> : null
  ) : (
    <span className="text-sm text-red-600">{state.error}</span>
  );
}

/** Formulário ligado a uma server action (useActionState) com botão de salvar. */
export function ActionForm({
  action,
  children,
  submitLabel = "Salvar",
  className = "",
}: {
  action: (prev: ActionResult | null, fd: FormData) => Promise<ActionResult>;
  children: React.ReactNode;
  submitLabel?: string;
  className?: string;
}) {
  const [state, formAction, pending] = useActionState(action, null);
  return (
    <form action={formAction} className={className}>
      {children}
      <div className="mt-4 flex items-center gap-3">
        <button
          type="submit"
          disabled={pending}
          className="rounded-lg bg-stone-900 px-4 py-2 text-sm font-medium text-white hover:bg-stone-800 disabled:opacity-60"
        >
          {pending ? "Salvando…" : submitLabel}
        </button>
        <Feedback state={state} />
      </div>
    </form>
  );
}

/** Botão que chama uma action simples e mostra o resultado. */
export function ActionButton({
  action,
  children,
  className = "",
  confirm,
}: {
  action: () => Promise<ActionResult | void>;
  children: React.ReactNode;
  className?: string;
  confirm?: string;
}) {
  const [pending, start] = useTransition();
  const [result, setResult] = useState<ActionResult | null>(null);
  return (
    <span className="inline-flex items-center gap-2">
      <button
        type="button"
        disabled={pending}
        onClick={() => {
          if (confirm && !window.confirm(confirm)) return;
          start(async () => setResult((await action()) ?? null));
        }}
        className={`rounded-lg border border-stone-300 bg-white px-3 py-1.5 text-sm hover:bg-stone-100 disabled:opacity-60 ${className}`}
      >
        {pending ? "…" : children}
      </button>
      <Feedback state={result} />
    </span>
  );
}
