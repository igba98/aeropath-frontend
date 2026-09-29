import { formatInTimeZone, fromZonedTime } from "date-fns-tz";
import { differenceInCalendarDays, differenceInMinutes, parseISO } from "date-fns";
import type { ISODate, ISODateTime, LocalDateTime } from "@/domain/types";

/** Display timezone for everything that is not airport-local. */
export const TZ = "Africa/Dar_es_Salaam";

type DateLike = Date | ISODateTime | ISODate;

const toDate = (d: DateLike): Date => (d instanceof Date ? d : d.length === 10 ? parseISO(d + "T12:00:00Z") : parseISO(d));
const isPlainDate = (d: DateLike) => typeof d === "string" && d.length === 10;

/** 12 Oct 2026 */
export function fmtDate(d?: DateLike | null): string {
  if (!d) return "—";
  if (isPlainDate(d)) return formatInTimeZone(toDate(d), "UTC", "d MMM yyyy");
  return formatInTimeZone(toDate(d), TZ, "d MMM yyyy");
}

/** 12 Oct */
export function fmtDay(d?: DateLike | null): string {
  if (!d) return "—";
  if (isPlainDate(d)) return formatInTimeZone(toDate(d), "UTC", "d MMM");
  return formatInTimeZone(toDate(d), TZ, "d MMM");
}

/** Mon 12 Oct */
export function fmtWeekday(d?: DateLike | null): string {
  if (!d) return "—";
  if (isPlainDate(d)) return formatInTimeZone(toDate(d), "UTC", "EEE d MMM");
  return formatInTimeZone(toDate(d), TZ, "EEE d MMM");
}

/** 16:50 (Dar) */
export function fmtTime(d?: Date | ISODateTime | null): string {
  if (!d) return "—";
  return formatInTimeZone(toDate(d), TZ, "HH:mm");
}

/** 12 Oct 2026, 16:50 (Dar) */
export function fmtDateTime(d?: Date | ISODateTime | null): string {
  if (!d) return "—";
  return formatInTimeZone(toDate(d), TZ, "d MMM yyyy, HH:mm");
}

/** Airport-local "2026-10-12T16:50" → { date: "12 Oct", time: "16:50", day: "Mon" } with no zone conversion. */
export function splitLocal(l?: LocalDateTime | null): { date: string; time: string; weekday: string; iso: ISODate } {
  if (!l) return { date: "—", time: "—", weekday: "", iso: "" };
  const d = parseISO(l.slice(0, 16) + ":00Z");
  return {
    date: formatInTimeZone(d, "UTC", "d MMM"),
    time: formatInTimeZone(d, "UTC", "HH:mm"),
    weekday: formatInTimeZone(d, "UTC", "EEE"),
    iso: l.slice(0, 10),
  };
}

/** Today's calendar date in Dar, as ISODate. */
export function darToday(now: Date = new Date()): ISODate {
  return formatInTimeZone(now, TZ, "yyyy-MM-dd");
}

/** Value for <input type="datetime-local"> in Dar time. */
export function toDarInput(d: Date | ISODateTime = new Date()): string {
  return formatInTimeZone(toDate(d), TZ, "yyyy-MM-dd'T'HH:mm");
}

/** Parse a Dar-local "yyyy-MM-ddTHH:mm" into a UTC ISO string. */
export function fromDarInput(v: string): ISODateTime {
  return fromZonedTime(v, TZ).toISOString();
}

/** "in 6 h", "in 2 d", "3 h ago", "now" — compact, for due columns. */
export function fmtRelative(target: Date | ISODateTime, now: Date = new Date()): string {
  const t = toDate(target);
  const mins = differenceInMinutes(t, now);
  const a = Math.abs(mins);
  let s: string;
  if (a < 1) return "now";
  if (a < 60) s = `${a} min`;
  else if (a < 60 * 48) s = `${Math.round(a / 60)} h`;
  else s = `${Math.round(a / 1440)} d`;
  return mins >= 0 ? `in ${s}` : `${s} ago`;
}

/** Whole calendar days from `now` to `d` (Dar dates). Negative when past. */
export function daysUntil(d: DateLike, now: Date = new Date()): number {
  const target = isPlainDate(d) ? (d as string) : formatInTimeZone(toDate(d), TZ, "yyyy-MM-dd");
  return differenceInCalendarDays(parseISO(target + "T00:00:00Z"), parseISO(darToday(now) + "T00:00:00Z"));
}

/** 12–26 Oct 2026, or 28 Sep – 3 Oct 2026 */
export function fmtRange(start?: ISODate | null, end?: ISODate | null): string {
  if (!start) return "—";
  if (!end || end === start) return fmtDate(start);
  const s = toDate(start);
  const e = toDate(end);
  const sameYear = s.getUTCFullYear() === e.getUTCFullYear();
  const sameMonth = sameYear && s.getUTCMonth() === e.getUTCMonth();
  if (sameMonth) return `${formatInTimeZone(s, "UTC", "d")}–${formatInTimeZone(e, "UTC", "d MMM yyyy")}`;
  if (sameYear) return `${formatInTimeZone(s, "UTC", "d MMM")} – ${formatInTimeZone(e, "UTC", "d MMM yyyy")}`;
  return `${fmtDate(start)} – ${fmtDate(end)}`;
}
