import { describe, expect, it } from "vitest";
import { defaultSettings } from "../defaults";
import { major, money } from "../money";
import { computePricing } from "../pricing";
import { computeRefundQuote } from "../refunds";
import { decideRefund, payRefund, requestRefund, reversePayment, transitionLine } from "../commands";
import { issuedFlightScenario } from "./builders";
import { attempt, createWorld, errorOf, NOW, run } from "./fixtures";

const usd = (n: number) => major(n, "USD");
const settings = defaultSettings(NOW);
const pricing = computePricing({ currency: "USD", markup: usd(50), serviceFee: usd(20), fare: { totalFare: usd(1450), commissionPct: 0 } }, settings, "flight");

describe("refund quote (§8.5)", () => {
  it("computes VAT on the agency fee, supplier credit and client refund", () => {
    const q = computeRefundQuote(pricing, { supplierPenalty: usd(200), agencyFee: usd(10) }, settings);
    expect(q.vatOnAgencyFee).toEqual(money(180, "USD"));
    expect(q.supplierCredit).toEqual(usd(1250));
    // 1523.60 − (200 + 10 + 1.80 + 50 + 20 + 3.60) = 1238.20
    expect(q.clientRefund).toEqual(money(123820, "USD"));
    expect(q.waiveOriginalFees).toBe(false);
  });
  it("waiving returns the original markup, fee and VAT", () => {
    const q = computeRefundQuote(pricing, { supplierPenalty: usd(200), agencyFee: usd(10), waiveOriginalFees: true }, settings);
    expect(q.clientRefund).toEqual(money(131180, "USD"));
  });
  it("defaults the agency fee from settings and converts TZS to the line currency", () => {
    // TZS 50,000 ÷ 2600 = USD 19.23; VAT 3.46
    const q = computeRefundQuote(pricing, { supplierPenalty: usd(200) }, settings);
    expect(q.agencyFee).toEqual(money(1923, "USD"));
    expect(q.vatOnAgencyFee).toEqual(money(346, "USD"));
    const q2 = computeRefundQuote(pricing, { supplierPenalty: usd(200), agencyFee: major(50_000, "TZS") }, settings);
    expect(q2.agencyFee).toEqual(money(1923, "USD"));
  });
});

describe("requestRefund", () => {
  it("moves the line to refund_pending and stores the quote in the line currency", () => {
    const w = createWorld();
    const s = issuedFlightScenario(w);
    const { refundId, number } = run(w, requestRefund, { lineId: s.lineId, kind: "refund", reason: "Visa refused", supplierPenalty: usd(200), agencyFee: major(50_000, "TZS") }, "neema");
    expect(number).toBe("RFQ-2026-00001");
    expect(w.db.lines[s.lineId].status).toBe("refund_pending");
    expect(w.db.refunds[refundId].previousStatus).toBe("issued");
    expect(w.db.refunds[refundId].quote.currency).toBe("USD");
  });
  it("blocks a negative client refund with an explanation", () => {
    const w = createWorld();
    const s = issuedFlightScenario(w);
    const e = errorOf(attempt(w, requestRefund, { lineId: s.lineId, kind: "refund", reason: "x y z", supplierPenalty: usd(1450), agencyFee: usd(100) }, "neema"));
    expect(e.code).toBe("VALIDATION");
    expect(e.message).toMatch(/more than the price the client paid/);
  });
  it("blocks a penalty above the line cost", () => {
    const w = createWorld();
    const s = issuedFlightScenario(w);
    expect(errorOf(attempt(w, requestRefund, { lineId: s.lineId, kind: "refund", reason: "abc", supplierPenalty: usd(1500) }, "neema")).field).toBe("supplierPenalty");
  });
  it("waiving the original fees is Manager only", () => {
    const w = createWorld();
    const s = issuedFlightScenario(w);
    const input = { lineId: s.lineId, kind: "refund" as const, reason: "Schedule change", supplierPenalty: usd(0), waiveOriginalFees: true };
    expect(errorOf(attempt(w, requestRefund, input, "neema")).code).toBe("FORBIDDEN");
    expect(attempt(w, requestRefund, input, "grace").ok).toBe(true);
  });
  it("is not possible on a line that is not issued or completed", () => {
    const w = createWorld();
    const s = issuedFlightScenario(w);
    run(w, requestRefund, { lineId: s.lineId, kind: "refund", reason: "first", supplierPenalty: usd(0) }, "neema");
    expect(errorOf(attempt(w, requestRefund, { lineId: s.lineId, kind: "refund", reason: "second", supplierPenalty: usd(0) }, "neema")).code).toBe("ILLEGAL_TRANSITION");
  });
});

describe("decideRefund: approval limit", () => {
  it("Accountant is blocked above TZS 500,000; Manager approves (Flow C)", () => {
    const w = createWorld();
    const s = issuedFlightScenario(w);
    const { refundId } = run(w, requestRefund, { lineId: s.lineId, kind: "refund", reason: "Cancelled", supplierPenalty: usd(200), agencyFee: major(50_000, "TZS") }, "neema");
    const e = errorOf(attempt(w, decideRefund, { refundId, decision: "approve" }, "peter"));
    expect(e).toEqual({ code: "FORBIDDEN", message: "Only a Manager can approve refunds above TZS 500,000." });
    expect(errorOf(attempt(w, decideRefund, { refundId, decision: "reject" }, "peter")).code).toBe("FORBIDDEN");
    expect(errorOf(attempt(w, decideRefund, { refundId, decision: "approve" }, "neema")).code).toBe("FORBIDDEN");
    run(w, decideRefund, { refundId, decision: "approve" }, "grace");
    expect(w.db.lines[s.lineId].status).toBe("refunded");
    expect(w.db.refunds[refundId].status).toBe("approved");
  });

  it("Accountant approves a USD refund that converts to TZS 500,000 or less", () => {
    const w = createWorld();
    const s = issuedFlightScenario(w);
    // client refund = 1523.60 − (1330 + 10 + 1.80 + 73.60) = USD 108.20 ≈ TZS 281,320
    const { refundId } = run(w, requestRefund, { lineId: s.lineId, kind: "refund", reason: "Partial", supplierPenalty: usd(1330), agencyFee: usd(10) }, "neema");
    expect(w.db.refunds[refundId].quote.clientRefund).toEqual(money(10820, "USD"));
    expect(attempt(w, decideRefund, { refundId, decision: "approve" }, "peter").ok).toBe(true);
  });

  it("reject returns the line to its previous status", () => {
    const w = createWorld();
    const s = issuedFlightScenario(w);
    run(w, transitionLine, { lineId: s.lineId, to: "completed" }, "neema");
    const { refundId } = run(w, requestRefund, { lineId: s.lineId, kind: "refund", reason: "Late", supplierPenalty: usd(1400), agencyFee: usd(0) }, "neema");
    run(w, decideRefund, { refundId, decision: "reject", note: "Not refundable" }, "peter");
    expect(w.db.lines[s.lineId].status).toBe("completed");
    expect(w.db.refunds[refundId].status).toBe("rejected");
    expect(errorOf(attempt(w, decideRefund, { refundId, decision: "approve" }, "grace")).code).toBe("CONFLICT");
  });
});

describe("payRefund", () => {
  it("pays approved refunds only, needs a reference unless cash, and can be reversed", () => {
    const w = createWorld();
    const s = issuedFlightScenario(w);
    const { refundId } = run(w, requestRefund, { lineId: s.lineId, kind: "refund", reason: "Cancelled", supplierPenalty: usd(200), agencyFee: usd(10) }, "neema");
    expect(errorOf(attempt(w, payRefund, { refundId, accountId: w.acc.crdbUsd, method: "bank_transfer", reference: "X" }, "peter")).code).toBe("CONFLICT");
    run(w, decideRefund, { refundId, decision: "approve" }, "grace");
    expect(errorOf(attempt(w, payRefund, { refundId, accountId: w.acc.crdbUsd, method: "bank_transfer" }, "peter")).field).toBe("reference");
    expect(errorOf(attempt(w, payRefund, { refundId, accountId: w.acc.crdbUsd, method: "cash" }, "neema")).code).toBe("FORBIDDEN");
    const { paymentId, number } = run(w, payRefund, { refundId, accountId: w.acc.crdbUsd, method: "bank_transfer", reference: "OUT-1" }, "peter");
    expect(number).toBe("RFD-2026-00001");
    const p = w.db.payments[paymentId];
    expect(p.direction).toBe("out");
    expect(p.amount).toEqual(money(123820, "USD"));
    run(w, reversePayment, { paymentId, reason: "Wrong account" }, "peter");
    expect(w.db.refunds[refundId].status).toBe("approved");
  });
});
