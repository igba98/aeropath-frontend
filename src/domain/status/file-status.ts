import type { DbState, ID, ISODate } from "../types";
import { darToday } from "../dates";
import { activeLines, linesOfFile } from "../selectors/core";
import { isActiveStatus } from "./line-statuses";
import { lineTravelDates } from "../selectors/service-date";
import { fileTotals } from "../selectors/fileTotals";

/**
 * Booking file status (spec §7.2) — derived, never stored.
 *
 *   draft      no lines, or every active line is quoted
 *   confirmed  any active line booked/issued/refund_pending and the last travel date is today or later (or unknown)
 *   travelled  every active line issued/completed and the last travel date has passed
 *   closed     travelled and the balance is 0
 *   cancelled  cancelledAt set, or the file has lines but none are active
 */

export type FileStatus = "draft" | "confirmed" | "travelled" | "closed" | "cancelled";

export const FILE_STATUS_LABELS: Record<FileStatus, string> = {
  draft: "Draft",
  confirmed: "Confirmed",
  travelled: "Travelled",
  closed: "Closed",
  cancelled: "Cancelled",
};

export interface TravelDates {
  start?: ISODate;
  end?: ISODate;
}

/**
 * Earliest and latest travel dates across the file's active lines (flight departure/arrival local dates, hotel
 * check-in/out, car pick-up/drop-off, transfer, tour start/end, insurance cover). Pass includeInactive to use every
 * line (e.g. to show the dates of a cancelled file).
 */
export function travelDates(db: DbState, fileId: ID, opts?: { includeInactive?: boolean }): TravelDates {
  const lines = opts?.includeInactive ? linesOfFile(db, fileId) : activeLines(db, fileId);
  const dates = lines.flatMap(lineTravelDates).filter(Boolean).sort();
  return dates.length ? { start: dates[0], end: dates[dates.length - 1] } : {};
}

export function fileStatus(db: DbState, fileId: ID, now: Date): FileStatus {
  const file = db.files[fileId];
  if (!file) return "draft";
  if (file.cancelledAt) return "cancelled";
  const all = linesOfFile(db, fileId);
  const active = all.filter((l) => isActiveStatus(l.status));
  if (all.length > 0 && active.length === 0) return "cancelled";
  if (active.every((l) => l.status === "quoted")) return "draft";

  const { end } = travelDates(db, fileId);
  const today = darToday(now);
  const past = !!end && end < today;

  if (past && active.every((l) => l.status === "issued" || l.status === "completed")) {
    return fileTotals(db, fileId).balance.amountMinor === 0 ? "closed" : "travelled";
  }
  return "confirmed";
}
