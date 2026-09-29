import { describe, expect, it } from "vitest";
import type { FlightLine, FlightSegment } from "../types";
import { major, money } from "../money";
import { addServiceLine, decideRefund, requestRefund, transitionLine } from "../commands";
import { filterLedger } from "../ledger/queries";
import { fileTotals } from "../selectors/fileTotals";
import { issueFlight, issuedFlightScenario } from "./builders";
import { attempt, createWorld, errorOf, run } from "./fixtures";

const usd = (n: number) => major(n, "USD");
const newSegments: FlightSegment[] = [
  { segmentNo: 1, carrier: "EK", flightNumber: "726", bookingClass: "Y", cabin: "economy", origin: "DAR", destination: "DXB", departureLocal: "2026-10-19T16:50", arrivalLocal: "2026-10-19T23:05", arrivalDayOffset: 0, statusCode: "HK", seats: 1 },
  { segmentNo: 2, carrier: "EK", flightNumber: "725", bookingClass: "Y", cabin: "economy", origin: "DXB", destination: "DAR", departureLocal: "2026-11-02T10:20", arrivalLocal: "2026-11-02T15:00", arrivalDayOffset: 0, statusCode: "HK", seats: 1 },
];

function exchangeScenario() {
  const w = createWorld();
  const s = issuedFlightScenario(w);
  const { refundId } = run(
    w,
    requestRefund,
    { lineId: s.lineId, kind: "exchange", reason: "Date change", supplierPenalty: usd(50), exchange: { newSegments, additionalFare: usd(100), changeFee: usd(30) } },
    "neema",
  );
  return { w, s, refundId };
}

describe("exchange (§8.6)", () => {
  it("approval marks the original exchanged and creates a linked booked line", () => {
    const { w, s, refundId } = exchangeScenario();
    const { newLineId } = run(w, decideRefund, { refundId, decision: "approve" }, "peter");
    expect(newLineId).toBeDefined();
    const orig = w.db.lines[s.lineId] as FlightLine;
    const next = w.db.lines[newLineId!] as FlightLine;
    expect(orig.status).toBe("exchanged");
    expect(orig.details.exchangedToLineId).toBe(newLineId);
    expect(next.details.exchangedFromLineId).toBe(s.lineId);
    expect(next.status).toBe("booked");
    expect(next.details.recordLocator).toBe(orig.details.recordLocator);
    expect(next.details.segments[0].departureLocal).toBe("2026-10-19T16:50");
    expect(next.details.passengers.every((p) => !p.ticketNumber)).toBe(true);
    expect(next.pricing.cost).toEqual(usd(150)); // additional fare + airline penalty
    expect(next.pricing.serviceFee).toEqual(usd(30)); // agency change fee
    expect(next.pricing.markup).toEqual(usd(0));
    expect(next.pricing.sell).toEqual(money(18540, "USD"));
    expect(w.db.refunds[refundId].status).toBe("closed");
    expect(w.db.refunds[refundId].exchange?.newLineId).toBe(newLineId);
  });

  it("does not reverse the original ticket: its value stays in charges and the ledger", () => {
    const { w, s, refundId } = exchangeScenario();
    run(w, decideRefund, { refundId, decision: "approve" }, "peter");
    expect(filterLedger(w.db.ledger, { kind: ["refund_reversal", "line_void"] })).toHaveLength(0);
    expect(fileTotals(w.db, s.fileId).charges).toEqual(money(152360 + 18540, "USD"));
  });

  it("the new line issues normally with new ticket numbers", () => {
    const { w, s, refundId } = exchangeScenario();
    const { newLineId } = run(w, decideRefund, { refundId, decision: "approve" }, "peter");
    const reuse = attempt(w, transitionLine, { lineId: newLineId!, to: "issued", tickets: [{ travellerId: s.travellerIds[0], ticketNumber: s.tickets[0] }] }, "neema");
    expect(errorOf(reuse).code).toBe("CONFLICT");
    issueFlight(w, newLineId!);
    expect(w.db.lines[newLineId!].status).toBe("issued");
    expect(filterLedger(w.db.ledger, { kind: "line_issue", lineId: newLineId! }).length).toBeGreaterThan(0);
  });

  it("rejecting an exchange puts the flight back to issued", () => {
    const { w, s, refundId } = exchangeScenario();
    run(w, decideRefund, { refundId, decision: "reject" }, "grace");
    expect(w.db.lines[s.lineId].status).toBe("issued");
  });

  it("only flights can be exchanged", () => {
    const w = createWorld();
    const s = issuedFlightScenario(w);
    const { lineId } = run(
      w,
      addServiceLine,
      {
        fileId: s.fileId,
        type: "visa",
        supplierId: w.sup.hotel,
        travellerIds: s.travellerIds,
        details: { country: "AE", visaType: "Tourist", decision: "pending" },
        pricing: { currency: "USD", cost: usd(100), markup: usd(10) },
      },
      "neema",
    );
    run(w, transitionLine, { lineId, to: "booked" }, "neema");
    run(w, transitionLine, { lineId, to: "issued" }, "neema");
    const e = errorOf(attempt(w, requestRefund, { lineId, kind: "exchange", reason: "x", supplierPenalty: usd(0), exchange: { newSegments, additionalFare: usd(0), changeFee: usd(0) } }, "neema"));
    expect(e.code).toBe("VALIDATION");
  });
});
