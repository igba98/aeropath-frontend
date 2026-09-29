import type { DbState, ExpenseCategory, ID, ISODate, MoneyAccount } from "../types";
import { EXPENSE_CATEGORY_LABELS } from "../ledger/accounts";
import { toDarDate } from "../dates";
import { accountEntries, bookBalanceAt } from "./reconciliation";
import { dayBefore } from "./periods";
import { convert } from "../money";
import { rateOf } from "./books";

/**
 * Petty cash book (imprest system) of one cash account: the float, top-ups from the bank (transfers in), vouchers
 * (expenses paid from the box, numbered in the expense series), other movements, a running balance and an analysis
 * by expense category. Amounts are in the account's currency.
 */

export type PettyRowType = "top_up" | "voucher" | "voucher_cancelled" | "receipt" | "banked" | "adjustment" | "other";

export const PETTY_ROW_LABELS: Record<PettyRowType, string> = {
  top_up: "Top-up",
  voucher: "Voucher",
  voucher_cancelled: "Voucher cancelled",
  receipt: "Cash received",
  banked: "Transfer out",
  adjustment: "Cash count adjustment",
  other: "Other",
};

export interface PettyRow {
  id: ID;
  day: ISODate;
  at: string;
  type: PettyRowType;
  /** Voucher (expense) or journal number. */
  number?: string;
  details: string;
  category?: ExpenseCategory;
  received: number;
  paid: number;
  balance: number;
  expenseId?: ID;
  journalId?: ID;
  paymentId?: ID;
  fileId?: ID;
}

export interface PettyCashBook {
  account: MoneyAccount;
  from: ISODate;
  to: ISODate;
  /** The imprest float: the account's opening balance in Settings. */
  float: number;
  /** Balance brought forward at the start of the period. */
  opening: number;
  rows: PettyRow[];
  totals: { received: number; paid: number; topUps: number; vouchers: number; voucherCount: number };
  closing: number;
  /** Balance at the end of today (for the cash count). */
  balanceToday: number;
  byCategory: { category: ExpenseCategory; label: string; amount: number; count: number }[];
  /** What a top-up needs to bring the box back to its float (0 when at or above it). */
  topUpToFloat: number;
}

/** Cash accounts, active first, the petty cash box ("Cash box …" in TZS) on top. */
export function pettyCashAccounts(db: DbState): MoneyAccount[] {
  const score = (a: MoneyAccount) => (a.active ? 0 : 10) + (/petty|cash box/i.test(a.name) ? 0 : 2) + (a.currency === "TZS" ? 0 : 1);
  return Object.values(db.moneyAccounts)
    .filter((a) => a.kind === "cash")
    .sort((a, b) => score(a) - score(b) || a.name.localeCompare(b.name));
}

export const defaultPettyCashAccount = (db: DbState): MoneyAccount | undefined => pettyCashAccounts(db)[0];

export function pettyCashBook(db: DbState, p: { accountId: ID; from: ISODate; to: ISODate; today: ISODate }): PettyCashBook | null {
  const account = db.moneyAccounts[p.accountId];
  if (!account) return null;
  const rate = rateOf(db);
  const inAcc = (minor: number, cur: typeof account.currency) => (cur === account.currency ? minor : convert({ amountMinor: minor, currency: cur }, account.currency, rate).amountMinor);
  const opening = bookBalanceAt(db, account.id, dayBefore(p.from));
  let running = opening;
  const rows: PettyRow[] = [];
  const cats = new Map<ExpenseCategory, { amount: number; count: number }>();
  let topUps = 0;
  let vouchers = 0;
  let voucherCount = 0;
  const entries = accountEntries(db, account.id)
    .map((e) => ({ e, day: toDarDate(e.at) }))
    .filter((x) => x.day >= p.from && x.day <= p.to)
    .sort((a, b) => a.e.at.localeCompare(b.e.at));
  for (const { e, day } of entries) {
    const received = inAcc(e.debitMinor, e.currency);
    const paid = inAcc(e.creditMinor, e.currency);
    running += received - paid;
    const row: PettyRow = { id: e.id, day, at: e.at, type: "other", details: e.memo, received, paid, balance: running };
    if (e.ref.entity === "expense") {
      const x = db.expenses[e.ref.id];
      row.expenseId = e.ref.id;
      row.number = x?.number;
      row.category = x?.category;
      row.details = x ? `${x.payee}${x.note ? ` · ${x.note}` : ""}` : e.memo;
      if (e.kind === "expense_reversal") row.type = "voucher_cancelled";
      else {
        row.type = "voucher";
        vouchers += paid - received;
        voucherCount += 1;
        if (x) {
          const c = cats.get(x.category) ?? { amount: 0, count: 0 };
          c.amount += paid - received;
          c.count += 1;
          cats.set(x.category, c);
        }
      }
    } else if (e.ref.entity === "journal") {
      const j = db.journals[e.ref.id];
      row.journalId = e.ref.id;
      row.number = j?.number;
      row.details = j?.memo ?? e.memo;
      if (e.kind === "transfer") {
        row.type = received > 0 ? "top_up" : "banked";
        if (received > 0) topUps += received;
      } else if (j?.source === "petty_cash") row.type = "adjustment";
      else row.type = "other";
    } else if (e.ref.entity === "payment") {
      row.paymentId = e.ref.id;
      row.number = db.payments[e.ref.id]?.number;
      row.fileId = e.fileId;
      row.type = received > 0 ? "receipt" : "other";
    }
    rows.push(row);
  }
  const received = rows.reduce((s, r) => s + r.received, 0);
  const paid = rows.reduce((s, r) => s + r.paid, 0);
  const float = account.openingBalance.amountMinor;
  const balanceToday = bookBalanceAt(db, account.id, p.today);
  return {
    account,
    from: p.from,
    to: p.to,
    float,
    opening,
    rows,
    totals: { received, paid, topUps, vouchers, voucherCount },
    closing: opening + received - paid,
    balanceToday,
    byCategory: [...cats.entries()].map(([category, v]) => ({ category, label: EXPENSE_CATEGORY_LABELS[category], ...v })).sort((a, b) => b.amount - a.amount),
    topUpToFloat: Math.max(float - balanceToday, 0),
  };
}
