import type { AccountCode, DbState, ISODate } from "../types";
import { fyStart, hasUsd, inView, isPnlAccount, neg, netByAccountSub, rateOf, viewCurrency, type CurrencyView } from "./books";
import { anyNonZero, type Statement, type StatementRow } from "./statement";

/**
 * Statement of financial position (IFRS for SMEs layout) as at a date, with an optional comparative date.
 *
 * Assets (non-current, then current) = Equity + Liabilities (non-current, then current). Sub-ledger control accounts
 * are split by sign, as a CPA would present them: clients who have paid ahead show as client deposits (a liability),
 * suppliers we have overpaid or who owe us a refund credit show as a current asset, and an overdrawn money account
 * shows as a bank overdraft. Retained earnings carry prior years; the year to date shows as "Profit for the year to date".
 */

type Side = "asset" | "claim";

/** Figures for one date, all in presentation sign (assets positive as debits, claims positive as credits). */
interface Figures {
  ppeCost: number;
  accumulatedDepreciation: number;
  receivables: number;
  supplierCredits: number;
  prepayments: number;
  staffAdvances: number;
  vatRecoverable: number;
  cash: number;
  shareCapital: number;
  openingEquity: number;
  retainedEarnings: number;
  profitYtd: number;
  rounding: number;
  loans: number;
  payables: number;
  clientDeposits: number;
  accruals: number;
  vatPayable: number;
  withholding: number;
  overdrafts: number;
  usd: boolean;
}

function figuresAt(db: DbState, asAt: ISODate, view: CurrencyView): Figures {
  const rate = rateOf(db);
  const subs = netByAccountSub(db, { to: asAt });
  const f: Figures = {
    ppeCost: 0,
    accumulatedDepreciation: 0,
    receivables: 0,
    supplierCredits: 0,
    prepayments: 0,
    staffAdvances: 0,
    vatRecoverable: 0,
    cash: 0,
    shareCapital: 0,
    openingEquity: 0,
    retainedEarnings: 0,
    profitYtd: 0,
    rounding: 0,
    loans: 0,
    payables: 0,
    clientDeposits: 0,
    accruals: 0,
    vatPayable: 0,
    withholding: 0,
    overdrafts: 0,
    usd: view === "base" && hasUsd(subs.map((s) => s.net)),
  };
  const byAccount = new Map<AccountCode, number>();
  let total = 0; // Σ net debit after conversion (0 unless a fractional rate leaves cents)
  for (const s of subs) {
    const v = inView(s.net, view, rate); // net debit
    total += v;
    if (isPnlAccount(s.account)) {
      f.profitYtd -= v;
      continue;
    }
    switch (s.account) {
      case "1100":
        if (v >= 0) f.cash += v;
        else f.overdrafts -= v;
        break;
      case "1200":
        if (v >= 0) f.receivables += v;
        else f.clientDeposits -= v;
        break;
      case "2100":
        if (v > 0) f.supplierCredits += v;
        else f.payables -= v;
        break;
      default:
        byAccount.set(s.account, (byAccount.get(s.account) ?? 0) + v);
    }
  }
  const dr = (c: AccountCode) => byAccount.get(c) ?? 0;
  f.ppeCost = dr("1500");
  f.accumulatedDepreciation = dr("1510"); // a credit balance: negative, printed in parentheses
  f.prepayments = dr("1300");
  f.staffAdvances = dr("1400");
  const vat = dr("2300");
  if (vat > 0) f.vatRecoverable = vat;
  else f.vatPayable = neg(vat);
  f.accruals = neg(dr("2200"));
  f.withholding = neg(dr("2400"));
  f.loans = neg(dr("2500"));
  f.shareCapital = neg(dr("3100"));
  f.retainedEarnings = neg(dr("3200"));
  f.openingEquity = neg(dr("3300"));
  f.rounding = total; // any conversion cents go on the claims side so the statement still balances
  return f;
}

export interface BalanceSheet extends Statement {
  dates: ISODate[];
  totals: { assets: number[]; equity: number[]; liabilities: number[]; equityAndLiabilities: number[] };
  /** Assets − (equity + liabilities) per column: 0 when the books balance. */
  difference: number[];
  balanced: boolean;
}

export function balanceSheet(db: DbState, p: { asAt: ISODate; compareAt?: ISODate; view: CurrencyView }): BalanceSheet {
  const dates = p.compareAt ? [p.asAt, p.compareAt] : [p.asAt];
  const figs = dates.map((d) => figuresAt(db, d, p.view));
  const col = (k: keyof Omit<Figures, "usd">) => figs.map((f) => f[k]);
  const add = (...xs: number[][]) => dates.map((_, i) => xs.reduce((s, x) => s + x[i], 0));
  const rows: StatementRow[] = [];
  const ledger = (account: AccountCode) => ({ kind: "ledger" as const, account, to: p.asAt, from: fyStart(p.asAt) });
  const line = (key: string, label: string, values: number[], opts: { code?: AccountCode; indent?: 0 | 1 | 2; always?: boolean; hint?: string; side?: Side } = {}) => {
    if (!opts.always && !anyNonZero(values)) return;
    rows.push({ key, label, style: "line", indent: opts.indent ?? 1, values, code: opts.code, drill: opts.code ? ledger(opts.code) : undefined, hint: opts.hint });
  };

  // ── Assets ──
  rows.push({ key: "h-assets", label: "Assets", style: "heading", indent: 0 });
  rows.push({ key: "h-nca", label: "Non-current assets", style: "heading", indent: 1 });
  const ppeCost = col("ppeCost");
  const accDep = col("accumulatedDepreciation");
  line("1500", "Office equipment and furniture, at cost", ppeCost, { code: "1500", indent: 2 });
  line("1510", "Less accumulated depreciation", accDep, { code: "1510", indent: 2 });
  const nca = add(ppeCost, accDep);
  rows.push({ key: "t-nca", label: "Total non-current assets", style: "subtotal", values: nca });

  rows.push({ key: "h-ca", label: "Current assets", style: "heading", indent: 1 });
  const receivables = col("receivables");
  const supplierCredits = col("supplierCredits");
  const prepayments = col("prepayments");
  const staff = col("staffAdvances");
  const vatRec = col("vatRecoverable");
  const cash = col("cash");
  line("1200", "Trade receivables", receivables, { code: "1200", indent: 2, always: true, hint: "Clients who owe us" });
  line("2100d", "Supplier credits and advances", supplierCredits, { code: "2100", indent: 2, hint: "Suppliers with a debit balance" });
  line("1300", "Prepayments and deposits", prepayments, { code: "1300", indent: 2 });
  line("1400", "Staff advances", staff, { code: "1400", indent: 2 });
  line("2300d", "VAT recoverable", vatRec, { code: "2300", indent: 2 });
  line("1100", "Cash and cash equivalents", cash, { code: "1100", indent: 2, always: true, hint: "Bank, mobile money and cash" });
  const ca = add(receivables, supplierCredits, prepayments, staff, vatRec, cash);
  rows.push({ key: "t-ca", label: "Total current assets", style: "subtotal", values: ca });
  const assets = add(nca, ca);
  rows.push({ key: "t-assets", label: "Total assets", style: "grand", values: assets });

  // ── Equity and liabilities ──
  rows.push({ key: "h-el", label: "Equity and liabilities", style: "heading", indent: 0 });
  rows.push({ key: "h-eq", label: "Equity", style: "heading", indent: 1 });
  const share = col("shareCapital");
  const openingEq = col("openingEquity");
  const retained = col("retainedEarnings");
  const profit = col("profitYtd");
  const rounding = col("rounding");
  line("3100", "Share capital", share, { code: "3100", indent: 2 });
  line("3300", "Opening balance equity", openingEq, { code: "3300", indent: 2, hint: "Opening balances brought into the books" });
  line("3200", "Retained earnings", retained, { code: "3200", indent: 2, always: true, hint: "Profits of earlier years" });
  rows.push({ key: "pytd", label: "Profit for the year to date", style: "line", indent: 2, values: profit, drill: { kind: "pnl", from: fyStart(p.asAt), to: p.asAt } });
  line("rounding", "Currency conversion rounding", rounding, { indent: 2 });
  const equity = add(share, openingEq, retained, profit, rounding);
  rows.push({ key: "t-eq", label: "Total equity", style: "subtotal", values: equity });

  rows.push({ key: "h-ncl", label: "Non-current liabilities", style: "heading", indent: 1 });
  const loans = col("loans");
  line("2500", "Loans and borrowings", loans, { code: "2500", indent: 2, always: true });
  rows.push({ key: "t-ncl", label: "Total non-current liabilities", style: "subtotal", values: loans });

  rows.push({ key: "h-cl", label: "Current liabilities", style: "heading", indent: 1 });
  const payables = col("payables");
  const deposits = col("clientDeposits");
  const accruals = col("accruals");
  const vatPay = col("vatPayable");
  const wht = col("withholding");
  const overdrafts = col("overdrafts");
  line("2100", "Trade payables", payables, { code: "2100", indent: 2, always: true, hint: "Airlines, hotels and other suppliers" });
  line("1200c", "Client deposits and credit balances", deposits, { code: "1200", indent: 2, hint: "Clients who paid ahead" });
  line("2200", "Accrued expenses", accruals, { code: "2200", indent: 2 });
  line("2300", "VAT payable", vatPay, { code: "2300", indent: 2, always: true });
  line("2400", "Withholding tax and PAYE payable", wht, { code: "2400", indent: 2 });
  line("1100c", "Bank overdrafts", overdrafts, { code: "1100", indent: 2 });
  const cl = add(payables, deposits, accruals, vatPay, wht, overdrafts);
  rows.push({ key: "t-cl", label: "Total current liabilities", style: "subtotal", values: cl });
  const liabilities = add(loans, cl);
  rows.push({ key: "t-liab", label: "Total liabilities", style: "total", values: liabilities });
  const equityAndLiabilities = add(equity, liabilities);
  rows.push({ key: "t-el", label: "Total equity and liabilities", style: "grand", values: equityAndLiabilities });

  const difference = dates.map((_, i) => assets[i] - equityAndLiabilities[i]);
  rows.push({ key: "check", label: "Difference (assets less equity and liabilities)", style: "check", values: difference });

  return {
    rows,
    columns: dates.map((d, i) => ({ key: i === 0 ? "current" : "compare", to: d })),
    dates,
    view: p.view,
    currency: viewCurrency(p.view),
    rate: rateOf(db),
    converted: figs.some((f) => f.usd),
    totals: { assets, equity, liabilities, equityAndLiabilities },
    difference,
    balanced: difference.every((d) => d === 0),
    notes: [
      "Opening balances of money accounts (Settings → Money accounts) are brought into the books against opening balance equity. Reclassify it to share capital or retained earnings with a journal once the opening position is agreed.",
      "The financial year runs January to December. Profits of earlier years are closed to retained earnings on 31 December.",
    ],
  };
}
