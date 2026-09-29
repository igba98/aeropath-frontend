import type { BookingFile, Client, Currency, DbState, ID, LineType, Money, ServiceLine, User } from "@/domain/types";
import { fileTotals, type FileTotals } from "@/domain/selectors/fileTotals";
import { linesOfFile } from "@/domain/selectors/core";
import { fileStatus, travelDates, type FileStatus } from "@/domain/status/file-status";
import { fileDueAt, isOverdue, paymentStatus, type PaymentStatus } from "@/domain/status/payment-status";
import { isActiveStatus } from "@/domain/status/line-statuses";
import { convert } from "@/domain/money";
import { daysUntil } from "./dates";

/** One row of the bookings timetable, derived from the normalised tables. */
export interface BookingRow {
  id: ID;
  file: BookingFile;
  number: string;
  client?: Client;
  owner?: User;
  title: string;
  route: string[];
  lineTypes: LineType[];
  start?: string;
  end?: string;
  daysToStart?: number;
  status: FileStatus;
  pay: PaymentStatus;
  overdue: boolean;
  dueAt?: string;
  totals: FileTotals;
  pnrs: string[];
  createdAt: string;
  /** Earliest departure on an active flight line: airport-local time and flight number. */
  firstFlight?: { at: string; flight: string };
}

/** Airport chain for the first active flight line: DAR → DXB → DAR. Falls back to hotel/city names. */
export function routeOfLines(lines: ServiceLine[]): string[] {
  const flights = lines.filter((l) => l.type === "flight" && isActiveStatus(l.status)) as Extract<ServiceLine, { type: "flight" }>[];
  const f = flights[0] ?? (lines.find((l) => l.type === "flight") as Extract<ServiceLine, { type: "flight" }> | undefined);
  if (!f || !f.details.segments.length) return [];
  const segs = [...f.details.segments].sort((a, b) => a.departureLocal.localeCompare(b.departureLocal));
  const codes: string[] = [segs[0].origin];
  for (const s of segs) {
    if (codes[codes.length - 1] !== s.origin) codes.push(s.origin);
    codes.push(s.destination);
  }
  return codes;
}

function firstFlightOf(lines: ServiceLine[]): BookingRow["firstFlight"] {
  let best: BookingRow["firstFlight"];
  for (const l of lines) {
    if (l.type !== "flight" || !isActiveStatus(l.status)) continue;
    for (const s of l.details.segments) {
      if (!s.departureLocal) continue;
      if (!best || s.departureLocal < best.at) best = { at: s.departureLocal, flight: `${s.carrier} ${s.flightNumber}` };
    }
  }
  return best;
}

export function bookingRow(db: DbState, file: BookingFile, now: Date): BookingRow {
  const lines = linesOfFile(db, file.id);
  const totals = fileTotals(db, file.id);
  const dates = travelDates(db, file.id);
  const status = fileStatus(db, file.id, now);
  return {
    id: file.id,
    file,
    number: file.number,
    client: db.clients[file.clientId],
    owner: db.users[file.ownerId],
    title: file.title,
    route: routeOfLines(lines),
    lineTypes: lines.filter((l) => isActiveStatus(l.status) || status === "cancelled").map((l) => l.type),
    start: dates.start,
    end: dates.end,
    daysToStart: dates.start ? daysUntil(dates.start, now) : undefined,
    status,
    pay: paymentStatus(totals),
    overdue: isOverdue(db, file.id, now),
    dueAt: fileDueAt(db, file.id),
    totals,
    pnrs: lines.flatMap((l) => (l.type === "flight" ? [l.details.recordLocator] : [])),
    createdAt: file.createdAt,
    firstFlight: firstFlightOf(lines),
  };
}

export function bookingRows(db: DbState, now: Date, filter?: (f: BookingFile) => boolean): BookingRow[] {
  return Object.values(db.files)
    .filter((f) => (filter ? filter(f) : true))
    .map((f) => bookingRow(db, f, now))
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

/** Sum a list of amounts in mixed currencies into one display currency at the current rate. */
export function sumIn(list: Money[], to: Currency, usdTzs: number): Money {
  return list.reduce<Money>((acc, m) => ({ amountMinor: acc.amountMinor + convert(m, to, usdTzs).amountMinor, currency: to }), { amountMinor: 0, currency: to });
}

export const PAY_KEY: Record<PaymentStatus, string> = {
  none: "pay.none",
  unpaid: "pay.unpaid",
  partial: "pay.partial",
  paid: "pay.paid",
  credit: "pay.credit",
};
