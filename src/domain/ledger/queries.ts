import type { AccountCode, Currency, ID, LedgerEntry, LedgerKind, Money } from "../types";

/** Small read helpers over ledger entries (for reports and invariant tests). */

export interface LedgerFilter {
  account?: AccountCode | AccountCode[];
  currency?: Currency;
  subId?: ID;
  fileId?: ID;
  lineId?: ID;
  kind?: LedgerKind | LedgerKind[];
  /** Inclusive ISO bounds on entry time. */
  from?: string;
  to?: string;
}

export function filterLedger(entries: LedgerEntry[], f: LedgerFilter): LedgerEntry[] {
  const accounts = f.account === undefined ? null : Array.isArray(f.account) ? f.account : [f.account];
  const kinds = f.kind === undefined ? null : Array.isArray(f.kind) ? f.kind : [f.kind];
  return entries.filter(
    (e) =>
      (!accounts || accounts.includes(e.account)) &&
      (!f.currency || e.currency === f.currency) &&
      (!f.subId || e.sub?.id === f.subId) &&
      (!f.fileId || e.fileId === f.fileId) &&
      (!f.lineId || e.lineId === f.lineId) &&
      (!kinds || (e.kind !== undefined && kinds.includes(e.kind))) &&
      (!f.from || e.at >= f.from) &&
      (!f.to || e.at <= f.to),
  );
}

/** Σ debit − Σ credit of the matching entries in one currency (positive = debit balance). */
export function debitBalance(entries: LedgerEntry[], f: LedgerFilter & { currency: Currency }): Money {
  const minor = filterLedger(entries, f).reduce((s, e) => s + e.debitMinor - e.creditMinor, 0);
  return { amountMinor: minor, currency: f.currency };
}

/** Σ credit − Σ debit (positive = credit balance, e.g. payables, revenue). */
export function creditBalance(entries: LedgerEntry[], f: LedgerFilter & { currency: Currency }): Money {
  const d = debitBalance(entries, f);
  return { amountMinor: -d.amountMinor, currency: d.currency };
}
