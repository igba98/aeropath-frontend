import { describe, expect, it } from "vitest";
import { generateSeed } from "@/store/seed/generate";
import type { AccountCode, DbState } from "../../types";
import { convert } from "../../money";
import { addDaysISO, darToday, endOfDarDay } from "../../dates";
import { accountBalance } from "../../selectors/balances";
import { cashBookReport } from "../../selectors/reports";
import {
  ACCT_PRESETS,
  acctPeriod,
  balanceSheet,
  books,
  comparativeOf,
  CURRENCY_VIEWS,
  fyStart,
  generalLedger,
  groupBalanceCheck,
  inView,
  netByAccount,
  pettyCashBook,
  pettyCashAccounts,
  profitAndLoss,
  reconciliationStatuses,
  reconciliationSummary,
  trialBalance,
  vatReturn,
  accountingOverview,
  ACCOUNT_LIST,
  type CurrencyView,
} from "..";

/** The statements on the generated demo seed: the trial balance agrees, the balance sheet balances, everything ties. */

const now = new Date("2026-09-28T09:00:00Z");
const db: DbState = generateSeed(now);
const today = darToday(now);
const rate = db.settings.fx.USD_TZS;
const VIEWS: CurrencyView[] = CURRENCY_VIEWS.map((v) => v.value);
const DATES = [today, addDaysISO(today, -30), addDaysISO(today, -90), `${today.slice(0, 4)}-06-30`, `${Number(today.slice(0, 4)) - 1}-12-31`, "2000-01-01"];

describe("the books on the demo seed", () => {
  it("has a ledger and money accounts with opening balances", () => {
    expect(db.ledger.length).toBeGreaterThan(100);
    expect(Object.values(db.moneyAccounts).some((a) => a.openingBalance.amountMinor > 0)).toBe(true);
  });

  it("balances every group, virtual opening balances and year-end closes included, per currency", () => {
    expect(groupBalanceCheck(books(db))).toEqual([]);
  });
});

describe("trial balance", () => {
  for (const view of VIEWS) {
    for (const to of DATES) {
      it(`debits equal credits as at ${to} (${view})`, () => {
        const tb = trialBalance(db, { from: fyStart(to), to, view });
        expect(tb.rounding).toBe(0);
        expect(tb.totals.debit).toBe(tb.totals.credit);
        expect(tb.balanced).toBe(true);
        expect(tb.totals.periodDebit).toBe(tb.totals.periodCredit);
      });
    }
  }

  it("carries real figures: cash, receivables and income show", () => {
    const tb = trialBalance(db, { from: fyStart(today), to: today, view: "base" });
    const code = (c: AccountCode) => tb.rows.find((r) => r.code === c);
    expect(code("1100")!.debit).toBeGreaterThan(0);
    expect(code("4100")!.credit).toBeGreaterThan(0);
    expect(code("3300")!.credit).toBeGreaterThan(0);
    expect(tb.converted).toBe(true);
  });

  it("per-currency books add up to the converted one", () => {
    const base = trialBalance(db, { from: fyStart(today), to: today, view: "base", includeZero: true });
    const tzs = trialBalance(db, { from: fyStart(today), to: today, view: "TZS", includeZero: true });
    const usd = trialBalance(db, { from: fyStart(today), to: today, view: "USD", includeZero: true });
    for (const r of base.rows) {
      const t = tzs.rows.find((x) => x.code === r.code)!.net;
      const u = usd.rows.find((x) => x.code === r.code)!.net;
      expect(r.net).toBe(t + u * rate);
    }
  });
});

describe("balance sheet", () => {
  for (const view of VIEWS) {
    for (const asAt of DATES) {
      it(`balances as at ${asAt} (${view})`, () => {
        const bs = balanceSheet(db, { asAt, compareAt: addDaysISO(asAt, -31), view });
        expect(bs.difference).toEqual([0, 0]);
        expect(bs.balanced).toBe(true);
        expect(bs.totals.assets).toEqual(bs.totals.equityAndLiabilities);
        expect(bs.rows.find((r) => r.key === "rounding")).toBeUndefined();
      });
    }
  }

  it("shows cash equal to the money accounts' balances from the cash book (opening balances included)", () => {
    const bs = balanceSheet(db, { asAt: today, view: "base" });
    const cashLine = bs.rows.find((r) => r.key === "1100")!.values![0];
    const overdrafts = bs.rows.find((r) => r.key === "1100c")?.values?.[0] ?? 0;
    const expected = Object.values(db.moneyAccounts).reduce((s, a) => s + convert(accountBalance(db, a, endOfDarDay(today)), "TZS", rate).amountMinor, 0);
    expect(cashLine - overdrafts).toBe(expected);
    const cb = cashBookReport(db, { from: today, to: today, displayCurrency: "TZS", now });
    expect(cb.totals!.closing.amountMinor).toBe(expected);
  });

  it("carries the year's profit from the profit or loss statement", () => {
    const bs = balanceSheet(db, { asAt: today, view: "base" });
    const pnl = profitAndLoss(db, { period: { from: fyStart(today), to: today }, view: "base" });
    expect(bs.rows.find((r) => r.key === "pytd")!.values![0]).toBe(pnl.profitBeforeTax[0]);
  });

  it("splits control accounts by sign: receivables less client deposits equal the 1200 balance", () => {
    const bs = balanceSheet(db, { asAt: today, view: "base" });
    const v = (k: string) => bs.rows.find((r) => r.key === k)?.values?.[0] ?? 0;
    const tb = netByAccount(db, { to: today });
    expect(v("1200") - v("1200c")).toBe(inView(tb.get("1200")!, "base", rate));
    expect(v("2100") - v("2100d")).toBe(-inView(tb.get("2100")!, "base", rate));
  });

  it("opens equity with the money accounts' opening balances", () => {
    const bs = balanceSheet(db, { asAt: today, view: "base" });
    const opening = Object.values(db.moneyAccounts).reduce((s, a) => s + convert(a.openingBalance, "TZS", rate).amountMinor, 0);
    expect(bs.rows.find((r) => r.key === "3300")!.values![0]).toBe(opening);
  });

  it("moves last year's profit into retained earnings at the year end", () => {
    const y = Number(today.slice(0, 4));
    const lastYearEnd = `${y - 1}-12-31`;
    const prior = profitAndLoss(db, { period: { from: `${y - 1}-01-01`, to: lastYearEnd }, view: "base" }).profitBeforeTax[0];
    const bsJan = balanceSheet(db, { asAt: `${y}-01-01`, view: "base" });
    const bsDec = balanceSheet(db, { asAt: lastYearEnd, view: "base" });
    const val = (bs: typeof bsJan, k: string) => bs.rows.find((r) => r.key === k)?.values?.[0] ?? 0;
    expect(val(bsDec, "pytd")).toBe(prior);
    expect(val(bsJan, "3200") - val(bsDec, "3200")).toBe(prior);
  });
});

describe("profit or loss", () => {
  for (const preset of ACCT_PRESETS.map((p) => p.value)) {
    it(`adds up for ${preset} with a comparative`, () => {
      const period = acctPeriod(preset, now);
      const pnl = profitAndLoss(db, { period, compare: comparativeOf(period), view: "base" });
      for (let i = 0; i < 2; i++) {
        expect(pnl.operatingProfit[i]).toBe(pnl.revenue[i] + pnl.otherIncome[i] + pnl.operatingExpenses[i]);
        expect(pnl.profitBeforeTax[i]).toBe(pnl.operatingProfit[i] + pnl.financeCosts[i]);
        const lines = pnl.rows.filter((r) => r.style === "line").reduce((s, r) => s + r.values![i], 0);
        expect(lines).toBe(pnl.profitBeforeTax[i]);
      }
    });
  }

  it("has revenue and expenses this year and estimates tax at 30% as a note", () => {
    const pnl = profitAndLoss(db, { period: acctPeriod("year", now), view: "base" });
    expect(pnl.revenue[0]).toBeGreaterThan(0);
    expect(pnl.operatingExpenses[0]).toBeLessThan(0);
    if (pnl.profitBeforeTax[0] > 0) expect(pnl.taxEstimate[0]).toBe(Math.round(pnl.profitBeforeTax[0] * 0.3));
    expect(pnl.notes[0]).toMatch(/30%|No corporate income tax/);
  });

  it("uses whole calendar months for the comparative", () => {
    expect(comparativeOf({ from: "2026-09-01", to: "2026-09-30" })).toEqual({ from: "2026-08-01", to: "2026-08-31" });
    expect(comparativeOf({ from: "2026-07-01", to: "2026-09-30" })).toEqual({ from: "2026-04-01", to: "2026-06-30" });
    expect(comparativeOf({ from: "2026-01-01", to: "2026-12-31" })).toEqual({ from: "2025-01-01", to: "2025-12-31" });
    expect(comparativeOf({ from: "2026-09-10", to: "2026-09-19" })).toEqual({ from: "2026-08-31", to: "2026-09-09" });
  });
});

describe("general ledger", () => {
  it("closes each account at its trial balance figure, with a running balance", () => {
    const from = acctPeriod("quarter", now).from;
    for (const view of VIEWS) {
      const tb = trialBalance(db, { from, to: today, view, includeZero: true });
      for (const a of ACCOUNT_LIST) {
        const gl = generalLedger(db, { account: a.code, from, to: today, view });
        expect(gl.closing).toBe(tb.rows.find((r) => r.code === a.code)!.net);
        let run = gl.opening;
        for (const r of gl.rows) {
          run += r.debit - r.credit;
          expect(r.balance).toBe(run);
        }
      }
    }
  });

  it("filters by sub-ledger: a money account's ledger closes at its cash book balance", () => {
    for (const a of Object.values(db.moneyAccounts)) {
      const gl = generalLedger(db, { account: "1100", subId: a.id, from: acctPeriod("month", now).from, to: today, view: a.currency });
      expect(gl.closing).toBe(accountBalance(db, a, endOfDarDay(today)).amountMinor);
    }
  });

  it("opens income accounts at nil on 1 January", () => {
    const y = today.slice(0, 4);
    const gl = generalLedger(db, { account: "4100", from: `${y}-01-01`, to: today, view: "base" });
    expect(gl.opening).toBe(0);
  });
});

describe("reconciliation, petty cash, VAT and overview on the seed", () => {
  it("summarises a reconciliation with everything ticked as agreeing with the book", () => {
    const acc = Object.values(db.moneyAccounts).find((a) => a.kind === "bank")!;
    const empty = reconciliationSummary(db, { accountId: acc.id, statementDate: today, statementBalanceMinor: 0, clearedEntryIds: [] })!;
    const all = empty.items.map((i) => i.id);
    const book = empty.bookBalance;
    const full = reconciliationSummary(db, { accountId: acc.id, statementDate: today, statementBalanceMinor: book, clearedEntryIds: all })!;
    expect(full.difference).toBe(0);
    expect(full.adjustedBankBalance).toBe(full.bookBalance);
    expect(empty.adjustedBankBalance - empty.outstandingIn + empty.outstandingOut).toBe(0);
    expect(reconciliationStatuses(db, today).length).toBeGreaterThan(0);
  });

  it("keeps a petty cash book whose running balance ends at the cash book balance", () => {
    const box = pettyCashAccounts(db)[0];
    expect(box.kind).toBe("cash");
    const p = acctPeriod("year", now);
    const book = pettyCashBook(db, { accountId: box.id, from: p.from, to: today, today })!;
    expect(book.closing).toBe(accountBalance(db, box, endOfDarDay(today)).amountMinor);
    expect(book.rows.at(-1)?.balance ?? book.opening).toBe(book.closing);
  });

  it("ties the VAT return to the VAT control account", () => {
    for (const preset of ["month", "last_month", "quarter", "year"] as const) {
      const p = acctPeriod(preset, now);
      const v = vatReturn(db, { from: p.from, to: p.to > today ? today : p.to });
      expect(v.control.closing).toBe(v.control.closingPerLedger);
      expect(v.outputTax).toBe(v.standardRated.vat + v.creditNotes.vat);
    }
    const y = vatReturn(db, acctPeriod("year", now));
    expect(y.standardRated.vat).toBeGreaterThan(0);
    expect(y.dueDate).toBe(`${Number(today.slice(0, 4)) + 1}-01-20`);
  });

  it("gives the overview figures from the books", () => {
    const o = accountingOverview(db, now);
    const bs = balanceSheet(db, { asAt: today, view: "base" });
    const v = (k: string) => bs.rows.find((r) => r.key === k)?.values?.[0] ?? 0;
    expect(o.cash).toBe(v("1100") - v("1100c"));
    expect(o.receivables).toBe(v("1200"));
    expect(o.payables).toBe(v("2100"));
    expect(o.vatPayable).toBe(v("2300") - v("2300d"));
  });
});
