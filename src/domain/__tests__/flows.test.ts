import { describe, expect, it } from "vitest";
import { major, money } from "../money";
import { addServiceLine, decideRefund, payRefund, recordPayment, recordSupplierPayment, requestRefund, transitionLine, verifyPayment } from "../commands";
import { groupImbalances } from "../ledger/postings";
import { fileTotals } from "../selectors/fileTotals";
import { paymentStatus } from "../status/payment-status";
import { addFlight, issueFlight, issuedFlightScenario, newClient, newFile } from "./builders";
import { attempt, createWorld, errorOf, run } from "./fixtures";

const usd = (n: number) => major(n, "USD");
const tzs = (n: number) => major(n, "TZS");

describe("supplier payments", () => {
  it("are finance only, must match the supplier and cannot exceed what is owed", () => {
    const w = createWorld();
    const s = issuedFlightScenario(w);
    const input = { supplierId: w.sup.consolidator, amount: usd(100), accountId: w.acc.crdbUsd, allocations: [{ lineId: s.lineId, amount: usd(100) }] };
    expect(errorOf(attempt(w, recordSupplierPayment, input, "neema")).code).toBe("FORBIDDEN");
    expect(errorOf(attempt(w, recordSupplierPayment, { ...input, supplierId: w.sup.hotel }, "peter")).message).toMatch(/supplied by someone else/);
    expect(errorOf(attempt(w, recordSupplierPayment, { ...input, amount: usd(1500), allocations: [{ lineId: s.lineId, amount: usd(1500) }] }, "peter")).message).toMatch(/Only USD 1,450\.00 is still owed/);
    const { number } = run(w, recordSupplierPayment, input, "peter");
    expect(number).toBe("SPY-2026-00001");
  });
});

describe("mixed-currency booking, end to end", () => {
  it("TZS file with a USD flight and a TZS transfer: pay, issue, refund, pay out — ledger balances and the file ends at zero", () => {
    const w = createWorld();
    const { clientId, travellerIds } = newClient(w);
    const { fileId } = newFile(w, clientId, travellerIds, "TZS");
    const flightId = addFlight(w, fileId, travellerIds);
    const { lineId: transferId } = run(
      w,
      addServiceLine,
      {
        fileId,
        type: "transfer",
        supplierId: w.sup.transfer,
        travellerIds,
        details: { from: "DAR airport", to: "Serena Hotel", at: "2026-10-12T20:30", vehicle: "Van", pax: 1 },
        pricing: { currency: "TZS", cost: tzs(40_000), markup: tzs(10_000) },
        status: "booked",
      },
      "neema",
    );
    // flight USD 1,523.60 × 2600 = TZS 3,961,360; transfer 40,000 + 10,000 + 10,000 fee + 1,800 VAT = 61,800
    const charges = fileTotals(w.db, fileId).charges;
    expect(charges).toEqual(tzs(4_023_160));

    // Deposit by M-Pesa (TZS), balance in USD cash converted at the settings rate
    run(w, recordPayment, { clientId, amount: tzs(1_000_000), allocations: [{ fileId, amount: tzs(1_000_000) }], method: "mpesa", accountId: w.acc.mpesa, reference: "QK12AB" }, "neema");
    expect(paymentStatus(fileTotals(w.db, fileId))).toBe("partial");
    const { paymentId } = run(w, recordPayment, { clientId, amount: money(116275, "USD"), allocations: [{ fileId, amount: tzs(3_023_160) }], method: "cash", accountId: w.acc.crdbUsd }, "peter");
    run(w, verifyPayment, { paymentId }, "peter");
    expect(paymentStatus(fileTotals(w.db, fileId))).toBe("paid");

    issueFlight(w, flightId);
    run(w, transitionLine, { lineId: transferId, to: "issued", confirmationNumber: "DT-889" }, "neema");
    run(w, recordSupplierPayment, { supplierId: w.sup.transfer, amount: tzs(40_000), accountId: w.acc.cashTzs, allocations: [{ lineId: transferId, amount: tzs(40_000) }] }, "peter");

    const { refundId } = run(w, requestRefund, { lineId: flightId, kind: "refund", reason: "Trip cancelled", supplierPenalty: usd(200), agencyFee: tzs(50_000) }, "neema");
    run(w, decideRefund, { refundId, decision: "approve" }, "grace");
    run(w, payRefund, { refundId, accountId: w.acc.crdbTzs, method: "bank_transfer", reference: "RF-1" }, "peter");

    expect(fileTotals(w.db, fileId).balance.amountMinor).toBe(0);
    expect(groupImbalances(w.db.ledger)).toEqual([]);
    expect(w.db.audit.length).toBeGreaterThan(10);
  });
});
