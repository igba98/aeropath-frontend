import type { AccountCode, Client, Currency, DbState, Expense, ExpenseCategory, ID, Money, MoneyAccount, Payment, PaymentMethod, User } from "../../types";
import { add, sub, zero } from "../../money";
import { toDarDate } from "../../dates";
import { METHOD_LABELS } from "../../commands/recordPayment";
import { accountName, EXPENSE_ACCOUNTS, EXPENSE_CATEGORY_LABELS, REVENUE_ACCOUNTS } from "../../ledger/accounts";
import { inPeriod, monthsOf, previousPeriod, toChart, toCur, trendOf, type Period } from "./common";
import { pctText } from "./sales";
import type { ChartSpec, ReportParams, ReportResult } from "./types";

/** Receipts by method, expenses, and the simple P&L (spec §9.10). */

// ───────────────────────────── Receipts ─────────────────────────────

export interface ReceiptRow {
  id: ID;
  payment: Payment;
  client?: Client;
  account?: MoneyAccount;
  recordedBy?: User;
  verifiedBy?: User;
  /** Payment currency. */
  amount: Money;
  amountDisplay: Money;
}

export interface ReceiptGroup {
  key: string;
  label: string;
  count: number;
  /** Display currency, reversed payments excluded. */
  amount: Money;
  verified: number;
  unverified: number;
}

export interface ReceiptsReport extends ReportResult<ReceiptRow, { amount: Money }> {
  byMethod: ReceiptGroup[];
  byAccount: ReceiptGroup[];
  status: { recorded: number; verified: number; reversed: number };
}

const receiptsIn = (db: DbState, p: Period, agentId?: ID) =>
  Object.values(db.payments).filter((x) => x.direction === "in" && inPeriod(x.receivedAt, p) && (!agentId || x.recordedBy === agentId));

const receivedSum = (db: DbState, list: Payment[], c: Currency) => list.filter((x) => x.status !== "reversed").reduce((acc, x) => add(acc, toCur(db, x.amount, c)), zero(c));

function groupReceipts(db: DbState, rows: ReceiptRow[], c: Currency, keyOf: (r: ReceiptRow) => { key: string; label: string }): ReceiptGroup[] {
  const m = new Map<string, ReceiptGroup>();
  for (const r of rows) {
    const k = keyOf(r);
    const g = m.get(k.key) ?? { ...k, count: 0, amount: zero(c), verified: 0, unverified: 0 };
    g.count += 1;
    if (r.payment.status !== "reversed") g.amount = add(g.amount, r.amountDisplay);
    if (r.payment.status === "verified") g.verified += 1;
    if (r.payment.status === "recorded") g.unverified += 1;
    m.set(k.key, g);
  }
  return [...m.values()].sort((a, b) => b.amount.amountMinor - a.amount.amountMinor);
}

/** Money received in the period (payments in, by receipt date); the agent filter matches who recorded it. */
export function receiptsReport(db: DbState, p: ReportParams): ReceiptsReport {
  const c = p.displayCurrency;
  const list = receiptsIn(db, p, p.agentId).sort((a, b) => b.receivedAt.localeCompare(a.receivedAt));
  const rows: ReceiptRow[] = list.map((x) => ({
    id: x.id,
    payment: x,
    client: db.clients[x.clientId],
    account: db.moneyAccounts[x.accountId],
    recordedBy: db.users[x.recordedBy],
    verifiedBy: x.verifiedBy ? db.users[x.verifiedBy] : undefined,
    amount: x.amount,
    amountDisplay: toCur(db, x.amount, c),
  }));
  const total = receivedSum(db, list, c);
  const prevTotal = receivedSum(db, receiptsIn(db, previousPeriod(p), p.agentId), c);
  const status = { recorded: 0, verified: 0, reversed: 0 };
  for (const x of list) status[x.status] += 1;
  const unverified = list.filter((x) => x.status === "recorded").reduce((acc, x) => add(acc, toCur(db, x.amount, c)), zero(c));
  const payouts = Object.values(db.payments).filter((x) => x.direction === "out" && x.status !== "reversed" && inPeriod(x.receivedAt, p));
  const byMethod = groupReceipts(db, rows, c, (r) => ({ key: r.payment.method, label: METHOD_LABELS[r.payment.method as PaymentMethod] }));
  const byAccount = groupReceipts(db, rows, c, (r) => ({ key: r.payment.accountId, label: r.account?.name ?? "Unknown account" }));
  return {
    summary: [
      { label: "Received", value: total, trend: trendOf(total.amountMinor, prevTotal.amountMinor) },
      { label: "Receipts", value: list.length - status.reversed },
      { label: "Waiting verification", value: unverified, hint: `${status.recorded} receipts` },
      { label: "Reversed", value: status.reversed },
      { label: "Refunds paid out", value: payouts.reduce((acc, x) => add(acc, toCur(db, x.amount, c)), zero(c)) },
    ],
    charts: byMethod.length
      ? [
          {
            kind: "bar",
            title: "Received by method",
            xKey: "label",
            xFormat: "text",
            horizontal: true,
            unit: c,
            data: byMethod.map((g) => ({ label: g.label, amount: toChart(g.amount) })),
            series: [{ key: "amount", label: "Received", color: 1 }],
          },
        ]
      : [],
    rows,
    byMethod,
    byAccount,
    status,
    totals: { amount: total },
    currency: c,
    fxRate: db.settings.fx.USD_TZS,
    converted: rows.some((r) => r.amount.currency !== c),
  };
}

// ───────────────────────────── Expenses ─────────────────────────────

export interface ExpenseRow {
  id: ID;
  expense: Expense;
  categoryLabel: string;
  account?: MoneyAccount;
  recordedBy?: User;
  amount: Money;
  amountDisplay: Money;
}

export interface ExpensesReport extends ReportResult<ExpenseRow, { amount: Money }> {
  byCategory: { category: ExpenseCategory; label: string; count: number; amount: Money; share: number }[];
  byMonth: { month: string; amount: Money }[];
}

const expensesIn = (db: DbState, p: Period) => Object.values(db.expenses).filter((e) => !e.deletedAt && inPeriod(e.paidAt, p));

export function expensesReport(db: DbState, p: ReportParams): ExpensesReport {
  const c = p.displayCurrency;
  const list = expensesIn(db, p).sort((a, b) => b.paidAt.localeCompare(a.paidAt));
  const rows: ExpenseRow[] = list.map((e) => ({
    id: e.id,
    expense: e,
    categoryLabel: EXPENSE_CATEGORY_LABELS[e.category],
    account: db.moneyAccounts[e.accountId],
    recordedBy: db.users[e.recordedBy],
    amount: e.amount,
    amountDisplay: toCur(db, e.amount, c),
  }));
  const total = rows.reduce((acc, r) => add(acc, r.amountDisplay), zero(c));
  const prev = expensesIn(db, previousPeriod(p)).reduce((acc, e) => add(acc, toCur(db, e.amount, c)), zero(c));
  const cats = new Map<ExpenseCategory, { category: ExpenseCategory; label: string; count: number; amount: Money; share: number }>();
  for (const r of rows) {
    const k = r.expense.category;
    const g = cats.get(k) ?? { category: k, label: r.categoryLabel, count: 0, amount: zero(c), share: 0 };
    g.count += 1;
    g.amount = add(g.amount, r.amountDisplay);
    cats.set(k, g);
  }
  const byCategory = [...cats.values()].map((g) => ({ ...g, share: total.amountMinor ? g.amount.amountMinor / total.amountMinor : 0 })).sort((a, b) => b.amount.amountMinor - a.amount.amountMinor);
  const months = monthsOf(p);
  const byMonth = months.map((m) => ({ month: m, amount: rows.filter((r) => r.expense.paidAt.startsWith(m)).reduce((acc, r) => add(acc, r.amountDisplay), zero(c)) }));
  const top = byCategory.slice(0, 5);
  const chart: ChartSpec =
    months.length > 1
      ? {
          kind: "bar",
          title: "Expenses by month",
          xKey: "month",
          xFormat: "month",
          unit: c,
          stacked: true,
          data: months.map((m) => {
            const d: Record<string, string | number> = { month: m };
            for (const g of top) d[g.category] = toChart(rows.filter((r) => r.expense.category === g.category && r.expense.paidAt.startsWith(m)).reduce((acc, r) => add(acc, r.amountDisplay), zero(c)));
            const rest = rows.filter((r) => !top.some((g) => g.category === r.expense.category) && r.expense.paidAt.startsWith(m)).reduce((acc, r) => add(acc, r.amountDisplay), zero(c));
            if (byCategory.length > top.length) d.other_rest = toChart(rest);
            return d;
          }),
          series: [
            ...top.map((g, i) => ({ key: g.category, label: g.label, color: (i + 1) as 1 | 2 | 3 | 4 | 5 })),
            ...(byCategory.length > top.length ? [{ key: "other_rest", label: "All other", color: 5 as const }] : []),
          ],
        }
      : {
          kind: "bar",
          title: "Expenses by category",
          xKey: "label",
          xFormat: "text",
          horizontal: true,
          unit: c,
          data: byCategory.map((g) => ({ label: g.label, amount: toChart(g.amount) })),
          series: [{ key: "amount", label: "Spent", color: 1 }],
        };
  return {
    summary: [
      { label: "Spent", value: total, trend: trendOf(total.amountMinor, prev.amountMinor), invertTrend: true },
      { label: "Expenses", value: rows.length },
      { label: "Largest category", value: byCategory[0] ? byCategory[0].label : "—", hint: byCategory[0] ? pctText(byCategory[0].amount, total) : undefined },
    ],
    charts: rows.length ? [chart] : [],
    rows,
    byCategory,
    byMonth,
    totals: { amount: total },
    currency: c,
    fxRate: db.settings.fx.USD_TZS,
    converted: rows.some((r) => r.amount.currency !== c),
  };
}

// ───────────────────────────── Profit and loss ─────────────────────────────

export interface PnlRow {
  id: string;
  /** "YYYY-MM" */
  month: string;
  serviceFees: Money;
  markup: Money;
  refundFees: Money;
  revenue: Money;
  expenses: Money;
  net: Money;
}

export interface PnlReport extends ReportResult<PnlRow, Omit<PnlRow, "id" | "month">> {
  /** Expense totals per account for the whole period. */
  expenseLines: { code: AccountCode; label: string; amount: Money }[];
}

/** Credit − debit of revenue accounts and debit − credit of expense accounts per month, from the ledger. VAT excluded. */
export function pnlReport(db: DbState, p: ReportParams): PnlReport {
  const c = p.displayCurrency;
  const months = monthsOf(p);
  const z = zero(c);
  const byMonth = new Map(months.map((m) => [m, { serviceFees: z, markup: z, refundFees: z, expenses: z }]));
  const expenseByCode = new Map<AccountCode, Money>();
  const currencies = new Set<Currency>();
  for (const e of db.ledger) {
    const isRev = REVENUE_ACCOUNTS.includes(e.account);
    const isExp = EXPENSE_ACCOUNTS.includes(e.account);
    if ((!isRev && !isExp) || !inPeriod(e.at, p)) continue;
    const bucket = byMonth.get(toDarDate(e.at).slice(0, 7));
    if (!bucket) continue;
    currencies.add(e.currency);
    const amt = toCur(db, { amountMinor: isRev ? e.creditMinor - e.debitMinor : e.debitMinor - e.creditMinor, currency: e.currency }, c);
    if (e.account === "4100") bucket.serviceFees = add(bucket.serviceFees, amt);
    else if (e.account === "4200") bucket.markup = add(bucket.markup, amt);
    else if (e.account === "4300") bucket.refundFees = add(bucket.refundFees, amt);
    else {
      bucket.expenses = add(bucket.expenses, amt);
      expenseByCode.set(e.account, add(expenseByCode.get(e.account) ?? z, amt));
    }
  }
  const rows: PnlRow[] = months.map((m) => {
    const b = byMonth.get(m)!;
    const revenue = add(add(b.serviceFees, b.markup), b.refundFees);
    return { id: m, month: m, ...b, revenue, net: sub(revenue, b.expenses) };
  });
  const sumK = (k: keyof Omit<PnlRow, "id" | "month">) => rows.reduce((acc, r) => add(acc, r[k]), z);
  const totals = { serviceFees: sumK("serviceFees"), markup: sumK("markup"), refundFees: sumK("refundFees"), revenue: sumK("revenue"), expenses: sumK("expenses"), net: sumK("net") };
  const expenseLines = EXPENSE_ACCOUNTS.filter((code) => expenseByCode.has(code)).map((code) => ({ code, label: accountName(code), amount: expenseByCode.get(code)! }));
  return {
    summary: [
      { label: "Revenue", value: totals.revenue },
      { label: "Expenses", value: totals.expenses },
      { label: "Net", value: totals.net },
      { label: "Net margin", value: pctText(totals.net, totals.revenue) },
    ],
    charts: [
      {
        kind: "composed",
        title: "Revenue, expenses and net by month",
        xKey: "month",
        xFormat: "month",
        unit: c,
        data: rows.map((r) => ({ month: r.month, revenue: toChart(r.revenue), expenses: toChart(r.expenses), net: toChart(r.net) })),
        series: [
          { key: "revenue", label: "Revenue", color: 1, mark: "bar" },
          { key: "expenses", label: "Expenses", color: 3, mark: "bar" },
          { key: "net", label: "Net", color: 2, mark: "line" },
        ],
      },
    ],
    rows,
    expenseLines,
    totals,
    currency: c,
    fxRate: db.settings.fx.USD_TZS,
    converted: currencies.size > 1 || [...currencies].some((x) => x !== c),
    notes: ["Management view, not statutory accounts. Revenue is service fees (4100), markup (4200) and refund and change fees (4300) from the ledger; VAT excluded."],
  };
}
