import type { Currency, DbState, ID, Money } from "../types";
import { add, convert, money, sub, zero } from "../money";
import { toFileMoney } from "../pricing";
import { chargeItems } from "./charges";
import { lineSupplierDue } from "./core";

/**
 * File totals (spec §8.3), all in the FILE currency. Lines convert with the rate saved on the line (pricing.fxToFile),
 * or the settings rate when none was captured.
 *
 *   charges  = Σ sell of lines in {booked, issued, completed, refund_pending, exchanged*}
 *            + Σ retained charges of approved refunds
 *   received = Σ allocations of payments in (not reversed) − Σ allocations of payments out (not reversed)
 *   balance  = charges − received          (> 0 client owes us; < 0 we owe the client)
 *   cost     = Σ cost of the same lines + supplier penalties of refunded lines
 *   margin   = markup + serviceFee of the same lines + retained agency fees (and, unless waived, retained markup and fee)
 *   supplierOwed = Σ cost of issued business (penalty for refunded lines) − Σ supplier payments on those lines
 *
 * * exchanged lines stay in charges: an exchange does not reverse the original ticket (§8.6).
 */

export interface FileTotals {
  currency: Currency;
  charges: Money;
  received: Money;
  balance: Money;
  cost: Money;
  margin: Money;
  supplierOwed: Money;
  vat: Money;
  /** Service fees charged, including agency refund fees kept. */
  serviceFee: Money;
  markup: Money;
}

export function emptyTotals(currency: Currency): FileTotals {
  const z = zero(currency);
  return { currency, charges: z, received: z, balance: z, cost: z, margin: z, supplierOwed: z, vat: z, serviceFee: z, markup: z };
}

/** Money received for the file (in − out, not reversed), in the file currency. */
export function fileReceived(db: DbState, fileId: ID): Money {
  const file = db.files[fileId];
  if (!file) return zero("TZS");
  let minor = 0;
  for (const p of Object.values(db.payments)) {
    if (p.status === "reversed") continue;
    const sign = p.direction === "in" ? 1 : -1;
    for (const a of p.allocations) {
      if (a.fileId !== fileId) continue;
      const amt = a.amount.currency === file.currency ? a.amount : convert(a.amount, file.currency, p.fxRate ?? db.settings.fx.USD_TZS);
      minor += sign * amt.amountMinor;
    }
  }
  return money(minor, file.currency);
}

export function fileTotals(db: DbState, fileId: ID): FileTotals {
  const file = db.files[fileId];
  if (!file) return emptyTotals("TZS");
  const c = file.currency;
  const rate = db.settings.fx.USD_TZS;

  const t = emptyTotals(c);
  for (const item of chargeItems(db, fileId, "invoice")) {
    t.charges = add(t.charges, item.sell);
    t.cost = add(t.cost, item.cost);
    t.markup = add(t.markup, item.markup);
    t.serviceFee = add(t.serviceFee, item.serviceFee);
    t.vat = add(t.vat, item.vat);
  }
  t.margin = add(t.markup, t.serviceFee);
  t.received = fileReceived(db, fileId);
  t.balance = sub(t.charges, t.received);

  let owed = zero(c);
  for (const line of Object.values(db.lines)) {
    if (line.fileId !== fileId) continue;
    const due = lineSupplierDue(db, line);
    if (due.amountMinor !== 0) owed = add(owed, toFileMoney(due, c, line.pricing.fxToFile, rate));
  }
  t.supplierOwed = owed;
  return t;
}
