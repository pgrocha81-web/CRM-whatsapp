/**
 * Utilitários de interpretação de texto e datas usados pelo bot e pelos avisos.
 * Todas as datas de negócio ("hoje", "daqui a 7 dias") são no fuso de São Paulo.
 * Datas são trafegadas como string ISO yyyy-mm-dd para evitar bugs de fuso.
 */

export const TIMEZONE = "America/Sao_Paulo";

/** minúsculas, sem acento, sem espaços duplicados */
export function normalize(text: string): string {
  return text
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

/** Primeira letra de cada palavra maiúscula (preserva "da", "de", "dos"...). */
export function titleCase(text: string): string {
  const small = new Set(["da", "de", "do", "das", "dos", "e"]);
  return text
    .trim()
    .replace(/\s+/g, " ")
    .split(" ")
    .map((w, i) => {
      const lower = w.toLocaleLowerCase("pt-BR");
      if (i > 0 && small.has(lower)) return lower;
      return lower.charAt(0).toLocaleUpperCase("pt-BR") + lower.slice(1);
    })
    .join(" ");
}

// ------------------------------------------------------------
// Números
// ------------------------------------------------------------
const NUMBER_WORDS: Record<string, number> = {
  um: 1, uma: 1, dois: 2, duas: 2, tres: 3, quatro: 4, cinco: 5, seis: 6,
  sete: 7, oito: 8, nove: 9, dez: 10, onze: 11, doze: 12,
  "so eu": 1, sozinho: 1, sozinha: 1, casal: 2,
};

/** Interpreta a quantidade de pessoas ("4", "somos 4", "duas", "casal"). */
export function parsePeopleCount(text: string): number | null {
  const n = normalize(text);
  const digits = n.match(/\d+/);
  if (digits) {
    const value = Number(digits[0]);
    return value >= 1 && value <= 60 ? value : null;
  }
  for (const [word, value] of Object.entries(NUMBER_WORDS)) {
    if (new RegExp(`(^|\\s)${word}(\\s|$)`).test(n)) return value;
  }
  return null;
}

/**
 * Extrai idades de um texto livre: "38, 35, 8 e 4" -> [38,35,8,4].
 * Bebês: "8 meses" conta como 0 anos.
 */
export function parseAges(text: string): number[] {
  const n = normalize(text).replace(/(\d+)\s*(mes|meses)\b/g, " 0 ");
  const matches = n.match(/\d+/g) ?? [];
  return matches.map(Number).filter((v) => v >= 0 && v <= 120);
}

// ------------------------------------------------------------
// Datas
// ------------------------------------------------------------
const MONTHS: Record<string, number> = {
  janeiro: 1, jan: 1, fevereiro: 2, fev: 2, marco: 3, mar: 3, abril: 4, abr: 4,
  maio: 5, mai: 5, junho: 6, jun: 6, julho: 7, jul: 7, agosto: 8, ago: 8,
  setembro: 9, set: 9, outubro: 10, out: 10, novembro: 11, nov: 11,
  dezembro: 12, dez: 12,
};

/** "Hoje" em São Paulo como yyyy-mm-dd. */
export function todayISO(now: Date): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: TIMEZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
}

export function toISO(y: number, m: number, d: number): string | null {
  const date = new Date(Date.UTC(y, m - 1, d));
  if (date.getUTCFullYear() !== y || date.getUTCMonth() !== m - 1 || date.getUTCDate() !== d) {
    return null; // 31/02 etc.
  }
  return date.toISOString().slice(0, 10);
}

export function addDaysISO(iso: string, days: number): string {
  const [y, m, d] = iso.split("-").map(Number) as [number, number, number];
  const date = new Date(Date.UTC(y, m - 1, d + days));
  return date.toISOString().slice(0, 10);
}

export function addMonthsISO(iso: string, months: number): string {
  const [y, m, d] = iso.split("-").map(Number) as [number, number, number];
  const target = new Date(Date.UTC(y, m - 1 + months, 1));
  const lastDay = new Date(Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0)).getUTCDate();
  target.setUTCDate(Math.min(d, lastDay));
  return target.toISOString().slice(0, 10);
}

/** dd/mm/aaaa */
export function formatBR(iso: string): string {
  const [y, m, d] = iso.split("-");
  return `${d}/${m}/${y}`;
}

/**
 * Data de VIAGEM (sempre futura). Aceita:
 * 15/01/2027 · 15/01/27 · 15/01 · 15-01 · 15.01 · "15 de janeiro" · "15 de janeiro de 2027"
 * Sem ano: usa este ano, ou o próximo se a data já passou.
 */
export function parseTravelDate(text: string, now: Date): string | null {
  const today = todayISO(now);
  const currentYear = Number(today.slice(0, 4));
  const parts = extractDayMonthYear(text);
  if (!parts) return null;
  const { d, m } = parts;
  let { y } = parts;
  if (y === undefined) {
    y = currentYear;
    const candidate = toISO(y, m, d);
    if (candidate && candidate < today) y += 1;
  }
  const iso = toISO(y, m, d);
  if (!iso) return null;
  return iso;
}

/**
 * Data de VENCIMENTO de documento. Exige ano. Aceita também mês/ano
 * ("03/2030", "março de 2030") — nesse caso usa o dia 1º (conservador:
 * melhor avisar antes do que depois).
 */
export function parseExpiryDate(text: string): string | null {
  const n = normalize(text);
  const full = extractDayMonthYear(text);
  if (full && full.y !== undefined) return toISO(full.y, full.m, full.d);

  const monthYear = n.match(/\b(\d{1,2})\s*[/.-]\s*(\d{4})\b/);
  if (monthYear) return toISO(Number(monthYear[2]), Number(monthYear[1]), 1);

  const monthNameYear = n.match(/\b([a-z]+)\s+(?:de\s+)?(\d{4})\b/);
  if (monthNameYear) {
    const month = MONTHS[monthNameYear[1]!];
    if (month) return toISO(Number(monthNameYear[2]), month, 1);
  }
  return null;
}

function extractDayMonthYear(text: string): { d: number; m: number; y?: number } | null {
  const n = normalize(text);

  const numeric = n.match(/\b(\d{1,2})\s*[/.-]\s*(\d{1,2})(?:\s*[/.-]\s*(\d{2,4}))?\b/);
  if (numeric) {
    const d = Number(numeric[1]);
    const m = Number(numeric[2]);
    let y: number | undefined;
    if (numeric[3]) {
      y = Number(numeric[3]);
      if (numeric[3].length === 2) y += 2000;
      if (numeric[3].length === 3) return null;
    }
    if (m < 1 || m > 12) return null;
    return { d, m, y };
  }

  const named = n.match(/\b(\d{1,2})\s+(?:de\s+)?([a-z]+)(?:\s+(?:de\s+)?(\d{4}))?\b/);
  if (named) {
    const m = MONTHS[named[2]!];
    if (!m) return null;
    return { d: Number(named[1]), m, y: named[3] ? Number(named[3]) : undefined };
  }
  return null;
}

// ------------------------------------------------------------
// Horário de atendimento: seg a sex, 9h às 18h (São Paulo)
// ------------------------------------------------------------
export function isBusinessHours(now: Date): boolean {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: TIMEZONE,
    weekday: "short",
    hour: "numeric",
    hourCycle: "h23",
  }).formatToParts(now);
  const weekday = parts.find((p) => p.type === "weekday")?.value ?? "";
  const hour = Number(parts.find((p) => p.type === "hour")?.value ?? "0");
  const isWeekday = !["Sat", "Sun"].includes(weekday);
  return isWeekday && hour >= 9 && hour < 18;
}

// ------------------------------------------------------------
// Escolhas: aceita clique no botão, número ("2") ou texto parecido
// ------------------------------------------------------------
export interface ChoiceSpec<T extends string> {
  id: T;
  title: string;
  /** Palavras que também selecionam esta opção quando o cliente digita. */
  synonyms?: string[];
}

export function matchChoice<T extends string>(
  input: { kind: "text"; text: string } | { kind: "choice"; id: string; title: string },
  options: ChoiceSpec<T>[]
): T | null {
  if (input.kind === "choice") {
    const byId = options.find((o) => o.id === input.id);
    if (byId) return byId.id;
    const byTitle = options.find((o) => normalize(o.title) === normalize(input.title));
    return byTitle ? byTitle.id : null;
  }
  const n = normalize(input.text);
  if (/^\d+$/.test(n)) {
    const option = options[Number(n) - 1];
    if (option) return option.id;
  }
  const exact = options.find((o) => normalize(o.title) === n);
  if (exact) return exact.id;
  for (const option of options) {
    for (const syn of option.synonyms ?? []) {
      if (new RegExp(`(^|[^a-z])${normalize(syn)}([^a-z]|$)`).test(n)) return option.id;
    }
  }
  return null;
}

/** Cliente pediu para falar com uma pessoa? */
export function wantsHuman(text: string): boolean {
  const n = normalize(text);
  return /\b(atendente|atendimento humano|falar com (uma )?pessoa|humano)\b/.test(n);
}
