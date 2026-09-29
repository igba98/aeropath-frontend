import type { AccountCode, Currency, DbState, ID, ISODate, LedgerEntry, Money } from "../types";
import type { AccountDef } from "../ledger/accounts";
import { accountDef, books, countsUpTo, entryInView, minorInView, rateOf, viewCurrency, type BookEntry, type BookKind, type CurrencyView } from "./books";

/**
 * General ledger of one account (optionally one client, supplier or money account): the balance brought forward,
 * every posting in the period with a running balance, and the closing balance. Opening balances of money accounts
 * and year-end closes appear as their own lines, so the closing agrees with the trial balance.
 */

export interface GlRow {
  id: ID;
  day: ISODate;
  at: string;
  kind?: BookKind;
  memo: string;
  ref?: LedgerEntry["ref"];
  fileId?: ID;
  sub?: LedgerEntry["sub"];
  /** In the view currency. */
  debit: number;
  credit: number;
  /** Running net debit after this row. */
  balance: number;
  /** The entry as posted, when it was converted for the view. */
  original?: Money;
  virtual?: boolean;
}

export interface GeneralLedger {
  account: AccountDef;
  subId?: ID;
  from: ISODate;
  to: ISODate;
  view: CurrencyView;
  currency: Currency;
  rate: number;
  converted: boolean;
  /** Net debit brought forward (as at the day before `from`). */
  opening: number;
  rows: GlRow[];
  totals: { debit: number; credit: number };
  /** Net debit carried forward (as at `to`). */
  closing: number;
}

export function generalLedger(db: DbState, p: { account: AccountCode; subId?: ID; from: ISODate; to: ISODate; view: CurrencyView }): GeneralLedger {
  const rate = rateOf(db);
  const mine = (e: BookEntry) => e.account === p.account && (!p.subId || e.sub?.id === p.subId) && entryInView(e, p.view);
  const conv = (minor: number, cur: Currency) => minorInView(minor, cur, p.view, rate);
  let opening = 0;
  const rows: GlRow[] = [];
  let debit = 0;
  let credit = 0;
  let converted = false;
  let running = 0;
  // Brought forward: everything before `from`, closes of ended years included (a period starting 1 January opens
  // income accounts at nil). Then the period, which takes the close of any year that ended inside it but not the
  // close of the year `to` falls in (the closing figure is the pre-closing one, as in the trial balance).
  for (const e of books(db)) {
    if (!mine(e)) continue;
    const d = conv(e.debitMinor, e.currency);
    const c = conv(e.creditMinor, e.currency);
    if (e.day < p.from) {
      opening += d - c;
      continue;
    }
    if (!countsUpTo(e, p.to)) continue;
    if (!rows.length) running = opening;
    running += d - c;
    debit += d;
    credit += c;
    if (e.currency !== viewCurrency(p.view)) converted = true;
    const row: GlRow = { id: e.id, day: e.day, at: e.at, kind: e.kind, memo: e.memo, ref: e.ref, fileId: e.fileId, sub: e.sub, debit: d, credit: c, balance: running };
    if (e.currency !== viewCurrency(p.view)) row.original = { amountMinor: e.debitMinor || -e.creditMinor, currency: e.currency };
    if (e.virtual) row.virtual = true;
    rows.push(row);
  }
  return {
    account: accountDef(p.account),
    subId: p.subId,
    from: p.from,
    to: p.to,
    view: p.view,
    currency: viewCurrency(p.view),
    rate,
    converted,
    opening,
    rows,
    totals: { debit, credit },
    closing: opening + debit - credit,
  };
}
