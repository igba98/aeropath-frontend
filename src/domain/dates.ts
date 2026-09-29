import type { ISODate, ISODateTime, LocalDateTime } from "./types";

/**
 * Date helpers for the domain layer. Display and business time zone is Africa/Dar_es_Salaam:
 * UTC+3 all year, no daylight saving, so a fixed offset is exact.
 */

export const DAR_OFFSET_MINUTES = 180;
const OFFSET_MS = DAR_OFFSET_MINUTES * 60_000;
const DAY_MS = 86_400_000;

export const iso = (d: Date): ISODateTime => d.toISOString();

/** Calendar date in Dar es Salaam for an instant. */
export function toDarDate(d: Date | ISODateTime): ISODate {
  const t = typeof d === "string" ? Date.parse(d) : d.getTime();
  return new Date(t + OFFSET_MS).toISOString().slice(0, 10);
}

/** Dar-local wall clock "YYYY-MM-DDTHH:mm" for an instant. */
export function toDarLocal(d: Date | ISODateTime): LocalDateTime {
  const t = typeof d === "string" ? Date.parse(d) : d.getTime();
  return new Date(t + OFFSET_MS).toISOString().slice(0, 16);
}

export const darToday = (now: Date): ISODate => toDarDate(now);
export const darYear = (now: Date): number => Number(toDarDate(now).slice(0, 4));

/** 23:59:59 Dar time on the given date, as a UTC instant. */
export function endOfDarDay(date: ISODate): ISODateTime {
  return new Date(Date.parse(`${date}T23:59:59.000Z`) - OFFSET_MS).toISOString();
}

/** Converts a Dar-local wall clock ("YYYY-MM-DDTHH:mm[:ss]") or date (noon) to a UTC instant. */
export function darLocalToUtc(local: LocalDateTime | ISODate): ISODateTime {
  const s = /^\d{4}-\d{2}-\d{2}$/.test(local) ? `${local}T12:00:00` : local.length === 16 ? `${local}:00` : local;
  return new Date(Date.parse(`${s}Z`) - OFFSET_MS).toISOString();
}

export function addDaysISO(date: ISODate, days: number): ISODate {
  return new Date(Date.parse(`${date}T00:00:00.000Z`) + days * DAY_MS).toISOString().slice(0, 10);
}

/** Whole days from a to b (b − a). */
export function diffDaysISO(a: ISODate, b: ISODate): number {
  return Math.round((Date.parse(`${b}T00:00:00.000Z`) - Date.parse(`${a}T00:00:00.000Z`)) / DAY_MS);
}

export const isISODate = (s: string): boolean => /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(Date.parse(`${s}T00:00:00Z`));

/**
 * Parses a date-time typed or sent by the UI. Accepts a full ISO instant (with Z or offset),
 * a Dar-local "YYYY-MM-DDTHH:mm[:ss]" (as from <input type="datetime-local">), or a date (taken as noon Dar time).
 * Returns null when it cannot be read.
 */
export function parseDateTimeInput(s: string): ISODateTime | null {
  const v = s.trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(v)) return isISODate(v) ? darLocalToUtc(v) : null;
  if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d+)?)?$/.test(v)) {
    const out = darLocalToUtc(v.slice(0, 19));
    return Number.isNaN(Date.parse(out)) ? null : out;
  }
  if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d+)?)?(Z|[+-]\d{2}:?\d{2})$/.test(v)) {
    const t = Date.parse(v);
    return Number.isNaN(t) ? null : new Date(t).toISOString();
  }
  return null;
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** "2026-10-12" or "2026-10-12T16:50" → "12 Oct" */
export function shortDate(dateOrLocal: string): string {
  const [y, m, d] = dateOrLocal.slice(0, 10).split("-");
  if (!y || !m || !d) return dateOrLocal;
  return `${Number(d)} ${MONTHS[Number(m) - 1] ?? m}`;
}
