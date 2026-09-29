import type { BookingFile, Currency, DbState, ID, ISODate, ISODateTime, LineStatus, Money, ServiceLine } from "../../types";
import { convert, money, zero } from "../../money";
import { addDaysISO, darToday, diffDaysISO, toDarDate } from "../../dates";
import { fileTotals, type FileTotals } from "../fileTotals";

/**
 * Shared helpers for balances, attention and reports: a per-DbState memo (the store replaces `db` on every change,
 * so caching by identity is safe), line event dates, period maths and display-currency conversion.
 */

// ───────────────────────────── Memo by db identity ─────────────────────────────

const memo = new WeakMap<DbState, Map<string, unknown>>();

/** Computes once per db object and key. */
export function cached<T>(db: DbState, key: string, fn: () => T): T {
  let m = memo.get(db);
  if (!m) {
    m = new Map();
    memo.set(db, m);
  }
  if (m.has(key)) return m.get(key) as T;
  const v = fn();
  m.set(key, v);
  return v;
}

/** fileTotals, memoised per db. */
export const totalsOf = (db: DbState, fileId: ID): FileTotals => cached(db, `totals:${fileId}`, () => fileTotals(db, fileId));

/** Lines grouped by file id. */
export const linesByFile = (db: DbState): Map<ID, ServiceLine[]> =>
  cached(db, "linesByFile", () => {
    const m = new Map<ID, ServiceLine[]>();
    for (const l of Object.values(db.lines)) {
      const list = m.get(l.fileId);
      if (list) list.push(l);
      else m.set(l.fileId, [l]);
    }
    return m;
  });

/** Files grouped by client id. */
export const filesByClient = (db: DbState): Map<ID, BookingFile[]> =>
  cached(db, "filesByClient", () => {
    const m = new Map<ID, BookingFile[]>();
    for (const f of Object.values(db.files)) {
      const list = m.get(f.clientId);
      if (list) list.push(f);
      else m.set(f.clientId, [f]);
    }
    return m;
  });

// ───────────────────────────── Line events ─────────────────────────────

/** When a line first moved to `status` (from its status history), or undefined. */
export function lineEventAt(line: ServiceLine, status: LineStatus): ISODateTime | undefined {
  return line.statusHistory.find((h) => h.to === status)?.at;
}

/** When a line was issued: the flight's issuedAt, else the first 'issued' history entry. */
export function lineIssuedAt(line: ServiceLine): ISODateTime | undefined {
  if (line.type === "flight" && line.details.issuedAt) return line.details.issuedAt;
  return lineEventAt(line, "issued");
}

/** The line's status at an instant, replayed from its history (the current status when the history is empty). */
export function lineStatusAt(line: ServiceLine, at: ISODateTime): LineStatus | null {
  if (!line.statusHistory.length) return line.createdAt <= at ? line.status : null;
  let s: LineStatus | null = null;
  for (const h of line.statusHistory) {
    if (h.at <= at) s = h.to;
    else break;
  }
  return s;
}

// ───────────────────────────── Periods ─────────────────────────────

export interface Period {
  from: ISODate;
  to: ISODate;
}

/** True when the instant (or date) falls on a Dar calendar day inside [from, to]. */
export function inPeriod(at: ISODateTime | ISODate | undefined, p: Period): boolean {
  if (!at) return false;
  const d = at.length === 10 ? at : toDarDate(at);
  return d >= p.from && d <= p.to;
}

/** The period of the same length immediately before `p`. */
export function previousPeriod(p: Period): Period {
  const len = diffDaysISO(p.from, p.to) + 1;
  return { from: addDaysISO(p.from, -len), to: addDaysISO(p.from, -1) };
}

export const monthStart = (d: ISODate): ISODate => `${d.slice(0, 7)}-01`;
export function monthEnd(d: ISODate): ISODate {
  const [y, m] = d.split("-").map(Number);
  const next = m === 12 ? `${y + 1}-01-01` : `${y}-${String(m + 1).padStart(2, "0")}-01`;
  return addDaysISO(next, -1);
}
/** Same calendar month shifted by `n` months (day clamped to the month's length). */
export function shiftMonth(d: ISODate, n: number): ISODate {
  const [y, m, day] = d.split("-").map(Number);
  const idx = y * 12 + (m - 1) + n;
  const ny = Math.floor(idx / 12);
  const nm = (idx % 12) + 1;
  const first = `${ny}-${String(nm).padStart(2, "0")}-01`;
  const last = Number(monthEnd(first).slice(8, 10));
  return `${first.slice(0, 8)}${String(Math.min(day, last)).padStart(2, "0")}`;
}

export type PeriodPreset = "today" | "week" | "month" | "last_month" | "year";

export const PERIOD_PRESETS: { value: PeriodPreset; label: string }[] = [
  { value: "today", label: "Today" },
  { value: "week", label: "This week" },
  { value: "month", label: "This month" },
  { value: "last_month", label: "Last month" },
  { value: "year", label: "This year" },
];

/** Date range of a preset in Dar es Salaam calendar days (weeks start on Monday). */
export function presetPeriod(preset: PeriodPreset, now: Date): Period {
  const today = darToday(now);
  switch (preset) {
    case "today":
      return { from: today, to: today };
    case "week": {
      const dow = new Date(`${today}T00:00:00Z`).getUTCDay(); // 0 Sunday
      const from = addDaysISO(today, -((dow + 6) % 7));
      return { from, to: addDaysISO(from, 6) };
    }
    case "month":
      return { from: monthStart(today), to: monthEnd(today) };
    case "last_month": {
      const prev = shiftMonth(monthStart(today), -1);
      return { from: prev, to: monthEnd(prev) };
    }
    case "year":
      return { from: `${today.slice(0, 4)}-01-01`, to: `${today.slice(0, 4)}-12-31` };
  }
}

/** Each calendar day from `from` to `to` inclusive. */
export function daysOf(p: Period): ISODate[] {
  const out: ISODate[] = [];
  for (let d = p.from; d <= p.to && out.length < 1000; d = addDaysISO(d, 1)) out.push(d);
  return out;
}

/** Month keys "YYYY-MM" covering the period. */
export function monthsOf(p: Period): string[] {
  const out: string[] = [];
  for (let d = monthStart(p.from); d <= p.to && out.length < 240; d = shiftMonth(d, 1)) out.push(d.slice(0, 7));
  return out;
}

/** Monday of the ISO week containing `d`. */
export function weekStart(d: ISODate): ISODate {
  const dow = new Date(`${d}T00:00:00Z`).getUTCDay();
  return addDaysISO(d, -((dow + 6) % 7));
}

// ───────────────────────────── Money ─────────────────────────────

/** Converts to `cur` at the current settings rate (reports total across currencies at the current rate, §8.1). */
export const toCur = (db: DbState, m: Money, cur: Currency): Money => convert(m, cur, db.settings.fx.USD_TZS);

/** Adds `m` (any currency) into an accumulator in the accumulator's currency. */
export function addIn(db: DbState, acc: Money, m: Money): Money {
  return money(acc.amountMinor + toCur(db, m, acc.currency).amountMinor, acc.currency);
}

export const zeroIn = zero;

/** Relative change (0.12 = +12 %); undefined when there is no previous value to compare against. */
export function trendOf(current: number, previous: number): number | undefined {
  if (!previous) return undefined;
  return (current - previous) / Math.abs(previous);
}

/** Major units as a plain number, for charts. */
export const toChart = (m: Money): number => m.amountMinor / 100;
