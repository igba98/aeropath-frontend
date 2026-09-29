/**
 * Small, pure date helpers for the provider layer. Everything is computed with UTC arithmetic so the
 * result never depends on the machine's timezone. Dar es Salaam is UTC+3 all year (no DST).
 */
import type { ISODate, ISODateTime, LocalDateTime } from "@/domain/types";

export const DAR_UTC_OFFSET_HOURS = 3;

export const MONTHS: Record<string, number> = {
  JAN: 0, FEB: 1, MAR: 2, APR: 3, MAY: 4, JUN: 5, JUL: 6, AUG: 7, SEP: 8, OCT: 9, NOV: 10, DEC: 11,
};

const pad = (n: number, w = 2) => String(n).padStart(w, "0");

export function isoDate(year: number, month0: number, day: number): ISODate {
  return `${pad(year, 4)}-${pad(month0 + 1)}-${pad(day)}`;
}

export function isValidYmd(year: number, month0: number, day: number): boolean {
  if (month0 < 0 || month0 > 11 || day < 1 || day > 31) return false;
  const d = new Date(Date.UTC(year, month0, day));
  return d.getUTCFullYear() === year && d.getUTCMonth() === month0 && d.getUTCDate() === day;
}

function ymd(iso: ISODate): { y: number; m: number; d: number } {
  const [y, m, d] = iso.slice(0, 10).split("-").map(Number);
  return { y, m: m - 1, d };
}

const DAY_MS = 86_400_000;

/** "2026-10-12" + 3 → "2026-10-15" */
export function addDaysIso(iso: ISODate, days: number): ISODate {
  const { y, m, d } = ymd(iso);
  const t = new Date(Date.UTC(y, m, d) + days * DAY_MS);
  return isoDate(t.getUTCFullYear(), t.getUTCMonth(), t.getUTCDate());
}

/** "2026-10-12T16:50" + 1 → "2026-10-13T16:50" (time part kept as is). */
export function addDaysLocal(local: LocalDateTime, days: number): LocalDateTime {
  return addDaysIso(local.slice(0, 10), days) + local.slice(10);
}

/** Whole days from b to a (a − b). */
export function diffDaysIso(a: ISODate, b: ISODate): number {
  const A = ymd(a);
  const B = ymd(b);
  return Math.round((Date.UTC(A.y, A.m, A.d) - Date.UTC(B.y, B.m, B.d)) / DAY_MS);
}

/** Calendar date in Dar es Salaam at the instant `now`. */
export function darLocalDate(now: Date): ISODate {
  const t = new Date(now.getTime() + DAR_UTC_OFFSET_HOURS * 3_600_000);
  return isoDate(t.getUTCFullYear(), t.getUTCMonth(), t.getUTCDate());
}

/** Dar-local wall time → UTC instant, e.g. ("2026-10-05", 23, 59) → "2026-10-05T20:59:00.000Z". */
export function darLocalToUtcIso(iso: ISODate, hours: number, minutes: number): ISODateTime {
  const { y, m, d } = ymd(iso);
  return new Date(Date.UTC(y, m, d, hours - DAR_UTC_OFFSET_HOURS, minutes)).toISOString();
}

/**
 * Next occurrence of day/month on or after `ref` (an ISO date). Used for PNR dates without a year
 * ("12OCT"). Looks up to 8 years ahead so 29FEB resolves to the next leap year. Null if impossible.
 */
export function nextOccurrence(day: number, month0: number, ref: ISODate): ISODate | null {
  const r = ymd(ref);
  for (let year = r.y; year <= r.y + 8; year++) {
    if (!isValidYmd(year, month0, day)) continue;
    const candidate = isoDate(year, month0, day);
    if (diffDaysIso(candidate, ref) >= 0) return candidate;
  }
  return null;
}

/** Minutes between two local datetimes, treating both as the same (floating) zone. */
export function minutesBetweenLocal(a: LocalDateTime, b: LocalDateTime): number {
  const toMs = (s: LocalDateTime) => {
    const { y, m, d } = ymd(s);
    const hh = Number(s.slice(11, 13)) || 0;
    const mm = Number(s.slice(14, 16)) || 0;
    return Date.UTC(y, m, d, hh, mm);
  };
  return Math.round((toMs(b) - toMs(a)) / 60_000);
}
