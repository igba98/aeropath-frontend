import type { AccountCode, Currency, DbState, ISODate } from "../types";
import type { AccountKind } from "../ledger/accounts";
import { ACCOUNT_LIST, emptyNet, hasUsd, inView, movementsByAccount, netByAccount, rateOf, viewCurrency, type CurrencyView } from "./books";

/**
 * Trial balance: every account's closing balance as at a date (debit or credit column), and the gross debits and
 * credits posted in a period. Both columns pairs add up to the same total because every ledger group balances per
 * currency. Income and expense accounts show the financial year to date; earlier years sit in retained earnings.
 */

export interface TrialBalanceRow {
  code: AccountCode;
  name: string;
  kind: AccountKind;
  /** Closing net debit as at `to` (negative = credit balance). */
  net: number;
  debit: number;
  credit: number;
  /** Real postings in the period [from, to]. */
  periodDebit: number;
  periodCredit: number;
}

export interface TrialBalance {
  from: ISODate;
  to: ISODate;
  view: CurrencyView;
  currency: Currency;
  rate: number;
  converted: boolean;
  rows: TrialBalanceRow[];
  totals: { debit: number; credit: number; periodDebit: number; periodCredit: number };
  /**
   * Σ closing nets after conversion. Always 0 when the rate is a whole number; with a fractional rate, converting
   * each account on its own can leave a few cents, shown as a "Currency conversion rounding" line.
   */
  rounding: number;
  balanced: boolean;
}

export function trialBalance(db: DbState, p: { from: ISODate; to: ISODate; view: CurrencyView; includeZero?: boolean }): TrialBalance {
  const rate = rateOf(db);
  const closing = netByAccount(db, { to: p.to });
  const moves = movementsByAccount(db, { from: p.from, to: p.to });
  const rows: TrialBalanceRow[] = [];
  for (const a of ACCOUNT_LIST) {
    const net = inView(closing.get(a.code) ?? emptyNet(), p.view, rate);
    const mv = moves.get(a.code);
    const periodDebit = mv ? inView(mv.debit, p.view, rate) : 0;
    const periodCredit = mv ? inView(mv.credit, p.view, rate) : 0;
    if (!p.includeZero && net === 0 && periodDebit === 0 && periodCredit === 0) continue;
    rows.push({ code: a.code, name: a.name, kind: a.kind, net, debit: Math.max(net, 0), credit: Math.max(-net, 0), periodDebit, periodCredit });
  }
  const rounding = rows.reduce((s, r) => s + r.net, 0);
  const totals = {
    debit: rows.reduce((s, r) => s + r.debit, 0) + Math.max(-rounding, 0),
    credit: rows.reduce((s, r) => s + r.credit, 0) + Math.max(rounding, 0),
    periodDebit: rows.reduce((s, r) => s + r.periodDebit, 0),
    periodCredit: rows.reduce((s, r) => s + r.periodCredit, 0),
  };
  return {
    from: p.from,
    to: p.to,
    view: p.view,
    currency: viewCurrency(p.view),
    rate,
    converted: p.view === "base" && (hasUsd(closing.values()) || [...moves.values()].some((m) => m.debit.USD !== 0 || m.credit.USD !== 0)),
    rows,
    totals,
    rounding,
    balanced: totals.debit === totals.credit,
  };
}
