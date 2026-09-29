import { describe, expect, it } from "vitest";
import type { LedgerEntry } from "../types";
import { major, money } from "../money";
import { decideRefund, deleteExpense, recordExpense, recordPayment, recordSupplierPayment, requestRefund, reversePayment, updateExpense, voidLine } from "../commands";
import { assertBalanced, groupImbalances, isBalanced, mirrorGroup, UnbalancedError } from "../ledger/postings";
import { debitBalance, filterLedger } from "../ledger/queries";
import { issuedFlightScenario } from "./builders";
import { createWorld, run } from "./fixtures";

const usd = (n: number) => major(n, "USD");
const byAccount = (entries: LedgerEntry[]) =>
  entries.reduce<Record<string, number>>((acc, e) => ({ ...acc, [e.account]: (acc[e.account] ?? 0) + e.debitMinor - e.creditMinor }), {});

describe("ledger postings", () => {
  it("line issued: Dr 1200 sell · Cr 2100 cost, 4200 markup, 4100 fee, 2300 VAT", () => {
    const w = createWorld();
    const s = issuedFlightScenario(w);
    const issue = filterLedger(w.db.ledger, { kind: "line_issue" });
    expect(byAccount(issue)).toEqual({ "1200": 152360, "2100": -145000, "4200": -5000, "4100": -2000, "2300": -360 });
    expect(issue.every((e) => e.currency === "USD" && e.lineId === s.lineId && e.fileId === s.fileId)).toBe(true);
    expect(issue.find((e) => e.account === "1200")?.sub).toEqual({ type: "client", id: s.clientId });
    expect(isBalanced(w.db.ledger)).toBe(true);
  });

  it("payment in: Dr 1100 account · Cr 1200 client, in the payment currency", () => {
    const w = createWorld();
    const s = issuedFlightScenario(w);
    run(w, recordPayment, { clientId: s.clientId, amount: usd(500), allocations: [{ fileId: s.fileId, amount: usd(500) }], method: "bank_transfer", accountId: w.acc.crdbUsd, reference: "TT1" }, "neema");
    const g = filterLedger(w.db.ledger, { kind: "payment_in" });
    expect(byAccount(g)).toEqual({ "1100": 50000, "1200": -50000 });
    expect(isBalanced(w.db.ledger)).toBe(true);
  });

  it("void posts the exact mirror of the issue group, netting the line to zero", () => {
    const w = createWorld();
    const s = issuedFlightScenario(w);
    run(w, voidLine, { lineId: s.lineId }, "neema");
    const lineEntries = filterLedger(w.db.ledger, { lineId: s.lineId });
    expect(Object.values(byAccount(lineEntries)).every((v) => v === 0)).toBe(true);
    expect(filterLedger(w.db.ledger, { kind: "line_void" })).toHaveLength(filterLedger(w.db.ledger, { kind: "line_issue" }).length);
    expect(isBalanced(w.db.ledger)).toBe(true);
  });

  it("refund approval posts (a) the mirror and (b) the retained charges", () => {
    const w = createWorld();
    const s = issuedFlightScenario(w);
    const { refundId } = run(w, requestRefund, { lineId: s.lineId, kind: "refund", reason: "Client cancelled", supplierPenalty: usd(200), agencyFee: usd(10) }, "neema");
    run(w, decideRefund, { refundId, decision: "approve" }, "grace");
    const a = filterLedger(w.db.ledger, { kind: "refund_reversal" });
    const b = filterLedger(w.db.ledger, { kind: "refund_retained" });
    expect(byAccount(a)).toEqual({ "1200": -152360, "2100": 145000, "4200": 5000, "4100": 2000, "2300": 360 });
    // retained = 200 + 10 + 1.80 VAT on fee + 50 markup + 20 fee + 3.60 VAT = 285.40
    expect(byAccount(b)).toEqual({ "1200": 28540, "2100": -20000, "4300": -1000, "2300": -540, "4200": -5000, "4100": -2000 });
    expect(groupImbalances(w.db.ledger)).toEqual([]);
    // Net effect on the client: owes only what is kept
    expect(debitBalance(w.db.ledger, { account: "1200", currency: "USD", subId: s.clientId }).amountMinor).toBe(28540);
  });

  it("refund approval with fees waived keeps only penalty, agency fee and its VAT", () => {
    const w = createWorld();
    const s = issuedFlightScenario(w);
    const { refundId } = run(w, requestRefund, { lineId: s.lineId, kind: "refund", reason: "Schedule change", supplierPenalty: usd(200), agencyFee: usd(10), waiveOriginalFees: true }, "grace");
    run(w, decideRefund, { refundId, decision: "approve" }, "grace");
    expect(byAccount(filterLedger(w.db.ledger, { kind: "refund_retained" }))).toEqual({ "1200": 21180, "2100": -20000, "4300": -1000, "2300": -180 });
  });

  it("payment reversal mirrors the payment group", () => {
    const w = createWorld();
    const s = issuedFlightScenario(w);
    const { paymentId } = run(w, recordPayment, { clientId: s.clientId, amount: usd(100), allocations: [{ fileId: s.fileId, amount: usd(100) }], method: "cash", accountId: w.acc.crdbUsd }, "neema");
    run(w, reversePayment, { paymentId, reason: "Bounced" }, "peter");
    const pay = filterLedger(w.db.ledger, { kind: ["payment_in", "payment_reversal"] });
    expect(Object.values(byAccount(pay)).every((v) => v === 0)).toBe(true);
    expect(w.db.payments[paymentId].status).toBe("reversed");
  });

  it("supplier payment: Dr 2100 supplier · Cr 1100 account", () => {
    const w = createWorld();
    const s = issuedFlightScenario(w);
    run(w, recordSupplierPayment, { supplierId: w.sup.consolidator, amount: usd(1450), accountId: w.acc.crdbUsd, allocations: [{ lineId: s.lineId, amount: usd(1450) }] }, "peter");
    expect(byAccount(filterLedger(w.db.ledger, { kind: "supplier_payment" }))).toEqual({ "2100": 145000, "1100": -145000 });
    expect(w.db.lines[s.lineId].supplierPaidMinor).toBe(145000);
    expect(isBalanced(w.db.ledger)).toBe(true);
  });

  it("expense: Dr 5xxx · Cr 1100; edits reverse and repost; delete reverses", () => {
    const w = createWorld();
    const tzs = (n: number) => major(n, "TZS");
    const { expenseId } = run(w, recordExpense, { category: "rent", payee: "Landlord", amount: tzs(1_000_000), accountId: w.acc.crdbTzs, paidAt: "2026-09-01" }, "peter");
    expect(byAccount(w.db.ledger)).toEqual({ "5100": 100_000_000, "1100": -100_000_000 });
    expect(w.db.ledger[0].at).toBe("2026-09-01T09:00:00.000Z");
    run(w, updateExpense, { expenseId, patch: { category: "gds_fees", amount: tzs(900_000) } }, "peter");
    expect(byAccount(w.db.ledger)).toEqual({ "5100": 0, "5800": 90_000_000, "1100": -90_000_000 });
    run(w, deleteExpense, { expenseId, reason: "Duplicate" }, "peter");
    expect(Object.values(byAccount(w.db.ledger)).every((v) => v === 0)).toBe(true);
    expect(w.db.expenses[expenseId].deletedAt).toBeDefined();
    expect(isBalanced(w.db.ledger)).toBe(true);
  });
});

describe("balance invariant", () => {
  it("assertBalanced throws on an unbalanced group, per currency", () => {
    const e = (debitMinor: number, creditMinor: number, currency: "USD" | "TZS"): LedgerEntry => ({
      id: "x",
      groupId: "g1",
      at: "",
      account: "1100",
      debitMinor,
      creditMinor,
      currency,
      memo: "",
      ref: { entity: "expense", id: "e" },
    });
    expect(() => assertBalanced([e(100, 0, "USD"), e(0, 100, "TZS")])).toThrow(UnbalancedError);
    expect(() => assertBalanced([e(100, 0, "USD"), e(0, 100, "USD")])).not.toThrow();
  });

  it("mirrorGroup swaps debit and credit into a new group", () => {
    const w = createWorld();
    issuedFlightScenario(w);
    const mirrored = mirrorGroup(w.db.ledger, { newId: w.newId, at: "2026-09-28T10:00:00.000Z" }, { kind: "line_void" });
    expect(new Set(mirrored.map((m) => m.groupId)).size).toBe(1);
    expect(mirrored[0].debitMinor).toBe(w.db.ledger[0].creditMinor);
    expect(money(mirrored.reduce((s, m) => s + m.debitMinor - m.creditMinor, 0), "USD").amountMinor).toBe(0);
  });
});
