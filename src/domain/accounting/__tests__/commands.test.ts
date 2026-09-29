import { describe, expect, it } from "vitest";
import type { LedgerEntry } from "../../types";
import { major } from "../../money";
import { endOfDarDay } from "../../dates";
import { accountBalance } from "../../selectors/balances";
import { isBalanced } from "../../ledger/postings";
import {
  completeReconciliation,
  discardReconciliation,
  postJournal,
  recordCashCount,
  recordExpense,
  recordOpeningBalances,
  recordPayment,
  reverseJournal,
  saveReconciliation,
  transferMoney,
  type JournalLineInput,
} from "../../commands";
import { attempt, createWorld, errorOf, run, type World } from "../../__tests__/fixtures";
import { issuedFlightScenario } from "../../__tests__/builders";
import { balanceSheet, generalLedger, pettyCashBook, profitAndLoss, reconciliationSummary, trialBalance, vatReturn } from "..";

const tzs = (n: number) => major(n, "TZS");
const usd = (n: number) => major(n, "USD");
const TODAY = "2026-09-28";
const byAccount = (entries: LedgerEntry[]) => entries.reduce<Record<string, number>>((acc, e) => ({ ...acc, [e.account]: (acc[e.account] ?? 0) + e.debitMinor - e.creditMinor }), {});
const money = (w: World, id: string) => ({ type: "money_account" as const, id });
const bal = (w: World, id: string) => accountBalance(w.db, w.db.moneyAccounts[id], endOfDarDay(TODAY)).amountMinor;

function booksBalance(w: World) {
  const tb = trialBalance(w.db, { from: "2026-01-01", to: TODAY, view: "base" });
  const bs = balanceSheet(w.db, { asAt: TODAY, view: "base" });
  expect(tb.totals.debit).toBe(tb.totals.credit);
  expect(bs.difference[0]).toBe(0);
  expect(isBalanced(w.db.ledger)).toBe(true);
}

const rent: JournalLineInput[] = [
  { account: "5100", debitMinor: 50_000_000, creditMinor: 0, memo: "September rent accrued" },
  { account: "2200", debitMinor: 0, creditMinor: 50_000_000 },
];

describe("postJournal", () => {
  it("posts a balanced JV with the next number, kind journal, at noon on its date", () => {
    const w = createWorld();
    const r = run(w, postJournal, { date: "2026-09-27", memo: "Accrue rent", currency: "TZS", lines: rent }, "peter");
    expect(r.number).toBe("JV-2026-00001");
    const j = w.db.journals[r.journalId];
    expect(j).toMatchObject({ source: "manual", status: "posted", currency: "TZS", createdBy: "usr_peter" });
    const entries = w.db.ledger.filter((e) => e.ref.entity === "journal" && e.ref.id === r.journalId);
    expect(entries).toHaveLength(2);
    expect(entries.every((e) => e.kind === "journal" && e.at === "2026-09-27T09:00:00.000Z")).toBe(true);
    expect(byAccount(entries)).toEqual({ "5100": 50_000_000, "2200": -50_000_000 });
    expect(entries[0].memo).toBe("JV-2026-00001 · September rent accrued");
    expect(w.db.audit.at(-1)?.action).toBe("journal.posted");
    const second = run(w, postJournal, { date: "2026-09-28", memo: "Again", currency: "TZS", lines: rent }, "grace");
    expect(second.number).toBe("JV-2026-00002");
    booksBalance(w);
  });

  it("refuses agents", () => {
    const w = createWorld();
    expect(errorOf(attempt(w, postJournal, { date: TODAY, memo: "x", currency: "TZS", lines: rent }, "neema")).code).toBe("FORBIDDEN");
  });

  it("checks the lines", () => {
    const w = createWorld();
    const tryLines = (lines: JournalLineInput[], currency: "TZS" | "USD" = "TZS") => errorOf(attempt(w, postJournal, { date: TODAY, memo: "Test", currency, lines }, "peter"));
    expect(tryLines([rent[0]]).message).toMatch(/at least 2 lines/);
    expect(tryLines([rent[0], { ...rent[1], creditMinor: 40_000_000 }]).code).toBe("UNBALANCED");
    expect(tryLines([{ account: "5100", debitMinor: 100, creditMinor: 100 }, rent[1]]).message).toMatch(/not both/);
    expect(tryLines([{ account: "5100", debitMinor: 0, creditMinor: 0 }, rent[1]]).message).toMatch(/debit or a credit/);
    expect(tryLines([{ account: "9999" as never, debitMinor: 100, creditMinor: 0 }, rent[1]]).message).toMatch(/choose an account/);
    expect(tryLines([{ account: "5100", debitMinor: -5, creditMinor: 0 }, rent[1]]).message).toMatch(/negative/);
    const bank: JournalLineInput[] = [
      { account: "1100", debitMinor: 1000, creditMinor: 0 },
      { account: "4900", debitMinor: 0, creditMinor: 1000 },
    ];
    expect(tryLines(bank).field).toBe("lines.0.sub");
    expect(tryLines([{ ...bank[0], sub: { type: "client", id: "x" } }, bank[1]]).message).toMatch(/kept by money account/);
    expect(tryLines([{ ...bank[0], sub: money(w, w.acc.crdbUsd) }, bank[1]]).message).toMatch(/holds USD/);
    expect(tryLines([{ account: "1200", debitMinor: 1000, creditMinor: 0 }, bank[1]]).message).toMatch(/choose the client/);
    expect(tryLines([{ account: "2100", debitMinor: 1000, creditMinor: 0, sub: { type: "supplier", id: "nope" } }, bank[1]]).message).toMatch(/supplier could not be found/);
    expect(tryLines([{ account: "5100", debitMinor: 1000, creditMinor: 0, sub: money(w, w.acc.crdbTzs) }, bank[1]]).message).toMatch(/no sub-ledger/);
    expect(errorOf(attempt(w, postJournal, { date: "2026-13-01", memo: "x", currency: "TZS", lines: rent }, "peter")).field).toBe("date");
    expect(errorOf(attempt(w, postJournal, { date: TODAY, memo: " ", currency: "TZS", lines: rent }, "peter")).field).toBe("memo");
    expect(w.db.ledger).toHaveLength(0);
  });

  it("posts to a money account and moves its cash book balance", () => {
    const w = createWorld();
    run(
      w,
      postJournal,
      {
        date: TODAY,
        memo: "Bank interest",
        currency: "TZS",
        lines: [
          { account: "1100", sub: money(w, w.acc.crdbTzs), debitMinor: 1_500_000, creditMinor: 0 },
          { account: "4900", debitMinor: 0, creditMinor: 1_500_000 },
        ],
      },
      "peter",
    );
    expect(bal(w, w.acc.crdbTzs)).toBe(1_500_000);
    const pnl = profitAndLoss(w.db, { period: { from: "2026-09-01", to: "2026-09-30" }, view: "base" });
    expect(pnl.otherIncome[0]).toBe(1_500_000);
    booksBalance(w);
  });
});

describe("reverseJournal", () => {
  it("mirrors the group, marks the journal reversed and nets the accounts to nil", () => {
    const w = createWorld();
    const { journalId } = run(w, postJournal, { date: "2026-09-20", memo: "Accrue rent", currency: "TZS", lines: rent }, "peter");
    run(w, reverseJournal, { journalId, reason: "Posted twice" }, "peter", new Date("2026-09-28T09:00:00Z"));
    const j = w.db.journals[journalId];
    expect(j.status).toBe("reversed");
    expect(j.reversedBy).toBe("usr_peter");
    const rev = w.db.ledger.filter((e) => e.kind === "journal_reversal");
    expect(rev).toHaveLength(2);
    expect(rev[0].at).toBe("2026-09-28T09:00:00.000Z");
    expect(Object.values(byAccount(w.db.ledger)).every((v) => v === 0)).toBe(true);
    expect(errorOf(attempt(w, reverseJournal, { journalId }, "peter")).code).toBe("CONFLICT");
    expect(errorOf(attempt(w, reverseJournal, { journalId: "jnl_x" }, "peter")).code).toBe("NOT_FOUND");
    booksBalance(w);
  });

  it("will not date a reversal before the journal", () => {
    const w = createWorld();
    const { journalId } = run(w, postJournal, { date: "2026-09-20", memo: "Accrue rent", currency: "TZS", lines: rent }, "peter");
    expect(errorOf(attempt(w, reverseJournal, { journalId, date: "2026-09-19" }, "peter")).field).toBe("date");
  });
});

describe("transferMoney", () => {
  it("moves money between two accounts of one currency as a transfer journal", () => {
    const w = createWorld();
    w.db.moneyAccounts[w.acc.crdbTzs].openingBalance = tzs(5_000_000);
    const r = run(w, transferMoney, { fromAccountId: w.acc.crdbTzs, toAccountId: w.acc.cashTzs, amount: tzs(300_000), date: TODAY, memo: "Petty cash top-up" }, "peter");
    expect(r.number).toBe("JV-2026-00001");
    expect(w.db.journals[r.journalId].source).toBe("transfer");
    expect(w.db.ledger.every((e) => e.kind === "transfer" && e.account === "1100")).toBe(true);
    expect(bal(w, w.acc.crdbTzs)).toBe(470_000_000);
    expect(bal(w, w.acc.cashTzs)).toBe(30_000_000);
    const book = pettyCashBook(w.db, { accountId: w.acc.cashTzs, from: "2026-09-01", to: "2026-09-30", today: TODAY })!;
    expect(book.rows[0]).toMatchObject({ type: "top_up", received: 30_000_000, number: r.number });
    expect(book.totals.topUps).toBe(30_000_000);
    booksBalance(w);
  });

  it("refuses mixed currencies, the same account and agents", () => {
    const w = createWorld();
    expect(errorOf(attempt(w, transferMoney, { fromAccountId: w.acc.crdbUsd, toAccountId: w.acc.cashTzs, amount: usd(10), date: TODAY }, "peter")).message).toMatch(/holds USD/);
    expect(errorOf(attempt(w, transferMoney, { fromAccountId: w.acc.cashTzs, toAccountId: w.acc.cashTzs, amount: tzs(10), date: TODAY }, "peter")).field).toBe("toAccountId");
    expect(errorOf(attempt(w, transferMoney, { fromAccountId: w.acc.crdbTzs, toAccountId: w.acc.cashTzs, amount: usd(10), date: TODAY }, "peter")).field).toBe("amount");
    expect(errorOf(attempt(w, transferMoney, { fromAccountId: w.acc.crdbTzs, toAccountId: w.acc.cashTzs, amount: tzs(0), date: TODAY }, "peter")).field).toBe("amount");
    expect(errorOf(attempt(w, transferMoney, { fromAccountId: w.acc.crdbTzs, toAccountId: w.acc.cashTzs, amount: tzs(10), date: TODAY }, "neema")).code).toBe("FORBIDDEN");
  });
});

describe("opening balances", () => {
  it("treats money-account opening balances as brought forward against 3300, so the balance sheet balances", () => {
    const w = createWorld();
    w.db.moneyAccounts[w.acc.crdbTzs].openingBalance = tzs(10_000_000);
    w.db.moneyAccounts[w.acc.crdbUsd].openingBalance = usd(1_000);
    const bs = balanceSheet(w.db, { asAt: TODAY, view: "base" });
    const v = (k: string) => bs.rows.find((r) => r.key === k)?.values?.[0];
    expect(v("1100")).toBe(1_000_000_000 + 100_000 * 2600);
    expect(v("3300")).toBe(1_000_000_000 + 100_000 * 2600);
    expect(bs.difference[0]).toBe(0);
    const gl = generalLedger(w.db, { account: "1100", subId: w.acc.crdbTzs, from: "2026-09-01", to: TODAY, view: "TZS" });
    expect(gl.opening).toBe(1_000_000_000);
  });

  it("records other opening balances in one journal balanced to 3300", () => {
    const w = createWorld();
    const { journalId } = run(
      w,
      recordOpeningBalances,
      {
        date: "2026-06-01",
        currency: "TZS",
        lines: [
          { account: "1500", debitMinor: 1_200_000_000, creditMinor: 0, memo: "Laptops and furniture" },
          { account: "1510", debitMinor: 0, creditMinor: 200_000_000 },
          { account: "2500", debitMinor: 0, creditMinor: 500_000_000 },
          { account: "3100", debitMinor: 0, creditMinor: 100_000_000 },
        ],
      },
      "grace",
    );
    const j = w.db.journals[journalId];
    expect(j.source).toBe("opening_balance");
    expect(j.lines.at(-1)).toMatchObject({ account: "3300", creditMinor: 400_000_000 });
    const bs = balanceSheet(w.db, { asAt: TODAY, view: "base" });
    const v = (k: string) => bs.rows.find((r) => r.key === k)?.values?.[0];
    expect(v("1500")).toBe(1_200_000_000);
    expect(v("1510")).toBe(-200_000_000);
    expect(v("2500")).toBe(500_000_000);
    expect(bs.totals.assets[0]).toBe(1_000_000_000);
    expect(bs.difference[0]).toBe(0);
    // One live opening journal per currency.
    expect(errorOf(attempt(w, recordOpeningBalances, { date: "2026-06-01", currency: "TZS", lines: [{ account: "1500", debitMinor: 1, creditMinor: 0 }] }, "grace")).code).toBe("CONFLICT");
    run(w, reverseJournal, { journalId }, "grace");
    run(w, recordOpeningBalances, { date: "2026-06-01", currency: "TZS", lines: [{ account: "1500", debitMinor: 1, creditMinor: 0 }] }, "grace");
    booksBalance(w);
  });

  it("keeps money accounts, 3300 and income accounts out of the opening journal", () => {
    const w = createWorld();
    const tryLine = (l: JournalLineInput) => errorOf(attempt(w, recordOpeningBalances, { date: "2026-06-01", currency: "TZS", lines: [l] }, "grace"));
    expect(tryLine({ account: "1100", sub: money(w, w.acc.crdbTzs), debitMinor: 1, creditMinor: 0 }).message).toMatch(/Settings → Money accounts/);
    expect(tryLine({ account: "3300", debitMinor: 1, creditMinor: 0 }).field).toBe("lines.0.account");
    expect(tryLine({ account: "4100", debitMinor: 0, creditMinor: 1 }).message).toMatch(/balance-sheet/);
  });
});

describe("year-end close", () => {
  it("closes last year's profit into retained earnings and opens income accounts at nil", () => {
    const w = createWorld();
    run(
      w,
      postJournal,
      {
        date: "2025-11-15",
        memo: "Consulting income",
        currency: "TZS",
        lines: [
          { account: "1400", debitMinor: 700_000, creditMinor: 0 },
          { account: "4900", debitMinor: 0, creditMinor: 700_000 },
        ],
      },
      "peter",
    );
    run(
      w,
      postJournal,
      {
        date: "2026-02-15",
        memo: "Income",
        currency: "TZS",
        lines: [
          { account: "1400", debitMinor: 100_000, creditMinor: 0 },
          { account: "4900", debitMinor: 0, creditMinor: 100_000 },
        ],
      },
      "peter",
    );
    const dec = trialBalance(w.db, { from: "2025-01-01", to: "2025-12-31", view: "base" });
    expect(dec.rows.find((r) => r.code === "4900")?.credit).toBe(700_000);
    const now = trialBalance(w.db, { from: "2026-01-01", to: TODAY, view: "base" });
    expect(now.rows.find((r) => r.code === "4900")?.credit).toBe(100_000);
    expect(now.rows.find((r) => r.code === "3200")?.credit).toBe(700_000);
    expect(now.totals.debit).toBe(now.totals.credit);
    const bs = balanceSheet(w.db, { asAt: TODAY, compareAt: "2025-12-31", view: "base" });
    const row = (k: string) => bs.rows.find((r) => r.key === k)?.values;
    expect(row("3200")).toEqual([700_000, 0]);
    expect(row("pytd")).toEqual([100_000, 700_000]);
    expect(bs.difference).toEqual([0, 0]);
    const gl = generalLedger(w.db, { account: "4900", from: "2025-07-01", to: TODAY, view: "base" });
    expect(gl.rows.map((r) => r.kind)).toEqual(["journal", "year_end_close", "journal"]);
    expect(gl.closing).toBe(-100_000);
  });
});

describe("bank reconciliation", () => {
  function scenario() {
    const w = createWorld();
    w.db.moneyAccounts[w.acc.crdbTzs].openingBalance = tzs(1_000_000);
    const s = issuedFlightScenario(w, { currency: "TZS", fileCurrency: "TZS", total: 2_000_000, markup: 100_000, serviceFee: 50_000 });
    run(
      w,
      recordPayment,
      {
        clientId: s.clientId,
        amount: tzs(500_000),
        method: "bank_transfer",
        accountId: w.acc.crdbTzs,
        reference: "TT1",
        receivedAt: "2026-09-10T10:00",
        allocations: [{ fileId: s.fileId, amount: tzs(500_000) }],
      },
      "peter",
    );
    run(w, recordExpense, { category: "rent", payee: "Landlord", amount: tzs(300_000), accountId: w.acc.crdbTzs, paidAt: "2026-09-12" }, "peter");
    run(w, recordExpense, { category: "utilities", payee: "TANESCO", amount: tzs(50_000), accountId: w.acc.crdbTzs, paidAt: "2026-09-29" }, "peter");
    const entries = w.db.ledger.filter((e) => e.account === "1100" && e.sub?.id === w.acc.crdbTzs);
    return { w, entries };
  }

  it("summarises beginning, cleared, difference and the reconciling items", () => {
    const { w, entries } = scenario();
    const receipt = entries.find((e) => e.debitMinor > 0)!;
    const s = reconciliationSummary(w.db, { accountId: w.acc.crdbTzs, statementDate: "2026-09-15", statementBalanceMinor: 150_000_000, clearedEntryIds: [receipt.id] })!;
    expect(s.items).toHaveLength(2); // the 29 Sep expense is after the statement date
    expect(s.beginning).toBe(100_000_000);
    expect(s.clearedBalance).toBe(150_000_000);
    expect(s.difference).toBe(0);
    expect(s.bookBalance).toBe(120_000_000);
    expect(s.outstandingOut).toBe(30_000_000);
    expect(s.adjustedBankBalance).toBe(s.bookBalance);
  });

  it("saves a draft, refuses to complete with a difference, completes at nil and carries forward", () => {
    const { w, entries } = scenario();
    const [receipt, rentOut] = [entries.find((e) => e.debitMinor > 0)!, entries.find((e) => e.creditMinor === 30_000_000)!];
    const base = { moneyAccountId: w.acc.crdbTzs, statementDate: "2026-09-15", statementBalanceMinor: 120_000_000 };
    const draft = run(w, saveReconciliation, { ...base, clearedEntryIds: [receipt.id] }, "peter");
    expect(draft.differenceMinor).toBe(-30_000_000);
    expect(w.db.reconciliations[draft.reconciliationId].status).toBe("draft");
    expect(errorOf(attempt(w, completeReconciliation, { ...base, clearedEntryIds: [receipt.id] }, "peter")).message).toMatch(/differ by TZS 300,000/);
    const done = run(w, completeReconciliation, { ...base, clearedEntryIds: [receipt.id, rentOut.id] }, "peter");
    expect(done.reconciliationId).toBe(draft.reconciliationId);
    expect(w.db.reconciliations[done.reconciliationId]).toMatchObject({ status: "completed", completedBy: "usr_peter" });
    // Next statement starts from 1,200,000 and lists only what is left.
    const next = reconciliationSummary(w.db, { accountId: w.acc.crdbTzs, statementDate: "2026-09-30", statementBalanceMinor: 115_000_000, clearedEntryIds: [] })!;
    expect(next.beginning).toBe(120_000_000);
    expect(next.items.map((i) => i.moneyOut)).toEqual([5_000_000]);
    expect(errorOf(attempt(w, saveReconciliation, { ...base, statementDate: "2026-09-10", clearedEntryIds: [] }, "peter")).field).toBe("statementDate");
    expect(errorOf(attempt(w, completeReconciliation, { ...base, statementDate: "2026-09-30", clearedEntryIds: [receipt.id] }, "peter")).field).toBe("clearedEntryIds");
  });

  it("discards a draft and refuses agents", () => {
    const { w } = scenario();
    const { reconciliationId } = run(w, saveReconciliation, { moneyAccountId: w.acc.crdbTzs, statementDate: "2026-09-15", statementBalanceMinor: 0, clearedEntryIds: [] }, "peter");
    run(w, discardReconciliation, { reconciliationId }, "peter");
    expect(w.db.reconciliations[reconciliationId]).toBeUndefined();
    expect(errorOf(attempt(w, saveReconciliation, { moneyAccountId: w.acc.crdbTzs, statementDate: "2026-09-15", statementBalanceMinor: 0, clearedEntryIds: [] }, "neema")).code).toBe("FORBIDDEN");
  });
});

describe("petty cash", () => {
  it("lists vouchers paid from the box with a running balance and a category analysis", () => {
    const w = createWorld();
    w.db.moneyAccounts[w.acc.cashTzs].openingBalance = tzs(200_000);
    run(w, recordExpense, { category: "transport", payee: "Bajaji", amount: tzs(15_000), accountId: w.acc.cashTzs, paidAt: "2026-09-05" }, "peter");
    run(w, recordExpense, { category: "office_supplies", payee: "Stationers", amount: tzs(40_000), accountId: w.acc.cashTzs, paidAt: "2026-09-06" }, "peter");
    const book = pettyCashBook(w.db, { accountId: w.acc.cashTzs, from: "2026-09-01", to: "2026-09-30", today: TODAY })!;
    expect(book.float).toBe(20_000_000);
    expect(book.opening).toBe(20_000_000);
    expect(book.rows.map((r) => [r.type, r.number, r.paid, r.balance])).toEqual([
      ["voucher", "EXP-2026-00001", 1_500_000, 18_500_000],
      ["voucher", "EXP-2026-00002", 4_000_000, 14_500_000],
    ]);
    expect(book.byCategory.map((c) => c.category)).toEqual(["office_supplies", "transport"]);
    expect(book.topUpToFloat).toBe(5_500_000);
  });

  it("posts a cash count shortage or overage so the book agrees with the box", () => {
    const w = createWorld();
    w.db.moneyAccounts[w.acc.cashTzs].openingBalance = tzs(100_000);
    const short = run(w, recordCashCount, { accountId: w.acc.cashTzs, countedMinor: 9_800_000, date: TODAY }, "peter");
    expect(short.differenceMinor).toBe(-200_000);
    expect(byAccount(w.db.ledger)).toEqual({ "5900": 200_000, "1100": -200_000 });
    expect(bal(w, w.acc.cashTzs)).toBe(9_800_000);
    expect(w.db.journals[short.journalId].source).toBe("petty_cash");
    expect(errorOf(attempt(w, recordCashCount, { accountId: w.acc.cashTzs, countedMinor: 9_800_000, date: TODAY }, "peter")).message).toMatch(/agrees/);
    run(w, recordCashCount, { accountId: w.acc.cashTzs, countedMinor: 9_900_000, date: TODAY }, "peter");
    expect(byAccount(w.db.ledger)["4900"]).toBe(-100_000);
    expect(bal(w, w.acc.cashTzs)).toBe(9_900_000);
    const book = pettyCashBook(w.db, { accountId: w.acc.cashTzs, from: "2026-09-01", to: "2026-09-30", today: TODAY })!;
    expect(book.rows.map((r) => r.type)).toEqual(["adjustment", "adjustment"]);
    booksBalance(w);
  });
});

describe("VAT return", () => {
  it("takes output VAT from issued services and credit notes, and input VAT from journals", () => {
    const w = createWorld();
    issuedFlightScenario(w, { currency: "TZS", fileCurrency: "TZS", total: 1_000_000, markup: 50_000, serviceFee: 100_000 });
    run(
      w,
      postJournal,
      {
        date: TODAY,
        memo: "Office printer (tax invoice 0042)",
        currency: "TZS",
        lines: [
          { account: "5700", debitMinor: 10_000_000, creditMinor: 0 },
          { account: "2300", debitMinor: 1_800_000, creditMinor: 0, memo: "Input VAT" },
          { account: "1100", sub: money(w, w.acc.crdbTzs), debitMinor: 0, creditMinor: 11_800_000 },
        ],
      },
      "peter",
    );
    const v = vatReturn(w.db, { from: "2026-09-01", to: "2026-09-30" });
    expect(v.standardRated).toEqual({ value: 10_000_000, vat: 1_800_000 });
    expect(v.inputTax).toBe(1_800_000);
    expect(v.netPayable).toBe(0);
    expect(v.control.closing).toBe(v.control.closingPerLedger);
    expect(v.documents).toHaveLength(1);
    expect(v.dueDate).toBe("2026-10-20");
  });
});
