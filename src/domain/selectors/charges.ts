import type { BookingFile, DbState, ID, LineStatus, Money, RefundRequest, ServiceLine } from "../types";
import { sub } from "../money";
import { pricingInFileCurrency, toFileMoney } from "../pricing";
import { refundRetainsCharges, retainedParts } from "../refunds";
import { CHARGEABLE_STATUSES, QUOTE_STATUSES } from "../status/line-statuses";
import { compareByServiceDate } from "./service-date";

/**
 * Charge items of a file, in the FILE currency: the building block for fileTotals (§8.3), invoice/quote snapshots
 * and the "invoice outdated" fingerprint. One source of truth, so the invoice total always equals charges.
 *
 * Invoice items: every line in {booked, issued, completed, refund_pending, exchanged} plus, for each approved refund,
 * the retained charges (supplier penalty + agency fee + VAT on it + original markup, fee and VAT unless waived).
 * Quote items: lines in {quoted, booked}.
 */

export type DocumentKind = "invoice" | "quote";

export interface ChargeItem {
  source: "line" | "refund_retained";
  lineId: ID;
  refundId?: ID;
  lineStatus: LineStatus;
  description: string;
  travellerIds: ID[];
  cost: Money;
  markup: Money;
  serviceFee: Money;
  vat: Money;
  sell: Money;
}

const fileLines = (db: DbState, fileId: ID): ServiceLine[] =>
  Object.values(db.lines)
    .filter((l) => l.fileId === fileId)
    .sort(compareByServiceDate);

/** The approved refund (kind 'refund') that retains charges on a refunded line, if any. */
export function retainingRefundOf(db: DbState, lineId: ID): RefundRequest | undefined {
  return Object.values(db.refunds)
    .filter((r) => r.lineId === lineId && refundRetainsCharges(r))
    .sort((a, b) => (a.requestedAt < b.requestedAt ? 1 : -1))[0];
}

export function retainedItem(db: DbState, file: BookingFile, line: ServiceLine, refund: RefundRequest): ChargeItem {
  const rate = db.settings.fx.USD_TZS;
  const fx = line.pricing.fxToFile;
  const parts = retainedParts(refund.quote, line.pricing);
  const f = (m: Money) => toFileMoney(m, file.currency, fx, rate);
  return {
    source: "refund_retained",
    lineId: line.id,
    refundId: refund.id,
    lineStatus: line.status,
    description: `Refund ${refund.number}: penalty and fees kept · ${line.description}`,
    travellerIds: line.travellerIds,
    cost: f(parts.cost),
    markup: f(parts.markup),
    serviceFee: f(parts.serviceFee),
    vat: f(parts.vat),
    // Exactly sell − clientRefund in file currency, so a payout of the converted client refund nets the balance to zero.
    sell: sub(f(line.pricing.sell), f(refund.quote.clientRefund)),
  };
}

export function chargeItems(db: DbState, fileId: ID, kind: DocumentKind = "invoice"): ChargeItem[] {
  const file = db.files[fileId];
  if (!file) return [];
  const rate = db.settings.fx.USD_TZS;
  const statuses = kind === "invoice" ? CHARGEABLE_STATUSES : QUOTE_STATUSES;
  const items: ChargeItem[] = [];
  for (const line of fileLines(db, fileId)) {
    if (statuses.includes(line.status)) {
      const p = pricingInFileCurrency(line.pricing, file.currency, rate);
      items.push({
        source: "line",
        lineId: line.id,
        lineStatus: line.status,
        description: line.status === "exchanged" ? `${line.description} (exchanged)` : line.description,
        travellerIds: line.travellerIds,
        ...p,
      });
    } else if (kind === "invoice" && line.status === "refunded") {
      const refund = retainingRefundOf(db, line.id);
      if (refund) items.push(retainedItem(db, file, line, refund));
    }
  }
  return items;
}

/** Short stable hash of charge items; differs when anything that would change the document changes. */
export function fingerprintOf(items: ChargeItem[]): string {
  const text = items
    .map((i) => `${i.source}:${i.lineId}:${i.description}:${i.sell.amountMinor}${i.sell.currency}:${i.vat.amountMinor}:${i.travellerIds.join(",")}`)
    .join("|");
  let h = 5381;
  for (let k = 0; k < text.length; k++) h = ((h << 5) + h + text.charCodeAt(k)) | 0;
  return `${items.length}-${(h >>> 0).toString(36)}`;
}
