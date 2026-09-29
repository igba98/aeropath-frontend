import type { AccountCode, DbState } from "../types";
import { ACCOUNT_LIST, emptyNet, hasUsd, inView, neg, netByAccount, rateOf, viewCurrency, type CurrencyView } from "./books";
import { anyNonZero, type Statement, type StatementRow } from "./statement";
import type { Period } from "./periods";

/**
 * Statement of profit or loss (IFRS for SMEs, expenses by nature), from real ledger postings in the period:
 * revenue, other income, operating expenses, operating profit, finance costs and profit before tax. Figures are
 * signed as they add up: income positive, expenses in parentheses. Income tax is a note only (30% estimate).
 */

export const CORPORATE_TAX_RATE = 0.3;

const REVENUE: { code: AccountCode; label: string }[] = [
  { code: "4100", label: "Service fees" },
  { code: "4200", label: "Markup on travel services" },
  { code: "4300", label: "Refund and change fees" },
];
const FINANCE_COSTS: AccountCode[] = ["5960"];

export interface ProfitAndLoss extends Statement {
  periods: Period[];
  revenue: number[];
  otherIncome: number[];
  operatingExpenses: number[];
  operatingProfit: number[];
  financeCosts: number[];
  profitBeforeTax: number[];
  /** 30% of a positive profit before tax; an estimate, not the tax charge. */
  taxEstimate: number[];
}

export function profitAndLoss(db: DbState, p: { period: Period; compare?: Period; view: CurrencyView }): ProfitAndLoss {
  const rate = rateOf(db);
  const periods = p.compare ? [p.period, p.compare] : [p.period];
  const nets = periods.map((q) => netByAccount(db, { from: q.from, to: q.to, realOnly: true }));
  const n = periods.length;
  /** Credit balance (income positive) per period. */
  const income = (code: AccountCode) => nets.map((m) => neg(inView(m.get(code) ?? emptyNet(), p.view, rate)));
  const drill = (code: AccountCode) => ({ kind: "ledger" as const, account: code, from: p.period.from, to: p.period.to });

  const rows: StatementRow[] = [];
  const revenueLines = REVENUE.map((r) => ({ ...r, values: income(r.code) }));
  const revenue = new Array<number>(n).fill(0);
  rows.push({ key: "h-rev", label: "Revenue", style: "heading", indent: 0 });
  for (const r of revenueLines) {
    r.values.forEach((v, i) => (revenue[i] += v));
    rows.push({ key: r.code, code: r.code, label: r.label, style: "line", indent: 1, values: r.values, drill: drill(r.code) });
  }
  rows.push({ key: "t-rev", label: "Total revenue", style: "subtotal", values: revenue });

  const otherIncome = income("4900");
  rows.push({ key: "4900", code: "4900", label: "Other income", style: "line", indent: 0, values: otherIncome, drill: drill("4900") });

  const opexCodes = ACCOUNT_LIST.filter((a) => a.kind === "expense" && !FINANCE_COSTS.includes(a.code));
  const operatingExpenses = new Array<number>(n).fill(0);
  rows.push({ key: "h-opex", label: "Operating expenses", style: "heading", indent: 0 });
  for (const a of opexCodes) {
    const values = income(a.code); // negative for an expense
    values.forEach((v, i) => (operatingExpenses[i] += v));
    if (anyNonZero(values)) rows.push({ key: a.code, code: a.code, label: a.name, style: "line", indent: 1, values, drill: drill(a.code) });
  }
  rows.push({ key: "t-opex", label: "Total operating expenses", style: "subtotal", values: operatingExpenses });

  const operatingProfit = revenue.map((v, i) => v + otherIncome[i] + operatingExpenses[i]);
  rows.push({ key: "op", label: "Operating profit", style: "total", values: operatingProfit });

  const financeCosts = new Array<number>(n).fill(0);
  for (const code of FINANCE_COSTS) {
    const values = income(code);
    values.forEach((v, i) => (financeCosts[i] += v));
  }
  rows.push({ key: "5960", code: "5960", label: "Finance costs", style: "line", indent: 0, values: financeCosts, drill: drill("5960") });

  const profitBeforeTax = operatingProfit.map((v, i) => v + financeCosts[i]);
  rows.push({ key: "pbt", label: "Profit before tax", style: "grand", values: profitBeforeTax });

  const taxEstimate = profitBeforeTax.map((v) => (v > 0 ? Math.round(v * CORPORATE_TAX_RATE) : 0));

  const pbt = profitBeforeTax[0];
  return {
    rows,
    columns: periods.map((q, i) => ({ key: i === 0 ? "current" : "compare", from: q.from, to: q.to })),
    periods,
    view: p.view,
    currency: viewCurrency(p.view),
    rate,
    converted: p.view === "base" && nets.some((m) => hasUsd(m.values())),
    revenue,
    otherIncome,
    operatingExpenses,
    operatingProfit,
    financeCosts,
    profitBeforeTax,
    taxEstimate,
    notes: [
      pbt > 0
        ? `Corporate income tax at ${CORPORATE_TAX_RATE * 100}% of profit before tax would be about ${(taxEstimate[0] / 100).toLocaleString("en-US", { maximumFractionDigits: 0 })} ${viewCurrency(p.view)}. This is an estimate only: taxable income under the Income Tax Act differs from accounting profit (disallowed expenses, capital allowances in place of depreciation), and no tax is posted.`
        : `No corporate income tax estimate: there is no profit before tax for the period. Losses may be carried forward under the Income Tax Act.`,
      "Revenue is the agency's own income: service fees, markup and refund fees. Fares and supplier costs collected for airlines, hotels and other suppliers pass through payables, and VAT is excluded.",
    ],
  };
}
