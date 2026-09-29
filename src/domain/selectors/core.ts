import type { DbState, ID, Invoice, Money, Payment, RefundRequest, ServiceLine } from "../types";
import { money, zero } from "../money";
import { isActiveStatus, SUPPLIER_PAYABLE_STATUSES } from "../status/line-statuses";
import { chargeItems, fingerprintOf, retainingRefundOf, type DocumentKind } from "./charges";
import { compareByServiceDate } from "./service-date";

export { serviceDate, serviceSortKey, lineTravelDates, compareByServiceDate } from "./service-date";

/** All lines of a file, in chronological order of service date (undated lines last). */
export function linesOfFile(db: DbState, fileId: ID): ServiceLine[] {
  return Object.values(db.lines)
    .filter((l) => l.fileId === fileId)
    .sort(compareByServiceDate);
}

/** Lines not in {cancelled, voided, refunded, exchanged}. */
export function activeLines(db: DbState, fileId: ID): ServiceLine[] {
  return linesOfFile(db, fileId).filter((l) => isActiveStatus(l.status));
}

/** Payments (in and out, any status) with an allocation to the file, oldest first. */
export function paymentsOfFile(db: DbState, fileId: ID): Payment[] {
  return Object.values(db.payments)
    .filter((p) => p.allocations.some((a) => a.fileId === fileId))
    .sort((a, b) => (a.receivedAt < b.receivedAt ? -1 : a.receivedAt > b.receivedAt ? 1 : 0));
}

/** The part of a payment allocated to a file (in the file's currency). */
export function allocationTo(payment: Payment, fileId: ID): Money | undefined {
  const allocs = payment.allocations.filter((a) => a.fileId === fileId);
  if (!allocs.length) return undefined;
  return money(
    allocs.reduce((s, a) => s + a.amount.amountMinor, 0),
    allocs[0].amount.currency,
  );
}

export function refundsOfFile(db: DbState, fileId: ID): RefundRequest[] {
  return Object.values(db.refunds)
    .filter((r) => r.fileId === fileId)
    .sort((a, b) => (a.requestedAt < b.requestedAt ? -1 : a.requestedAt > b.requestedAt ? 1 : 0));
}

/** Invoices and quotes of a file, newest first. */
export function invoicesOfFile(db: DbState, fileId: ID, kind?: DocumentKind): Invoice[] {
  return Object.values(db.invoices)
    .filter((i) => i.fileId === fileId && (!kind || i.kind === kind))
    .sort((a, b) => (a.issuedAt < b.issuedAt ? 1 : a.issuedAt > b.issuedAt ? -1 : 0));
}

/** The open ('issued') invoice — or quote — of a file. */
export function currentInvoice(db: DbState, fileId: ID, kind: DocumentKind = "invoice"): Invoice | undefined {
  return invoicesOfFile(db, fileId, kind).find((i) => i.status === "issued");
}

/** Fingerprint of what an invoice (or quote) of this file would contain right now. */
export function lineFingerprint(db: DbState, fileId: ID, kind: DocumentKind = "invoice"): string {
  return fingerprintOf(chargeItems(db, fileId, kind));
}

/** True when the open invoice no longer matches the file's lines ("Invoice outdated"). */
export function isInvoiceOutdated(db: DbState, fileId: ID, kind: DocumentKind = "invoice"): boolean {
  const inv = currentInvoice(db, fileId, kind);
  return !!inv && inv.snapshot.fingerprint !== lineFingerprint(db, fileId, kind);
}

/**
 * What the agency owes the supplier for a line before payments, in the line's pricing currency:
 * cost for issued business (issued, completed, refund_pending, exchanged); the supplier penalty for a refunded line;
 * zero otherwise.
 */
export function lineSupplierCost(db: DbState, line: ServiceLine): Money {
  if (SUPPLIER_PAYABLE_STATUSES.includes(line.status)) return line.pricing.cost;
  if (line.status === "refunded") {
    const refund = retainingRefundOf(db, line.id);
    return refund ? refund.quote.supplierPenalty : zero(line.pricing.currency);
  }
  return zero(line.pricing.currency);
}

/** Remaining amount owed to the supplier for a line (line currency). Negative when the supplier owes us (credit). */
export function lineSupplierDue(db: DbState, line: ServiceLine): Money {
  const cost = lineSupplierCost(db, line);
  return money(cost.amountMinor - (line.supplierPaidMinor || 0), cost.currency);
}
