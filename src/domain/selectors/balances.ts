import type { BookingFile, Client, Currency, DbState, ID, ISODate, ISODateTime, Money, MoneyAccount, ServiceLine, Supplier } from "../types";
import { convert, money, zero } from "../money";
import { addDaysISO, darToday, diffDaysISO, toDarDate } from "../dates";
import { lineSupplierCost, lineSupplierDue, serviceDate } from "./core";
import { fileDueAt } from "../status/payment-status";
import { fileStatus } from "../status/file-status";
import { addIn, cached, filesByClient, lineIssuedAt, totalsOf } from "./reports/common";

/**
 * Balances (spec §9.1 dashboards, §9.6 credit usage, §9.9 money out, §9.10 aging).
 * Cross-currency sums convert at the CURRENT settings rate (§8.1); per-row amounts stay in their own currency.
 */

const rateOf = (db: DbState) => db.settings.fx.USD_TZS;

// ───────────────────────────── Clients ─────────────────────────────

export interface ClientBalance {
  /** The client's default currency; every file converts into it at the current rate. */
  currency: Currency;
  charges: Money;
  received: Money;
  /** charges − received: > 0 the client owes us, < 0 we owe the client. */
  balance: Money;
  /** Balance of files that are past their due date (§7.3). */
  overdue: Money;
  /** Files still in progress (draft, confirmed, travelled) or with a non-zero balance. */
  openFiles: number;
}

/** True when the file has a positive balance and its due date has passed (Dar calendar). */
export function fileIsOverdue(db: DbState, fileId: ID, now: Date): boolean {
  if (totalsOf(db, fileId).balance.amountMinor <= 0) return false;
  const due = fileDueAt(db, fileId);
  return !!due && due < darToday(now);
}

export function clientBalance(db: DbState, clientId: ID, now: Date): ClientBalance {
  const currency = db.clients[clientId]?.defaultCurrency ?? "TZS";
  let charges = zero(currency);
  let received = zero(currency);
  let balance = zero(currency);
  let overdue = zero(currency);
  let openFiles = 0;
  for (const f of filesByClient(db).get(clientId) ?? []) {
    const t = totalsOf(db, f.id);
    charges = addIn(db, charges, t.charges);
    received = addIn(db, received, t.received);
    balance = addIn(db, balance, t.balance);
    if (fileIsOverdue(db, f.id, now)) overdue = addIn(db, overdue, t.balance);
    const s = fileStatus(db, f.id, now);
    if (t.balance.amountMinor !== 0 || s === "draft" || s === "confirmed" || s === "travelled") openFiles++;
  }
  return { currency, charges, received, balance, overdue, openFiles };
}

export interface CreditUsage {
  limit?: Money;
  /** Σ positive file balances, in the limit's currency (the client's default currency when there is no limit). */
  used: Money;
  /** used ÷ limit × 100 (80 = 80 %); 0 without a limit. */
  pct: number;
}

/** Credit usage of a corporate client (§9.6, Flow D). Null for individuals. */
export function clientCreditUsage(db: DbState, clientId: ID, now: Date): CreditUsage | null {
  void now;
  const client = db.clients[clientId];
  if (!client || client.type !== "corporate") return null;
  const currency = client.creditLimit?.currency ?? client.defaultCurrency;
  let used = zero(currency);
  for (const f of filesByClient(db).get(clientId) ?? []) {
    const b = totalsOf(db, f.id).balance;
    if (b.amountMinor > 0) used = addIn(db, used, b);
  }
  const limit = client.creditLimit && client.creditLimit.amountMinor > 0 ? client.creditLimit : undefined;
  const pct = limit ? (used.amountMinor / limit.amountMinor) * 100 : 0;
  return limit ? { limit, used, pct } : { used, pct };
}

// ───────────────────────────── Suppliers ─────────────────────────────

export interface SupplierOpenItem {
  line: ServiceLine;
  file: BookingFile;
  serviceDate?: ISODate;
  /** What we owe for the line before payments (line currency): cost, or the penalty for a refunded line. */
  cost: Money;
  paid: Money;
  /** cost − paid (line currency). Negative when the supplier owes us (credit after a refund). */
  remaining: Money;
  /** Days since the line was issued. */
  daysOutstanding: number;
  /** remaining > 0 and older than the supplier's payment terms. */
  overdue: boolean;
  issuedAt?: ISODateTime;
  /** Issue date + supplier terms. */
  dueDate?: ISODate;
}

function openItemsBySupplier(db: DbState, now: Date): Map<ID, SupplierOpenItem[]> {
  return cached(db, `supplierItems:${darToday(now)}`, () => {
    const today = darToday(now);
    const m = new Map<ID, SupplierOpenItem[]>();
    for (const line of Object.values(db.lines)) {
      const cost = lineSupplierCost(db, line);
      const remaining = lineSupplierDue(db, line);
      if (remaining.amountMinor === 0) continue;
      const file = db.files[line.fileId];
      if (!file) continue;
      const supplier = db.suppliers[line.supplierId];
      const issuedAt = lineIssuedAt(line) ?? line.updatedAt;
      const issuedDate = toDarDate(issuedAt);
      const days = Math.max(0, diffDaysISO(issuedDate, today));
      const terms = supplier?.paymentTermsDays ?? 0;
      const item: SupplierOpenItem = {
        line,
        file,
        serviceDate: serviceDate(line),
        cost,
        paid: money(line.supplierPaidMinor || 0, cost.currency),
        remaining,
        daysOutstanding: days,
        overdue: remaining.amountMinor > 0 && days > terms,
        issuedAt,
        dueDate: addDaysISO(issuedDate, terms),
      };
      const list = m.get(line.supplierId);
      if (list) list.push(item);
      else m.set(line.supplierId, [item]);
    }
    for (const list of m.values()) list.sort((a, b) => (a.issuedAt ?? "").localeCompare(b.issuedAt ?? "") || (a.serviceDate ?? "").localeCompare(b.serviceDate ?? ""));
    return m;
  });
}

/** Issued lines of a supplier with money still open (cost − paid ≠ 0), oldest first (§9.9 supplier detail). */
export function supplierOpenItems(db: DbState, supplierId: ID, now: Date): SupplierOpenItem[] {
  return openItemsBySupplier(db, now).get(supplierId) ?? [];
}

export interface SupplierBalance {
  supplier: Supplier;
  /** Net owed in the supplier's currency (credits after refunds reduce it). */
  owed: Money;
  /** Positive amounts past the supplier's terms, supplier currency. */
  overdue: Money;
  lastPaymentAt?: ISODateTime;
  openItems: number;
}

/** Every supplier with open items or active, largest balance first (§9.9 suppliers tab). */
export function supplierBalances(db: DbState, now: Date): SupplierBalance[] {
  const items = openItemsBySupplier(db, now);
  const lastPaid = new Map<ID, ISODateTime>();
  for (const sp of Object.values(db.supplierPayments)) {
    const cur = lastPaid.get(sp.supplierId);
    if (!cur || sp.paidAt > cur) lastPaid.set(sp.supplierId, sp.paidAt);
  }
  const rows: SupplierBalance[] = [];
  for (const supplier of Object.values(db.suppliers)) {
    const list = items.get(supplier.id) ?? [];
    if (!supplier.active && !list.length) continue;
    let owed = zero(supplier.currency);
    let overdue = zero(supplier.currency);
    for (const i of list) {
      owed = addIn(db, owed, i.remaining);
      if (i.overdue) overdue = addIn(db, overdue, i.remaining);
    }
    rows.push({ supplier, owed, overdue, lastPaymentAt: lastPaid.get(supplier.id), openItems: list.length });
  }
  const tzs = (m: Money) => convert(m, "TZS", rateOf(db)).amountMinor;
  return rows.sort((a, b) => tzs(b.owed) - tzs(a.owed) || a.supplier.name.localeCompare(b.supplier.name));
}

// ───────────────────────────── Cash ─────────────────────────────

export interface CashPosition {
  account: MoneyAccount;
  balance: Money;
}

/** Balance of one money account: opening balance + ledger 1100 movements (optionally up to and including `at`). */
export function accountBalance(db: DbState, account: MoneyAccount, at?: ISODateTime): Money {
  let minor = account.openingBalance.amountMinor;
  const rate = rateOf(db);
  for (const e of db.ledger) {
    if (e.account !== "1100" || e.sub?.id !== account.id) continue;
    if (at && e.at > at) continue;
    const net = e.debitMinor - e.creditMinor;
    minor += e.currency === account.currency ? net : convert(money(net, e.currency), account.currency, rate).amountMinor;
  }
  return money(minor, account.currency);
}

/**
 * Cash position per money account (§9.1 Accountant): active accounts first, then by name. Inactive accounts appear only
 * while they still hold money (pass includeInactive: false to drop them). `at` gives the position at an earlier instant.
 */
export function cashPositions(db: DbState, opts?: { at?: ISODateTime; includeInactive?: boolean }): CashPosition[] {
  return Object.values(db.moneyAccounts)
    .filter((a) => a.active || opts?.includeInactive !== false)
    .map((account) => ({ account, balance: accountBalance(db, account, opts?.at) }))
    .filter((p) => p.account.active || p.balance.amountMinor !== 0)
    .sort((a, b) => Number(b.account.active) - Number(a.account.active) || a.account.name.localeCompare(b.account.name));
}

// ───────────────────────────── Aging ─────────────────────────────

export type AgingBucket = "notDue" | "d0_30" | "d31_60" | "d61_90" | "d90plus";
export type AgingBuckets = Record<AgingBucket, Money>;

export const AGING_BUCKETS: { key: AgingBucket; label: string }[] = [
  { key: "notDue", label: "Not due" },
  { key: "d0_30", label: "0–30 days" },
  { key: "d31_60", label: "31–60 days" },
  { key: "d61_90", label: "61–90 days" },
  { key: "d90plus", label: "90+ days" },
];

/** Bucket for a number of days past due (≤ 0 = not due yet). */
export function agingBucket(daysPastDue: number): AgingBucket {
  if (daysPastDue <= 0) return "notDue";
  if (daysPastDue <= 30) return "d0_30";
  if (daysPastDue <= 60) return "d31_60";
  if (daysPastDue <= 90) return "d61_90";
  return "d90plus";
}

export function emptyBuckets(currency: Currency): AgingBuckets {
  const z = zero(currency);
  return { notDue: z, d0_30: z, d31_60: z, d61_90: z, d90plus: z };
}

export interface AgingTotals {
  /** Buckets and total converted to TZS at the current rate. */
  buckets: AgingBuckets;
  total: Money;
  /** Unconverted totals per currency. */
  byCurrency: Partial<Record<Currency, { buckets: AgingBuckets; total: Money }>>;
  fxRate: number;
}

function totalsFor(db: DbState, rows: { currency: Currency; buckets: AgingBuckets }[]): AgingTotals {
  const buckets = emptyBuckets("TZS");
  const byCurrency: AgingTotals["byCurrency"] = {};
  for (const r of rows) {
    const bc = (byCurrency[r.currency] ??= { buckets: emptyBuckets(r.currency), total: zero(r.currency) });
    for (const { key } of AGING_BUCKETS) {
      buckets[key] = addIn(db, buckets[key], r.buckets[key]);
      bc.buckets[key] = addIn(db, bc.buckets[key], r.buckets[key]);
      bc.total = addIn(db, bc.total, r.buckets[key]);
    }
  }
  const total = AGING_BUCKETS.reduce((acc, { key }) => addIn(db, acc, buckets[key]), zero("TZS"));
  return { buckets, total, byCurrency, fxRate: rateOf(db) };
}

export interface ReceivableRow {
  client: Client;
  file: BookingFile;
  /** The file's currency. */
  currency: Currency;
  balance: Money;
  dueAt?: ISODate;
  daysPastDue: number;
  bucket: AgingBucket;
  /** The balance placed in its bucket (others zero), file currency. */
  buckets: AgingBuckets;
  balanceTzs: Money;
}

export interface ReceivablesAging {
  rows: ReceivableRow[];
  totals: AgingTotals;
}

/**
 * Who owes us (§9.10 receivables): every file with a positive commercial balance (fileTotals: booked and issued
 * services less money received), aged by the file's due date (§7.3). Oldest overdue first.
 */
export function receivablesAging(db: DbState, now: Date): ReceivablesAging {
  const today = darToday(now);
  const rows: ReceivableRow[] = [];
  for (const file of Object.values(db.files)) {
    const balance = totalsOf(db, file.id).balance;
    if (balance.amountMinor <= 0) continue;
    const client = db.clients[file.clientId];
    if (!client) continue;
    const dueAt = fileDueAt(db, file.id);
    const daysPastDue = dueAt ? diffDaysISO(dueAt, today) : 0;
    const bucket = agingBucket(daysPastDue);
    const buckets = emptyBuckets(balance.currency);
    buckets[bucket] = balance;
    rows.push({ client, file, currency: balance.currency, balance, dueAt, daysPastDue, bucket, buckets, balanceTzs: convert(balance, "TZS", rateOf(db)) });
  }
  rows.sort((a, b) => b.daysPastDue - a.daysPastDue || b.balanceTzs.amountMinor - a.balanceTzs.amountMinor);
  return { rows, totals: totalsFor(db, rows) };
}

export interface PayableRow {
  supplier: Supplier;
  /** The supplier's currency. */
  currency: Currency;
  buckets: AgingBuckets;
  total: Money;
  totalTzs: Money;
  openItems: number;
  /** Days outstanding of the oldest open item. */
  oldestDays: number;
}

export interface PayablesAging {
  rows: PayableRow[];
  totals: AgingTotals;
}

/**
 * What we owe (§9.10 payables): per supplier, open cost aged by days past the supplier's terms (issue date + terms).
 * Supplier credits (negative remaining after a refund) sit in "Not due" and reduce the total.
 */
export function payablesAging(db: DbState, now: Date): PayablesAging {
  const items = openItemsBySupplier(db, now);
  const rows: PayableRow[] = [];
  for (const [supplierId, list] of items) {
    const supplier = db.suppliers[supplierId];
    if (!supplier || !list.length) continue;
    const currency = supplier.currency;
    const buckets = emptyBuckets(currency);
    let total = zero(currency);
    for (const i of list) {
      const pastDue = i.remaining.amountMinor > 0 ? i.daysOutstanding - supplier.paymentTermsDays : 0;
      const key = agingBucket(pastDue);
      buckets[key] = addIn(db, buckets[key], i.remaining);
      total = addIn(db, total, i.remaining);
    }
    rows.push({ supplier, currency, buckets, total, totalTzs: convert(total, "TZS", rateOf(db)), openItems: list.length, oldestDays: Math.max(...list.map((i) => i.daysOutstanding)) });
  }
  rows.sort((a, b) => b.totalTzs.amountMinor - a.totalTzs.amountMinor);
  return { rows, totals: totalsFor(db, rows) };
}
