import type { Booking, BookingItem, LedgerEntry, Payment } from "@/lib/domain/types";

/** Item statuses that represent sold, non-reversed value. */
export const SOLD_STATUSES: BookingItem["status"][] = ["paid", "awaiting_supplier", "confirmed", "amended", "used"];

export interface AccountBalance {
  account: string;
  debitMinor: number;
  creditMinor: number;
  /** debit − credit. Positive for assets and expenses, negative for liabilities and revenue. */
  netMinor: number;
  entries: number;
}

export function accountBalances(ledger: LedgerEntry[]): AccountBalance[] {
  const map = new Map<string, AccountBalance>();
  for (const e of ledger) {
    const a = map.get(e.account) ?? { account: e.account, debitMinor: 0, creditMinor: 0, netMinor: 0, entries: 0 };
    a.debitMinor += e.debitMinor;
    a.creditMinor += e.creditMinor;
    a.netMinor = a.debitMinor - a.creditMinor;
    a.entries += 1;
    map.set(e.account, a);
  }
  return [...map.values()].sort((x, y) => x.account.localeCompare(y.account));
}

const sumWhere = (ledger: LedgerEntry[], test: (a: string) => boolean, side: "debit" | "credit") =>
  ledger.filter((e) => test(e.account)).reduce((s, e) => s + (side === "debit" ? e.debitMinor : e.creditMinor), 0);

/** Cash and bank on hand: debits minus credits on every cash.* account plus cash.bank. */
export function cashPosition(ledger: LedgerEntry[]): number {
  return sumWhere(ledger, (a) => a.startsWith("cash."), "debit") - sumWhere(ledger, (a) => a.startsWith("cash."), "credit");
}

/** Revenue actually recognised (commission, markup and service fee), net of any reversal. */
export function netRevenue(ledger: LedgerEntry[]): number {
  return sumWhere(ledger, (a) => a.startsWith("revenue."), "credit") - sumWhere(ledger, (a) => a.startsWith("revenue."), "debit");
}

export function vatPayable(ledger: LedgerEntry[]): number {
  return sumWhere(ledger, (a) => a === "liability.vat_payable", "credit") - sumWhere(ledger, (a) => a === "liability.vat_payable", "debit");
}

export function supplierPayable(ledger: LedgerEntry[]): number {
  return sumWhere(ledger, (a) => a === "liability.supplier_payable", "credit") - sumWhere(ledger, (a) => a === "liability.supplier_payable", "debit");
}

export function customerDeposits(ledger: LedgerEntry[]): number {
  return sumWhere(ledger, (a) => a === "liability.customer_deposits", "credit") - sumWhere(ledger, (a) => a === "liability.customer_deposits", "debit");
}

export function receivables(ledger: LedgerEntry[]): number {
  return sumWhere(ledger, (a) => a.startsWith("receivable."), "debit") - sumWhere(ledger, (a) => a.startsWith("receivable."), "credit");
}

/** Gross bookings = sell price of every item that is sold and not reversed. */
export function grossBookings(items: BookingItem[]): number {
  return items.filter((i) => SOLD_STATUSES.includes(i.status)).reduce((s, i) => s + i.sellPriceMinor, 0);
}

export const takeRatePct = (gross: number, net: number) => (gross > 0 ? Math.round((net / gross) * 1000) / 10 : 0);

export const unreconciled = (payments: Payment[]) => payments.filter((p) => p.status === "reconciliation_pending" || p.status === "pending");

/** Group ledger lines by their double entry group and report whether each balances. */
export interface LedgerGroup {
  entryGroupId: string;
  entries: LedgerEntry[];
  debitMinor: number;
  creditMinor: number;
  balanced: boolean;
  entryDate: string;
  bookingId?: string;
  payoutId?: string;
  description: string;
}

export function ledgerGroups(ledger: LedgerEntry[]): LedgerGroup[] {
  const map = new Map<string, LedgerEntry[]>();
  for (const e of ledger) map.set(e.entryGroupId, [...(map.get(e.entryGroupId) ?? []), e]);
  return [...map.entries()]
    .map(([entryGroupId, entries]) => {
      const debitMinor = entries.reduce((s, e) => s + e.debitMinor, 0);
      const creditMinor = entries.reduce((s, e) => s + e.creditMinor, 0);
      return {
        entryGroupId,
        entries,
        debitMinor,
        creditMinor,
        balanced: debitMinor === creditMinor,
        entryDate: entries[0].entryDate,
        bookingId: entries[0].bookingId,
        payoutId: entries[0].payoutId,
        description: entries[0].description,
      };
    })
    .sort((a, b) => b.entryDate.localeCompare(a.entryDate));
}

/** Daily buckets of the last `days` days, oldest first. */
export function dailyBuckets(days: number): Array<{ key: string; label: string }> {
  const out: Array<{ key: string; label: string }> = [];
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(Date.now() - i * 86_400_000);
    out.push({ key: d.toISOString().slice(0, 10), label: `${d.getUTCDate()}/${d.getUTCMonth() + 1}` });
  }
  return out;
}

export const bookingOf = (items: BookingItem[], bookings: Record<string, Booking>) =>
  items.map((i) => ({ item: i, booking: bookings[i.bookingId] })).filter((x): x is { item: BookingItem; booking: Booking } => Boolean(x.booking));
