import type { BankReconciliation, Currency, DbState, ID, ISODate, LedgerEntry, MoneyAccount } from "../types";
import { convert } from "../money";
import { toDarDate } from "../dates";
import { rateOf } from "./books";

/**
 * Bank reconciliation: tick the book movements of a money account that appear on its statement.
 *
 * Beginning balance = the account's opening balance + every movement cleared by an earlier completed reconciliation
 * (the last reconciled statement balance). Cleared balance = beginning + the movements ticked now. The difference
 * between the statement's closing balance and the cleared balance must be nil to complete. What stays unticked
 * explains the gap to the book balance: deposits in transit and unpresented payments. Amounts are in the account's
 * own currency.
 */

export interface ReconItem {
  id: ID;
  day: ISODate;
  at: string;
  memo: string;
  kind?: LedgerEntry["kind"];
  ref: LedgerEntry["ref"];
  fileId?: ID;
  moneyIn: number;
  moneyOut: number;
  cleared: boolean;
}

export interface ReconciliationSummary {
  account: MoneyAccount;
  currency: Currency;
  statementDate: ISODate;
  statementBalance: number;
  beginning: number;
  items: ReconItem[];
  clearedIn: number;
  clearedOut: number;
  clearedCount: number;
  clearedBalance: number;
  /** statement − cleared: must be 0 to complete. */
  difference: number;
  /** Opening balance + every movement up to the statement date (the cash book balance). */
  bookBalance: number;
  /** Unticked money in (deposits in transit) and money out (unpresented payments). */
  outstandingIn: number;
  outstandingOut: number;
  /** statement + deposits in transit − unpresented payments: equals the book balance once the difference is nil. */
  adjustedBankBalance: number;
  lastCompleted?: BankReconciliation;
}

/** Signed amount of an entry in the account currency (+ money in, − money out). */
function netIn(db: DbState, e: LedgerEntry, account: MoneyAccount): number {
  const net = e.debitMinor - e.creditMinor;
  return e.currency === account.currency ? net : convert({ amountMinor: net, currency: e.currency }, account.currency, rateOf(db)).amountMinor;
}

export const reconciliationsOf = (db: DbState, accountId: ID): BankReconciliation[] =>
  Object.values(db.reconciliations ?? {})
    .filter((r) => r.moneyAccountId === accountId)
    .sort((a, b) => b.statementDate.localeCompare(a.statementDate) || b.createdAt.localeCompare(a.createdAt));

export const lastCompletedOf = (db: DbState, accountId: ID): BankReconciliation | undefined => reconciliationsOf(db, accountId).find((r) => r.status === "completed");

export const draftOf = (db: DbState, accountId: ID): BankReconciliation | undefined => reconciliationsOf(db, accountId).find((r) => r.status === "draft");

/** Ledger entry ids cleared by completed reconciliations of the account (optionally ignoring one). */
export function clearedIds(db: DbState, accountId: ID, exceptId?: ID): Set<ID> {
  const s = new Set<ID>();
  for (const r of reconciliationsOf(db, accountId)) if (r.status === "completed" && r.id !== exceptId) for (const id of r.clearedEntryIds) s.add(id);
  return s;
}

export const accountEntries = (db: DbState, accountId: ID): LedgerEntry[] => db.ledger.filter((e) => e.account === "1100" && e.sub?.id === accountId);

/** Book movements that can be ticked on a statement dated `statementDate`: up to that day and not cleared before. */
export function reconcilableEntries(db: DbState, accountId: ID, statementDate: ISODate, exceptId?: ID): LedgerEntry[] {
  const done = clearedIds(db, accountId, exceptId);
  return accountEntries(db, accountId)
    .filter((e) => !done.has(e.id) && toDarDate(e.at) <= statementDate)
    .sort((a, b) => a.at.localeCompare(b.at));
}

/** Balance at the start of the next reconciliation: opening + movements cleared so far. */
export function beginningBalance(db: DbState, accountId: ID, exceptId?: ID): number {
  const account = db.moneyAccounts[accountId];
  if (!account) return 0;
  const done = clearedIds(db, accountId, exceptId);
  let b = account.openingBalance.amountMinor;
  for (const e of accountEntries(db, accountId)) if (done.has(e.id)) b += netIn(db, e, account);
  return b;
}

/** The cash book balance of the account at the end of a day. */
export function bookBalanceAt(db: DbState, accountId: ID, day: ISODate): number {
  const account = db.moneyAccounts[accountId];
  if (!account) return 0;
  let b = account.openingBalance.amountMinor;
  for (const e of accountEntries(db, accountId)) if (toDarDate(e.at) <= day) b += netIn(db, e, account);
  return b;
}

export function reconciliationSummary(
  db: DbState,
  p: { accountId: ID; statementDate: ISODate; statementBalanceMinor: number; clearedEntryIds: ID[]; reconciliationId?: ID },
): ReconciliationSummary | null {
  const account = db.moneyAccounts[p.accountId];
  if (!account) return null;
  const ticked = new Set(p.clearedEntryIds);
  const beginning = beginningBalance(db, account.id, p.reconciliationId);
  let clearedIn = 0;
  let clearedOut = 0;
  let clearedCount = 0;
  let outstandingIn = 0;
  let outstandingOut = 0;
  const items: ReconItem[] = reconcilableEntries(db, account.id, p.statementDate, p.reconciliationId).map((e) => {
    const net = netIn(db, e, account);
    const cleared = ticked.has(e.id);
    const moneyIn = Math.max(net, 0);
    const moneyOut = Math.max(-net, 0);
    if (cleared) {
      clearedIn += moneyIn;
      clearedOut += moneyOut;
      clearedCount += 1;
    } else {
      outstandingIn += moneyIn;
      outstandingOut += moneyOut;
    }
    return { id: e.id, day: toDarDate(e.at), at: e.at, memo: e.memo, kind: e.kind, ref: e.ref, fileId: e.fileId, moneyIn, moneyOut, cleared };
  });
  const clearedBalance = beginning + clearedIn - clearedOut;
  return {
    account,
    currency: account.currency,
    statementDate: p.statementDate,
    statementBalance: p.statementBalanceMinor,
    beginning,
    items,
    clearedIn,
    clearedOut,
    clearedCount,
    clearedBalance,
    difference: p.statementBalanceMinor - clearedBalance,
    bookBalance: bookBalanceAt(db, account.id, p.statementDate),
    outstandingIn,
    outstandingOut,
    adjustedBankBalance: p.statementBalanceMinor + outstandingIn - outstandingOut,
    lastCompleted: lastCompletedOf(db, account.id),
  };
}

export interface ReconciliationStatus {
  account: MoneyAccount;
  lastCompleted?: BankReconciliation;
  draft?: BankReconciliation;
  /** Movements up to today not yet cleared. */
  uncleared: number;
  bookBalance: number;
}

/** Per money account (bank, mobile money and card first): last reconciliation, draft in progress, uncleared count. */
export function reconciliationStatuses(db: DbState, today: ISODate): ReconciliationStatus[] {
  const order = { bank: 0, mobile_money: 1, card: 2, cash: 3 } as const;
  return Object.values(db.moneyAccounts)
    .filter((a) => a.active || accountEntries(db, a.id).length > 0)
    .sort((a, b) => order[a.kind] - order[b.kind] || a.name.localeCompare(b.name))
    .map((account) => ({
      account,
      lastCompleted: lastCompletedOf(db, account.id),
      draft: draftOf(db, account.id),
      uncleared: reconcilableEntries(db, account.id, today).length,
      bookBalance: bookBalanceAt(db, account.id, today),
    }));
}
