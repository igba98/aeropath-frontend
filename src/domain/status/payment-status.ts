import type { DbState, ID, ISODate } from "../types";
import { addDaysISO, darToday, toDarDate } from "../dates";
import { activeLines, currentInvoice } from "../selectors/core";
import { fileTotals, type FileTotals } from "../selectors/fileTotals";
import { travelDates } from "./file-status";

/**
 * Payment status of a file (spec §7.3), from fileTotals.
 *
 *   none     charges = 0 (and nothing received)
 *   unpaid   received = 0 and charges > 0
 *   partial  0 < received < charges
 *   paid     received = charges
 *   credit   received > charges (money is owed back to the client) — also after a void when the client had paid
 */

export type PaymentStatus = "none" | "unpaid" | "partial" | "paid" | "credit";

export const PAYMENT_STATUS_LABELS: Record<PaymentStatus, string> = {
  none: "—",
  unpaid: "Unpaid",
  partial: "Partial",
  paid: "Paid",
  credit: "Credit",
};

export function paymentStatus(totals: Pick<FileTotals, "charges" | "received">): PaymentStatus {
  const charges = totals.charges.amountMinor;
  const received = totals.received.amountMinor;
  if (received > charges) return "credit";
  if (charges === 0) return "none";
  if (received <= 0) return "unpaid";
  if (received < charges) return "partial";
  return "paid";
}

/**
 * When the file's balance is due.
 * Individuals: the earlier of the ticketing time limit (booked flights) and the first travel date; otherwise the
 * open invoice's date. Corporates: invoice date + payment terms (client terms, else settings default); without an
 * invoice the file's creation date stands in for the invoice date.
 * `invoiceDate` overrides the invoice date (used while issuing a new invoice).
 */
export function fileDueAt(db: DbState, fileId: ID, opts?: { invoiceDate?: ISODate }): ISODate | undefined {
  const file = db.files[fileId];
  if (!file) return undefined;
  const client = db.clients[file.clientId];
  const inv = currentInvoice(db, fileId, "invoice");
  const invoiceDate = opts?.invoiceDate ?? (inv ? toDarDate(inv.issuedAt) : undefined);

  if (client?.type === "corporate") {
    const terms = client.paymentTermsDays ?? db.settings.defaultPaymentTermsDays;
    return addDaysISO(invoiceDate ?? toDarDate(file.createdAt), terms);
  }

  const candidates: ISODate[] = [];
  for (const line of activeLines(db, fileId)) {
    if (line.type === "flight" && line.status === "booked" && line.details.ticketingTimeLimit) {
      candidates.push(toDarDate(line.details.ticketingTimeLimit));
    }
  }
  const { start } = travelDates(db, fileId);
  if (start) candidates.push(start);
  if (candidates.length) return candidates.sort()[0];
  return invoiceDate;
}

/** Balance > 0 and the due date has passed (Dar es Salaam calendar). */
export function isOverdue(db: DbState, fileId: ID, now: Date): boolean {
  if (fileTotals(db, fileId).balance.amountMinor <= 0) return false;
  const due = fileDueAt(db, fileId);
  return !!due && due < darToday(now);
}
