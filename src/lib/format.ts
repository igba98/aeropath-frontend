const DATE = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", year: "numeric" });
const DATE_SHORT = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short" });
const WEEKDAY = new Intl.DateTimeFormat("en-GB", { weekday: "short", day: "numeric", month: "short" });
const TIME = new Intl.DateTimeFormat("en-GB", { hour: "2-digit", minute: "2-digit", hour12: false });

const asDate = (v: string | Date) => (typeof v === "string" ? new Date(v.length === 10 ? v + "T00:00:00Z" : v) : v);

export const formatDate = (v: string | Date) => DATE.format(asDate(v));
export const formatDateShort = (v: string | Date) => DATE_SHORT.format(asDate(v));
export const formatWeekday = (v: string | Date) => WEEKDAY.format(asDate(v));
export const formatTime = (v: string | Date) => TIME.format(asDate(v));
export const formatDateTime = (v: string | Date) => `${DATE_SHORT.format(asDate(v))} · ${TIME.format(asDate(v))}`;

export function formatRange(from: string, to: string) {
  const a = asDate(from), b = asDate(to);
  if (a.getUTCMonth() === b.getUTCMonth() && a.getUTCFullYear() === b.getUTCFullYear()) {
    return `${a.getUTCDate()}–${b.getUTCDate()} ${DATE_SHORT.format(b).split(" ")[1]} ${b.getUTCFullYear()}`;
  }
  return `${DATE_SHORT.format(a)} – ${DATE.format(b)}`;
}

/** "in 12 minutes", "3 hours ago" */
export function relativeTime(v: string | Date): string {
  const ms = asDate(v).getTime() - Date.now();
  const abs = Math.abs(ms);
  const rtf = new Intl.RelativeTimeFormat("en", { numeric: "auto" });
  if (abs < 60_000) return rtf.format(Math.round(ms / 1000), "second");
  if (abs < 3_600_000) return rtf.format(Math.round(ms / 60_000), "minute");
  if (abs < 86_400_000) return rtf.format(Math.round(ms / 3_600_000), "hour");
  return rtf.format(Math.round(ms / 86_400_000), "day");
}

/** mm:ss for hold countdowns */
export function countdown(ms: number): string {
  if (ms <= 0) return "00:00";
  const total = Math.floor(ms / 1000);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const pad = (n: number) => n.toString().padStart(2, "0");
  return h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${pad(m)}:${pad(s)}`;
}

export const today = () => new Date().toISOString().slice(0, 10);
export const addDays = (isoDate: string, n: number) => new Date(new Date(isoDate + "T00:00:00Z").getTime() + n * 86_400_000).toISOString().slice(0, 10);
export const daysUntil = (v: string) => Math.ceil((asDate(v).getTime() - Date.now()) / 86_400_000);

export function initials(name: string) {
  return name.split(" ").filter(Boolean).slice(0, 2).map((p) => p[0]?.toUpperCase()).join("");
}
