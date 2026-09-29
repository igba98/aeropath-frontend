import type { DbState, JournalEntry } from "../types";
import { darToday } from "../dates";
import { hasUsd, inView, isPnlAccount, neg, netByAccount, netByAccountSub, rateOf } from "./books";
import { acctPeriod } from "./periods";
import { shiftMonth } from "../selectors/reports/common";
import { reconciliationStatuses, type ReconciliationStatus } from "./reconciliation";

/** Accounting overview figures, from the books in TZS (USD converted at the settings rate). */

export interface AccountingOverview {
  /** Money in every bank, mobile-money, card and cash account (net of overdrafts). */
  cash: number;
  /** Clients with a debit balance (trade receivables). */
  receivables: number;
  /** Suppliers with a credit balance (trade payables). */
  payables: number;
  vatPayable: number;
  /** Month to date. */
  profitMonth: number;
  /** The same days of last month, for the trend. */
  profitLastMonth: number;
  converted: boolean;
  recentJournals: JournalEntry[];
  reconciliations: ReconciliationStatus[];
}

export function accountingOverview(db: DbState, now: Date): AccountingOverview {
  const rate = rateOf(db);
  const today = darToday(now);
  const subs = netByAccountSub(db, { to: today });
  let cash = 0;
  let receivables = 0;
  let payables = 0;
  for (const s of subs) {
    const v = inView(s.net, "base", rate);
    if (s.account === "1100") cash += v;
    else if (s.account === "1200" && v > 0) receivables += v;
    else if (s.account === "2100" && v < 0) payables -= v;
  }
  const vatNet = subs.filter((s) => s.account === "2300").reduce((acc, s) => acc + inView(s.net, "base", rate), 0);
  const profitOf = (from: string, to: string) => {
    let p = 0;
    for (const [code, n] of netByAccount(db, { from, to, realOnly: true })) if (isPnlAccount(code)) p -= inView(n, "base", rate);
    return p;
  };
  const month = acctPeriod("month", now);
  const last = acctPeriod("last_month", now);
  const sameDayLastMonth = shiftMonth(today, -1); // day clamped to last month's length
  return {
    cash,
    receivables,
    payables,
    vatPayable: neg(vatNet),
    profitMonth: profitOf(month.from, today),
    profitLastMonth: profitOf(last.from, sameDayLastMonth < last.to ? sameDayLastMonth : last.to),
    converted: hasUsd(subs.map((s) => s.net)),
    recentJournals: Object.values(db.journals ?? {})
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      .slice(0, 6),
    reconciliations: reconciliationStatuses(db, today),
  };
}
