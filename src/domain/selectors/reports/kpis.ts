import type { Currency, DbState, ISODateTime, Money } from "../../types";
import { add, convert, money, zero } from "../../money";
import { darToday, diffDaysISO } from "../../dates";
import { toFileMoney } from "../../pricing";
import { CHARGEABLE_STATUSES, SUPPLIER_PAYABLE_STATUSES } from "../../status/line-statuses";
import { retainedItem, retainingRefundOf } from "../charges";
import { accountBalance, payablesAging, receivablesAging } from "../balances";
import { inPeriod, lineStatusAt, linesByFile, monthStart, shiftMonth, trendOf, type Period } from "./common";
import { salesRows } from "./sales";

/**
 * Manager home KPIs (spec §9.1): this month to date vs the same days of last month. Flows (sales, margin, cash in)
 * sum over each period; stocks (cash, receivables, payables) are balances at "now" vs the same moment last month,
 * replayed from line status history, payments and the ledger.
 */

export interface Kpi {
  value: Money;
  previous: Money;
  /** Relative change (0.12 = +12 %); undefined when the previous value is zero. */
  trend?: number;
}

export interface MonthKpis {
  period: Period;
  previousPeriod: Period;
  sales: Kpi;
  margin: Kpi;
  cashIn: Kpi;
  /** Σ money accounts. */
  cash: Kpi;
  /** Σ positive booking balances (who owes us). */
  receivables: Kpi;
  /** Σ open supplier cost (what we owe). */
  payables: Kpi;
  currency: Currency;
  fxRate: number;
}

const kpi = (value: Money, previous: Money): Kpi => ({ value, previous, trend: trendOf(value.amountMinor, previous.amountMinor) });

/** Σ positive file balances at an instant (commercial view, as fileTotals), in `currency`. At "now" this equals the receivables aging total. */
export function receivablesAt(db: DbState, at: ISODateTime, currency: Currency = "TZS"): Money {
  const rate = db.settings.fx.USD_TZS;
  const received = new Map<string, number>();
  for (const p of Object.values(db.payments)) {
    if (p.receivedAt > at) continue;
    if (p.status === "reversed" && (!p.reversal || p.reversal.at <= at)) continue;
    const sign = p.direction === "in" ? 1 : -1;
    for (const a of p.allocations) {
      const file = db.files[a.fileId];
      if (!file) continue;
      const amt = a.amount.currency === file.currency ? a.amount : convert(a.amount, file.currency, p.fxRate ?? rate);
      received.set(a.fileId, (received.get(a.fileId) ?? 0) + sign * amt.amountMinor);
    }
  }
  let total = zero(currency);
  for (const file of Object.values(db.files)) {
    if (file.createdAt > at) continue;
    let charges = 0;
    for (const line of linesByFile(db).get(file.id) ?? []) {
      const s = lineStatusAt(line, at);
      if (!s) continue;
      if (CHARGEABLE_STATUSES.includes(s)) charges += toFileMoney(line.pricing.sell, file.currency, line.pricing.fxToFile, rate).amountMinor;
      else if (s === "refunded") {
        const refund = retainingRefundOf(db, line.id);
        if (refund && (!refund.decidedAt || refund.decidedAt <= at)) charges += retainedItem(db, file, line, refund).sell.amountMinor;
      }
    }
    const balance = charges - (received.get(file.id) ?? 0);
    if (balance > 0) total = add(total, convert(money(balance, file.currency), currency, rate));
  }
  return total;
}

/** Σ open supplier cost at an instant (cost of issued business, penalties of refunded lines, less supplier payments made by then). */
export function payablesAt(db: DbState, at: ISODateTime, currency: Currency = "TZS"): Money {
  const rate = db.settings.fx.USD_TZS;
  const paid = new Map<string, number>();
  for (const sp of Object.values(db.supplierPayments)) {
    if (sp.paidAt > at) continue;
    for (const a of sp.allocations) paid.set(a.lineId, (paid.get(a.lineId) ?? 0) + a.amount.amountMinor);
  }
  let total = zero(currency);
  for (const line of Object.values(db.lines)) {
    const s = lineStatusAt(line, at);
    let cost = 0;
    if (s && SUPPLIER_PAYABLE_STATUSES.includes(s)) cost = line.pricing.cost.amountMinor;
    else if (s === "refunded") {
      const refund = retainingRefundOf(db, line.id);
      if (refund && (!refund.decidedAt || refund.decidedAt <= at)) cost = refund.quote.supplierPenalty.amountMinor;
    }
    const due = cost - (paid.get(line.id) ?? 0);
    if (due !== 0) total = add(total, convert(money(due, line.pricing.currency), currency, rate));
  }
  return total;
}

/** Σ money account balances at an instant. */
export function cashAt(db: DbState, at: ISODateTime, currency: Currency = "TZS"): Money {
  return Object.values(db.moneyAccounts).reduce((acc, a) => add(acc, convert(accountBalance(db, a, at), currency, db.settings.fx.USD_TZS)), zero(currency));
}

/** Money received (payments in, not reversed) in a period. */
export function cashInFor(db: DbState, p: Period, currency: Currency = "TZS"): Money {
  return Object.values(db.payments)
    .filter((x) => x.direction === "in" && x.status !== "reversed" && inPeriod(x.receivedAt, p))
    .reduce((acc, x) => add(acc, convert(x.amount, currency, db.settings.fx.USD_TZS)), zero(currency));
}

export function monthKpis(db: DbState, now: Date, currency: Currency = "TZS"): MonthKpis {
  const today = darToday(now);
  const period = { from: monthStart(today), to: today };
  const prevTo = shiftMonth(today, -1);
  const previousPeriod = { from: monthStart(prevTo), to: prevTo };
  const prevAt = new Date(now.getTime() - diffDaysISO(prevTo, today) * 86_400_000).toISOString();
  const nowAt = now.toISOString();

  const cur = salesRows(db, period, currency);
  const prev = salesRows(db, previousPeriod, currency);
  const sum = (rows: typeof cur, k: "sell" | "margin") => rows.reduce((acc, r) => add(acc, r[k]), zero(currency));

  return {
    period,
    previousPeriod,
    sales: kpi(sum(cur, "sell"), sum(prev, "sell")),
    margin: kpi(sum(cur, "margin"), sum(prev, "margin")),
    cashIn: kpi(cashInFor(db, period, currency), cashInFor(db, previousPeriod, currency)),
    cash: kpi(cashAt(db, nowAt, currency), cashAt(db, prevAt, currency)),
    // Current stocks come from the aging reports themselves so Home and the reports show the very same figure.
    receivables: kpi(convert(receivablesAging(db, now).totals.total, currency, db.settings.fx.USD_TZS), receivablesAt(db, prevAt, currency)),
    payables: kpi(convert(payablesAging(db, now).totals.total, currency, db.settings.fx.USD_TZS), payablesAt(db, prevAt, currency)),
    currency,
    fxRate: db.settings.fx.USD_TZS,
  };
}
