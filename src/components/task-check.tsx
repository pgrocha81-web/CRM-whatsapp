"use client";

import { useOptimistic, useTransition } from "react";
import { toggleTask } from "@/app/(dashboard)/actions";

export function TaskCheck({ id, done }: { id: string; done: boolean }) {
  const [optimistic, setOptimistic] = useOptimistic(done);
  const [, start] = useTransition();
  return (
    <input
      type="checkbox"
      checked={optimistic}
      aria-label="Concluir tarefa"
      onChange={(e) => {
        const next = e.target.checked;
        start(async () => {
          setOptimistic(next);
          await toggleTask(id, next);
        });
      }}
      className="mt-0.5 h-4 w-4 shrink-0 accent-emerald-600"
    />
  );
}
