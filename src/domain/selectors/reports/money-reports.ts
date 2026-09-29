import type { BookingFile, Client, Currency, DbState, ID, ISODateTime, LedgerEntry, LedgerKind, Money, MoneyAccount, Supplier, User } from "../../types";
import { add, convert, money, sub, zero } from "../../money";
import { addDaysISO, endOfDarDay, toDarDate } from "../../dates";
import { accountBalance, AGING_BUCKETS, emptyBuckets, payablesAging, receivablesAging, type AgingBucket, type AgingBuckets } from "../balances";
import { daysOf, inPeriod, monthsOf, toChart, toCur, weekStart } from "./common";
import { autoGrouping } from "./sales";
import type { ChartSpec, ReportParams, ReportResult } from "./types";

/** Receivables and payables aging, cash book (spec §9.10). Receipts, expenses and P&L live in ./ledger-reports. */

const bucketChart = (title: string, buckets: AgingBuckets, c: Currency): ChartSpec => ({
  kind: "bar",
  title,
  xKey: "bucket",
  xFormat: "text",
  unit: c,
  data: AGING_BUCKETS.map((b) => ({ bucket: b.label, amount: toChart(buckets[b.key]) })),
  series: [{ key: "amount", label: "Outstanding", color: 1 }],
});

function convertBuckets(db: DbState, b: AgingBuckets, c: Currency): AgingBuckets {
  const out = emptyBuckets(c);
  for (const { key } of AGING_BUCKETS) out[key] = toCur(db, b[key], c);
  return out;
}

const overdueOf = (b: AgingBuckets, c: Currency): Money => (["d0_30", "d31_60", "d61_90", "d90plus"] as AgingBucket[]).reduce((acc, k) => add(acc, b[k]), zero(c));

// ───────────────────────────── Receivables ─────────────────────────────

export interface ReceivableReportRow {
  id: ID;
  client: Client;
  file: BookingFile;
  agent?: User;
  dueAt?: string;
  daysPastDue: number;
  bucket: AgingBucket;
  /** File currency. */
  balance: Money;
  /** Buckets in the file currency (only the row's bucket is non-zero). */
  buckets: AgingBuckets;
  balanceDisplay: Money;
}

export function receivablesReport(db: DbState, p: ReportParams): ReportResult<ReceivableReportRow, { buckets: AgingBuckets; total: Money }> {
  const c = p.displayCurrency;
  const aging = receivablesAging(db, p.now);
  const rows: ReceivableReportRow[] = aging.rows
    .filter((r) => !p.agentId || r.file.ownerId === p.agentId)
    .map((r) => ({ ...r, id: r.file.id, agent: db.users[r.file.ownerId], balanceDisplay: toCur(db, r.balance, c) }));
  const buckets = emptyBuckets(c);
  for (const r of rows) buckets[r.bucket] = add(buckets[r.bucket], r.balanceDisplay);
  const total = AGING_BUCKETS.reduce((acc, b) => add(acc, buckets[b.key]), zero(c));
  const clients = new Set(rows.map((r) => r.client.id)).size;
  return {
    summary: [
      { label: "Outstanding", value: total },
      { label: "Overdue", value: overdueOf(buckets, c) },
      { label: "Not due yet", value: buckets.notDue },
      { label: "90+ days", value: buckets.d90plus },
      { label: "Clients owing", value: clients },
      { label: "Bookings", value: rows.length },
    ],
    charts: rows.length ? [bucketChart("Outstanding by age", buckets, c)] : [],
    rows,
    totals: { buckets, total },
    currency: c,
    fxRate: db.settings.fx.USD_TZS,
    converted: rows.some((r) => r.balance.currency !== c),
    notes: ["Commercial balance: booked and issued services less money received, aged from each booking's due date."],
  };
}

// ───────────────────────────── Payables ─────────────────────────────

export interface PayableReportRow {
  id: ID;
  supplier: Supplier;
  /** Supplier currency. */
  total: Money;
  buckets: AgingBuckets;
  bucketsDisplay: AgingBuckets;
  totalDisplay: Money;
  openItems: number;
  oldestDays: number;
}

export function payablesReport(db: DbState, p: ReportParams): ReportResult<PayableReportRow, { buckets: AgingBuckets; total: Money }> {
  const c = p.displayCurrency;
  const aging = payablesAging(db, p.now);
  const rows: PayableReportRow[] = aging.rows.map((r) => ({
    id: r.supplier.id,
    supplier: r.supplier,
    total: r.total,
    buckets: r.buckets,
    bucketsDisplay: convertBuckets(db, r.buckets, c),
    totalDisplay: toCur(db, r.total, c),
    openItems: r.openItems,
    oldestDays: r.oldestDays,
  }));
  const buckets = emptyBuckets(c);
  for (const r of rows) for (const { key } of AGING_BUCKETS) buckets[key] = add(buckets[key], r.bucketsDisplay[key]);
  const total = AGING_BUCKETS.reduce((acc, b) => add(acc, buckets[b.key]), zero(c));
  return {
    summary: [
      { label: "We owe", value: total },
      { label: "Past terms", value: overdueOf(buckets, c) },
      { label: "Within terms", value: buckets.notDue },
      { label: "Suppliers", value: rows.length },
      { label: "Open services", value: rows.reduce((s, r) => s + r.openItems, 0) },
    ],
    charts: rows.length ? [bucketChart("Payables by days past terms", buckets, c)] : [],
    rows,
    totals: { buckets, total },
    currency: c,
    fxRate: db.settings.fx.USD_TZS,
    converted: rows.some((r) => r.total.currency !== c),
    notes: ["Issued services not yet paid, aged by days past the supplier's payment terms (from the issue date). Refund credits sit in Within terms."],
  };
}

// ───────────────────────────── Cash book ─────────────────────────────

export interface CashAccountSummary {
  account: MoneyAccount;
  opening: Money;
  moneyIn: Money;
  moneyOut: Money;
  closing: Money;
}

export interface CashBookRow {
  id: ID;
  at: ISODateTime;
  account: MoneyAccount;
  kind?: LedgerKind;
  memo: string;
  ref: LedgerEntry["ref"];
  fileId?: ID;
  /** Account currency. */
  moneyIn: Money;
  moneyOut: Money;
  /** Running balance of the account after this entry. */
  balance: Money;
}

export interface CashBookReport extends ReportResult<CashBookRow, { opening: Money; moneyIn: Money; moneyOut: Money; closing: Money }> {
  accounts: CashAccountSummary[];
}

export const LEDGER_KIND_LABELS: Record<LedgerKind, string> = {
  line_issue: "Service issued",
  line_void: "Void",
  refund_reversal: "Refund reversal",
  refund_retained: "Refund retained",
  payment_in: "Receipt",
  payment_out: "Refund payout",
  payment_reversal: "Payment reversed",
  supplier_payment: "Supplier payment",
  expense: "Expense",
  expense_reversal: "Expense deleted",
  journal: "Journal",
  journal_reversal: "Journal reversed",
  transfer: "Transfer",
};

/** Per money account: opening, money in, money out, closing for the period, plus every movement with a running balance. */
export function cashBookReport(db: DbState, p: ReportParams & { accountId?: ID }): CashBookReport {
  const c = p.displayCurrency;
  const openingAt = endOfDarDay(addDaysISO(p.from, -1));
  const accounts = Object.values(db.moneyAccounts)
    .filter((a) => !p.accountId || a.id === p.accountId)
    .sort((a, b) => Number(b.active) - Number(a.active) || a.name.localeCompare(b.name));
  const summaries: CashAccountSummary[] = [];
  const rows: CashBookRow[] = [];
  for (const account of accounts) {
    const opening = accountBalance(db, account, openingAt);
    let running = opening;
    let moneyIn = zero(account.currency);
    let moneyOut = zero(account.currency);
    const entries = db.ledger.filter((e) => e.account === "1100" && e.sub?.id === account.id && inPeriod(e.at, p)).sort((a, b) => a.at.localeCompare(b.at));
    for (const e of entries) {
      const inAcc = (minor: number) => (e.currency === account.currency ? money(minor, account.currency) : convert(money(minor, e.currency), account.currency, db.settings.fx.USD_TZS));
      const i = inAcc(e.debitMinor);
      const o = inAcc(e.creditMinor);
      moneyIn = add(moneyIn, i);
      moneyOut = add(moneyOut, o);
      running = sub(add(running, i), o);
      rows.push({ id: e.id, at: e.at, account, kind: e.kind, memo: e.memo, ref: e.ref, fileId: e.fileId, moneyIn: i, moneyOut: o, balance: running });
    }
    if (!account.active && !entries.length && opening.amountMinor === 0) continue;
    summaries.push({ account, opening, moneyIn, moneyOut, closing: running });
  }
  rows.sort((a, b) => a.at.localeCompare(b.at));
  const tot = (k: keyof Omit<CashAccountSummary, "account">) => summaries.reduce((acc, s) => add(acc, toCur(db, s[k], c)), zero(c));
  const totals = { opening: tot("opening"), moneyIn: tot("moneyIn"), moneyOut: tot("moneyOut"), closing: tot("closing") };

  const grouping = autoGrouping(p);
  const keyOf = (d: string) => (grouping === "day" ? d : grouping === "week" ? weekStart(d) : d.slice(0, 7));
  const keys = grouping === "month" ? monthsOf(p) : [...new Set(daysOf(p).map(keyOf))];
  const acc = new Map(keys.map((k) => [k, { in: 0, out: 0 }]));
  for (const r of rows) {
    const a = acc.get(keyOf(toDarDate(r.at)));
    if (!a) continue;
    a.in += toChart(toCur(db, r.moneyIn, c));
    a.out += toChart(toCur(db, r.moneyOut, c));
  }
  return {
    summary: [
      { label: "Opening", value: totals.opening },
      { label: "Money in", value: totals.moneyIn },
      { label: "Money out", value: totals.moneyOut },
      { label: "Closing", value: totals.closing },
    ],
    charts: rows.length
      ? [
          {
            kind: "bar",
            title: `Money in and out by ${grouping}`,
            xKey: "period",
            xFormat: grouping === "month" ? "month" : "date",
            unit: c,
            data: keys.map((k) => ({ period: k, in: Math.round(acc.get(k)!.in * 100) / 100, out: Math.round(acc.get(k)!.out * 100) / 100 })),
            series: [
              { key: "in", label: "Money in", color: 1 },
              { key: "out", label: "Money out", color: 2 },
            ],
          },
        ]
      : [],
    rows,
    accounts: summaries,
    totals,
    currency: c,
    fxRate: db.settings.fx.USD_TZS,
    converted: summaries.some((s) => s.account.currency !== c),
  };
}
