"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition } from "react";

export interface BoardStage {
  id: string;
  name: string;
  color: string | null;
  is_won: boolean;
  is_lost: boolean;
}

export interface BoardCard {
  id: string;
  stageId: string;
  title: string;
  contactName: string | null;
  destination: string | null;
  dates: string;
  travelers: number | null;
  budget: string | null;
  valueText: string | null;
  tags: string[];
  temperature: string;
  lastActivity: string;
  lastActivityLabel: string;
  syncError: string | null;
  hasQuote: boolean;
}

/**
 * Kanban do funil. Arrastar e soltar no computador; no celular, toque no card
 * para abrir a oportunidade e mudar a etapa por lá.
 */
export function Board({ stages, cards: initialCards, readOnly = false }: { stages: BoardStage[]; cards: BoardCard[]; readOnly?: boolean }) {
  const router = useRouter();
  const [cards, setCards] = useState(initialCards);
  const [dragging, setDragging] = useState<string | null>(null);
  const [over, setOver] = useState<string | null>(null);
  const [pendingWon, setPendingWon] = useState<{ cardId: string; stage: BoardStage } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showLost, setShowLost] = useState(false);
  const [, startTransition] = useTransition();

  const byStage = useMemo(() => {
    const map = new Map<string, BoardCard[]>();
    for (const s of stages) map.set(s.id, []);
    for (const c of cards) map.get(c.stageId)?.push(c);
    return map;
  }, [stages, cards]);

  async function move(cardId: string, stage: BoardStage, closedValueCents?: number) {
    const previous = cards;
    setCards((cs) => cs.map((c) => (c.id === cardId ? { ...c, stageId: stage.id } : c)));
    setError(null);
    if (readOnly) return;
    const res = await fetch(`/api/opportunities/${cardId}/stage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ stage_id: stage.id, closed_value_cents: closedValueCents }),
    });
    if (!res.ok) {
      setCards(previous);
      setError("Não consegui mover o card. Tente de novo.");
      return;
    }
    const json = (await res.json()) as { integrations?: { errors: string[] } | null };
    const errs = json.integrations?.errors?.filter((e) => !e.includes("não configurado")) ?? [];
    if (errs.length) setError(`Venda registrada, mas: ${errs.join(" · ")}`);
    startTransition(() => router.refresh());
  }

  function onDrop(stage: BoardStage) {
    const cardId = dragging;
    setDragging(null);
    setOver(null);
    if (!cardId) return;
    const card = cards.find((c) => c.id === cardId);
    if (!card || card.stageId === stage.id) return;
    if (stage.is_won) {
      setPendingWon({ cardId, stage });
      return;
    }
    void move(cardId, stage);
  }

  const visibleStages = stages.filter((s) => showLost || !s.is_lost);
  const lostCount = stages.filter((s) => s.is_lost).reduce((n, s) => n + (byStage.get(s.id)?.length ?? 0), 0);

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center gap-3 px-4 pb-3 md:px-6">
        {error && <p className="rounded-lg bg-amber-50 px-3 py-1.5 text-sm text-amber-800">{error}</p>}
        <button
          onClick={() => setShowLost((v) => !v)}
          className="ml-auto rounded-lg border border-stone-200 bg-white px-3 py-1.5 text-xs text-stone-600 hover:bg-stone-100"
        >
          {showLost ? "Esconder perdidos" : `Mostrar perdidos (${lostCount})`}
        </button>
      </div>
      <div className="flex flex-1 snap-x gap-3 overflow-x-auto px-4 pb-6 md:px-6">
        {visibleStages.map((stage) => {
          const list = byStage.get(stage.id) ?? [];
          return (
            <section
              key={stage.id}
              onDragOver={(e) => {
                e.preventDefault();
                setOver(stage.id);
              }}
              onDragLeave={() => setOver((o) => (o === stage.id ? null : o))}
              onDrop={() => onDrop(stage)}
              className={`flex w-[82vw] shrink-0 snap-start flex-col rounded-xl border bg-stone-100/70 sm:w-72 ${
                over === stage.id ? "border-stone-900 bg-stone-200/70" : "border-transparent"
              }`}
            >
              <header className="flex items-center gap-2 px-3 pb-2 pt-3">
                <span className="h-2.5 w-2.5 rounded-full" style={{ background: stage.color ?? "#a8a29e" }} />
                <h2 className="text-xs font-semibold uppercase tracking-wide text-stone-700">{stage.name}</h2>
                <span className="ml-auto text-xs tabular-nums text-stone-500">{list.length}</span>
              </header>
              <div className="flex min-h-24 flex-col gap-2 px-2 pb-2">
                {list.map((card) => (
                  <CardView
                    key={card.id}
                    card={card}
                    won={stage.is_won}
                    onDragStart={() => setDragging(card.id)}
                    onDragEnd={() => {
                      setDragging(null);
                      setOver(null);
                    }}
                  />
                ))}
                {list.length === 0 && <p className="px-2 py-6 text-center text-xs text-stone-400">Arraste um card para cá</p>}
              </div>
            </section>
          );
        })}
      </div>

      {pendingWon && (
        <WonDialog
          onCancel={() => setPendingWon(null)}
          onConfirm={(cents) => {
            const p = pendingWon;
            setPendingWon(null);
            void move(p.cardId, p.stage, cents);
          }}
        />
      )}
    </div>
  );
}

function CardView({ card, won, onDragStart, onDragEnd }: { card: BoardCard; won: boolean; onDragStart: () => void; onDragEnd: () => void }) {
  const temp =
    card.temperature === "hot"
      ? "border-l-red-500"
      : card.temperature === "warm"
        ? "border-l-amber-400"
        : card.temperature === "cold"
          ? "border-l-sky-400"
          : "border-l-stone-200";
  return (
    <Link
      href={`/oportunidades/${card.id}`}
      draggable
      onDragStart={(e) => {
        e.dataTransfer.effectAllowed = "move";
        onDragStart();
      }}
      onDragEnd={onDragEnd}
      className={`block cursor-grab rounded-lg border border-l-4 border-stone-200 bg-white p-3 shadow-sm transition hover:shadow active:cursor-grabbing ${temp}`}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="truncate text-sm font-semibold">{card.contactName ?? "Sem nome"}</div>
          <div className="truncate text-xs text-stone-500">{card.destination ?? card.title}</div>
        </div>
        <span className="shrink-0 text-[11px] text-stone-400" title={card.lastActivity}>
          {card.lastActivityLabel}
        </span>
      </div>
      <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-xs text-stone-600">
        <span>📅 {card.dates}</span>
        {card.travelers ? <span>👥 {card.travelers}</span> : null}
        {card.valueText ? <span className="font-medium text-stone-900">{card.valueText}</span> : card.budget ? <span>💰 {card.budget}</span> : null}
      </div>
      {(card.tags.length > 0 || card.hasQuote || (won && card.syncError)) && (
        <div className="mt-2 flex flex-wrap gap-1">
          {card.tags.map((t) => (
            <span key={t} className="rounded bg-violet-100 px-1.5 py-0.5 text-[10px] font-semibold uppercase text-violet-700">
              {t}
            </span>
          ))}
          {card.hasQuote && <span className="rounded bg-sky-100 px-1.5 py-0.5 text-[10px] font-semibold text-sky-700">ORÇAMENTO</span>}
          {won && card.syncError && (
            <span className="rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-semibold text-amber-800" title={card.syncError}>
              ⚠ Calendar/Trello
            </span>
          )}
        </div>
      )}
    </Link>
  );
}

function WonDialog({ onCancel, onConfirm }: { onCancel: () => void; onConfirm: (cents?: number) => void }) {
  const [value, setValue] = useState("");
  function cents(): number | undefined {
    const clean = value.replace(/[^\d,]/g, "").replace(",", ".");
    const n = Number(clean);
    return clean && Number.isFinite(n) ? Math.round(n * 100) : undefined;
  }
  return (
    <div className="fixed inset-0 z-30 flex items-end justify-center bg-black/40 p-4 sm:items-center" onClick={onCancel}>
      <div className="w-full max-w-sm rounded-2xl bg-white p-5 shadow-xl" onClick={(e) => e.stopPropagation()}>
        <h3 className="text-base font-semibold">🎉 Venda fechada!</h3>
        <p className="mt-1 text-sm text-stone-600">
          Vou criar o evento no Google Calendar, o card no Trello e pedir ao cliente os vencimentos de passaporte e visto.
        </p>
        <label className="mt-4 block">
          <span className="mb-1 block text-xs font-medium text-stone-600">Valor fechado (opcional)</span>
          <input
            autoFocus
            inputMode="decimal"
            placeholder="R$ 0,00"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            className="w-full rounded-lg border border-stone-300 px-3 py-2 text-sm outline-none focus:border-stone-900"
          />
        </label>
        <div className="mt-5 flex justify-end gap-2">
          <button onClick={onCancel} className="rounded-lg px-3 py-2 text-sm text-stone-600 hover:bg-stone-100">
            Cancelar
          </button>
          <button onClick={() => onConfirm(cents())} className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-700">
            Confirmar venda
          </button>
        </div>
      </div>
    </div>
  );
}
