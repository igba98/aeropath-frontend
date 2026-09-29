import type { AccountCode, Currency, DbState, ID, ISODate, ISODateTime, LedgerEntry, LedgerKind, MoneyAccount } from "../types";
import { ACCOUNTS, type AccountDef, type AccountKind } from "../ledger/accounts";
import { roundHalfUp } from "../money";
import { toDarDate } from "../dates";
import { cached } from "../selectors/reports/common";

/**
 * The books: the double-entry ledger plus two kinds of virtual entries every accounting report reads the same way.
 *
 * 1. Opening balances of money accounts. They live in Settings → Money accounts (`openingBalance`), not in the ledger,
 *    and the existing cash book and cash positions add them on top of the ledger. Here each one becomes a balanced
 *    pair — Dr 1100 (that account) · Cr 3300 Opening balance equity — brought forward from the start of the books
 *    (`BOOKS_START`), so every "as at" balance includes it exactly like `accountBalance()` does and the balance sheet
 *    balances without a command having to run first.
 * 2. Year-end closes. The financial year is the calendar year (Tanzania's default year of income). At 23:59:59.999 on
 *    31 December every revenue and expense account is closed to 3200 Retained earnings, per currency, so income
 *    accounts show the year to date and retained earnings carry prior years' profit. A balance read up to a date
 *    counts the closes of earlier years only (see `countsUpTo`), so 31 December shows the pre-closing figures.
 *
 * Virtual entries balance per currency like real groups, never touch `db.ledger`, and are marked `virtual: true`.
 * Period statements (profit or loss, VAT, trial balance movements) read real entries only.
 */

export type CurrencyView = "base" | "TZS" | "USD";

export const CURRENCY_VIEWS: { value: CurrencyView; label: string; title: string }[] = [
  { value: "base", label: "All in TZS", title: "Every transaction, USD converted to TZS at the settings rate" },
  { value: "TZS", label: "TZS books", title: "TZS transactions only, not converted" },
  { value: "USD", label: "USD books", title: "USD transactions only, in USD" },
];

export const isCurrencyView = (v: string | null | undefined): v is CurrencyView => v === "base" || v === "TZS" || v === "USD";

/** Currency the figures of a view are in. */
export const viewCurrency = (v: CurrencyView): Currency => (v === "USD" ? "USD" : "TZS");

export type BookKind = LedgerKind | "opening_balance" | "year_end_close";

export interface BookEntry {
  id: ID;
  groupId: ID;
  kind?: BookKind;
  at: ISODateTime;
  /** Dar es Salaam calendar day of `at`. */
  day: ISODate;
  account: AccountCode;
  sub?: LedgerEntry["sub"];
  fileId?: ID;
  lineId?: ID;
  debitMinor: number;
  creditMinor: number;
  currency: Currency;
  memo: string;
  /** Absent on virtual entries. */
  ref?: LedgerEntry["ref"];
  virtual?: boolean;
}

/** Where brought-forward opening balances sit: before any real transaction. */
export const BOOKS_START_AT: ISODateTime = "2000-01-01T00:00:00.000Z";
export const BOOKS_START: ISODate = "2000-01-01";

/** First and last day of the financial year containing `d` (calendar year). */
export const fyStart = (d: ISODate): ISODate => `${d.slice(0, 4)}-01-01`;
export const fyEnd = (d: ISODate): ISODate => `${d.slice(0, 4)}-12-31`;

export const accountDef = (code: AccountCode): AccountDef => ACCOUNTS[code];
export const kindOf = (code: AccountCode): AccountKind => ACCOUNTS[code]?.kind ?? "asset";
export const isPnlAccount = (code: AccountCode): boolean => kindOf(code) === "revenue" || kindOf(code) === "expense";
/** Contra accounts: they sit in a class but carry the opposite balance (accumulated depreciation). */
export const CONTRA_ACCOUNTS: AccountCode[] = ["1510"];

/** Accounts whose normal balance is a debit (assets and expenses, less contra-assets). */
export const isDebitNormal = (code: AccountCode): boolean => (kindOf(code) === "asset" || kindOf(code) === "expense") !== CONTRA_ACCOUNTS.includes(code);

/** All accounts in code order. */
export const ACCOUNT_LIST: AccountDef[] = Object.values(ACCOUNTS).sort((a, b) => a.code.localeCompare(b.code));

export const rateOf = (db: DbState): number => db.settings.fx.USD_TZS;

// ───────────────────────────── Building the books ─────────────────────────────

const toBook = (e: LedgerEntry): BookEntry => ({ ...e, day: toDarDate(e.at) });

/** Opening balances of money accounts as brought-forward pairs: Dr 1100 (account) · Cr 3300. */
export function openingEntries(accounts: MoneyAccount[]): BookEntry[] {
  const out: BookEntry[] = [];
  for (const a of [...accounts].sort((x, y) => x.name.localeCompare(y.name))) {
    const minor = a.openingBalance?.amountMinor ?? 0;
    if (!minor) continue;
    const cur = a.openingBalance.currency;
    const groupId = `ob_${a.id}`;
    const memo = `Opening balance: ${a.name}`;
    const base = { groupId, kind: "opening_balance" as const, at: BOOKS_START_AT, day: BOOKS_START, currency: cur, memo, virtual: true };
    out.push(
      { ...base, id: `${groupId}_1100`, account: "1100", sub: { type: "money_account", id: a.id }, debitMinor: Math.max(minor, 0), creditMinor: Math.max(-minor, 0) },
      { ...base, id: `${groupId}_3300`, account: "3300", debitMinor: Math.max(-minor, 0), creditMinor: Math.max(minor, 0) },
    );
  }
  return out;
}

/** Year-end closes: per year and currency, every revenue and expense account's net goes to 3200 Retained earnings. */
export function yearEndCloses(entries: BookEntry[]): BookEntry[] {
  // year → currency → account → net debit
  const nets = new Map<string, Map<Currency, Map<AccountCode, number>>>();
  for (const e of entries) {
    if (!isPnlAccount(e.account)) continue;
    const y = e.day.slice(0, 4);
    let byCur = nets.get(y);
    if (!byCur) nets.set(y, (byCur = new Map()));
    let byAcc = byCur.get(e.currency);
    if (!byAcc) byCur.set(e.currency, (byAcc = new Map()));
    byAcc.set(e.account, (byAcc.get(e.account) ?? 0) + e.debitMinor - e.creditMinor);
  }
  const out: BookEntry[] = [];
  for (const y of [...nets.keys()].sort()) {
    const at = new Date(Date.parse(`${y}-12-31T23:59:59.999Z`) - 3 * 3_600_000).toISOString(); // 23:59:59.999 in Dar
    for (const [cur, byAcc] of nets.get(y)!) {
      const groupId = `yec_${y}_${cur}`;
      const base = { groupId, kind: "year_end_close" as const, at, day: `${y}-12-31`, currency: cur, memo: `Year-end close ${y}: profit or loss to retained earnings`, virtual: true };
      let profitDebit = 0;
      for (const code of [...byAcc.keys()].sort()) {
        const net = byAcc.get(code)!;
        if (!net) continue;
        profitDebit += net;
        out.push({ ...base, id: `${groupId}_${code}`, account: code, debitMinor: Math.max(-net, 0), creditMinor: Math.max(net, 0) });
      }
      if (profitDebit) out.push({ ...base, id: `${groupId}_3200`, account: "3200", debitMinor: Math.max(profitDebit, 0), creditMinor: Math.max(-profitDebit, 0) });
    }
  }
  return out;
}

/** Every entry the accounting reports read, oldest first (stable within the same instant). Memoised per db. */
export function books(db: DbState): BookEntry[] {
  return cached(db, "acc:books", () => {
    const base = [...openingEntries(Object.values(db.moneyAccounts)), ...db.ledger.map(toBook)];
    const all = [...base, ...yearEndCloses(base)];
    return all.sort((a, b) => (a.at < b.at ? -1 : a.at > b.at ? 1 : 0));
  });
}

/** Groups whose debits and credits differ in a currency (empty when the books balance). */
export function groupBalanceCheck(entries: Pick<BookEntry, "groupId" | "currency" | "debitMinor" | "creditMinor">[]): { groupId: ID; currency: Currency; diff: number }[] {
  const m = new Map<string, { groupId: ID; currency: Currency; diff: number }>();
  for (const e of entries) {
    const k = `${e.groupId}|${e.currency}`;
    const g = m.get(k) ?? { groupId: e.groupId, currency: e.currency, diff: 0 };
    g.diff += e.debitMinor - e.creditMinor;
    m.set(k, g);
  }
  return [...m.values()].filter((g) => g.diff !== 0);
}

/** Real ledger entries only, as book entries (for period statements). */
export const realEntries = (db: DbState): BookEntry[] => cached(db, "acc:real", () => books(db).filter((e) => !e.virtual));

// ───────────────────────────── Amounts in a view ─────────────────────────────

/** Net debit per currency (minor units). */
export interface Net {
  TZS: number;
  USD: number;
}

export const emptyNet = (): Net => ({ TZS: 0, USD: 0 });

export const addNet = (n: Net, e: Pick<BookEntry, "currency" | "debitMinor" | "creditMinor">, sign = 1): void => {
  n[e.currency] += sign * (e.debitMinor - e.creditMinor);
};

/** Negation without a negative zero. */
export const neg = (x: number): number => (x === 0 ? 0 : -x);

/** A per-currency figure in a view: TZS plus USD converted (base), or one currency on its own. */
export function inView(n: Net, view: CurrencyView, rate: number): number {
  if (view === "TZS") return n.TZS;
  if (view === "USD") return n.USD;
  return n.TZS + roundHalfUp(n.USD * rate);
}

/** Whether an entry belongs to a view (base takes everything). */
export const entryInView = (e: Pick<BookEntry, "currency">, view: CurrencyView): boolean => view === "base" || e.currency === view;

/** One entry amount in a view's currency (the entry must belong to the view). */
export const minorInView = (minor: number, currency: Currency, view: CurrencyView, rate: number): number => (view === "base" && currency === "USD" ? roundHalfUp(minor * rate) : minor);

/** True when a view mixes currencies that were converted (show "Converted at 1 USD = TZS x"). */
export const convertsIn = (entries: Pick<BookEntry, "currency">[], view: CurrencyView): boolean => view === "base" && entries.some((e) => e.currency === "USD");

// ───────────────────────────── Balances ─────────────────────────────

export interface BalanceFilter {
  /** Inclusive last day. */
  to: ISODate;
  /** Inclusive first day; omit for "as at" (everything up to `to`). */
  from?: ISODate;
  /** Only real ledger entries (no opening balances or year-end closes). */
  realOnly?: boolean;
}

/**
 * Whether an entry counts in books read up to `to`. The close of the year `to` falls in is left out, so a balance
 * on 31 December is the pre-closing one (income accounts still show the year; retained earnings holds prior years).
 */
export const countsUpTo = (e: Pick<BookEntry, "day" | "kind">, to: ISODate): boolean => e.day <= to && !(e.kind === "year_end_close" && e.day >= fyStart(to));

const pick = (db: DbState, f: BalanceFilter): BookEntry[] => (f.realOnly ? realEntries(db) : books(db)).filter((e) => countsUpTo(e, f.to) && (!f.from || e.day >= f.from));

/** Net debit per account (per currency). */
export function netByAccount(db: DbState, f: BalanceFilter): Map<AccountCode, Net> {
  return cached(db, `acc:netByAccount:${f.from ?? ""}:${f.to}:${f.realOnly ? 1 : 0}`, () => {
    const m = new Map<AccountCode, Net>();
    for (const e of pick(db, f)) {
      let n = m.get(e.account);
      if (!n) m.set(e.account, (n = emptyNet()));
      addNet(n, e);
    }
    return m;
  });
}

export interface SubNet {
  account: AccountCode;
  subId: ID;
  sub?: LedgerEntry["sub"];
  net: Net;
}

/** Net debit per account and sub-ledger (client, supplier, money account); entries without a sub group under "". */
export function netByAccountSub(db: DbState, f: BalanceFilter): SubNet[] {
  return cached(db, `acc:netBySub:${f.from ?? ""}:${f.to}:${f.realOnly ? 1 : 0}`, () => {
    const m = new Map<string, SubNet>();
    for (const e of pick(db, f)) {
      const subId = e.sub?.id ?? "";
      const k = `${e.account}|${subId}`;
      let s = m.get(k);
      if (!s) m.set(k, (s = { account: e.account, subId, sub: e.sub, net: emptyNet() }));
      addNet(s.net, e);
    }
    return [...m.values()];
  });
}

/** Gross debits and credits per account (per currency) of real entries in a period. */
export function movementsByAccount(db: DbState, f: { from: ISODate; to: ISODate }): Map<AccountCode, { debit: Net; credit: Net }> {
  return cached(db, `acc:moves:${f.from}:${f.to}`, () => {
    const m = new Map<AccountCode, { debit: Net; credit: Net }>();
    for (const e of realEntries(db)) {
      if (e.day < f.from || e.day > f.to) continue;
      let x = m.get(e.account);
      if (!x) m.set(e.account, (x = { debit: emptyNet(), credit: emptyNet() }));
      x.debit[e.currency] += e.debitMinor;
      x.credit[e.currency] += e.creditMinor;
    }
    return m;
  });
}

/** Whether any USD amount is part of a set of nets (for the conversion note). */
export const hasUsd = (nets: Iterable<Net>): boolean => {
  for (const n of nets) if (n.USD !== 0) return true;
  return false;
};

/** Sub-ledger display name: client, supplier or money account. */
export function subName(db: DbState, sub: LedgerEntry["sub"] | undefined): string {
  if (!sub) return "";
  if (sub.type === "client") return db.clients[sub.id]?.name ?? "Unknown client";
  if (sub.type === "supplier") return db.suppliers[sub.id]?.name ?? "Unknown supplier";
  return db.moneyAccounts[sub.id]?.name ?? "Unknown account";
}

export const SUBLEDGER_LABEL: Record<NonNullable<AccountDef["subledger"]>, string> = {
  money_account: "Money account",
  client: "Client",
  supplier: "Supplier",
};
