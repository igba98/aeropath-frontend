import { describe, expect, it } from "vitest";
import { major, money } from "../money";
import { cancelBookingFile, issueInvoice, recordPayment, transitionLine, updateServiceLine } from "../commands";
import { fileStatus, travelDates } from "../status/file-status";
import { fileDueAt, isOverdue, paymentStatus } from "../status/payment-status";
import { addFlight, issuedFlightScenario, newClient, newFile } from "./builders";
import { createWorld, run } from "./fixtures";

const usd = (n: number) => major(n, "USD");
const AFTER_TRIP = new Date("2026-11-01T09:00:00.000Z");

describe("file status (§7.2)", () => {
  it("draft with no lines or only quoted lines", () => {
    const w = createWorld();
    const { clientId, travellerIds } = newClient(w);
    const { fileId } = newFile(w, clientId, travellerIds);
    expect(fileStatus(w.db, fileId, w.now)).toBe("draft");
    addFlight(w, fileId, travellerIds, { booked: false });
    expect(fileStatus(w.db, fileId, w.now)).toBe("draft");
  });

  it("confirmed while a booked or issued line has travel ahead", () => {
    const w = createWorld();
    const { clientId, travellerIds } = newClient(w);
    const { fileId } = newFile(w, clientId, travellerIds);
    addFlight(w, fileId, travellerIds);
    expect(fileStatus(w.db, fileId, w.now)).toBe("confirmed");
  });

  it("travelled after the last date, closed once the balance is zero", () => {
    const w = createWorld();
    const s = issuedFlightScenario(w);
    expect(fileStatus(w.db, s.fileId, AFTER_TRIP)).toBe("travelled");
    run(w, recordPayment, { clientId: s.clientId, amount: money(152360, "USD"), allocations: [{ fileId: s.fileId, amount: money(152360, "USD") }], method: "cash", accountId: w.acc.crdbUsd }, "neema");
    expect(fileStatus(w.db, s.fileId, AFTER_TRIP)).toBe("closed");
  });

  it("cancelled when cancelledAt is set or no line is active", () => {
    const w = createWorld();
    const { clientId, travellerIds } = newClient(w);
    const a = newFile(w, clientId, travellerIds).fileId;
    const lineId = addFlight(w, a, travellerIds);
    run(w, transitionLine, { lineId, to: "cancelled" }, "neema");
    expect(fileStatus(w.db, a, w.now)).toBe("cancelled");
    const b = newFile(w, clientId, travellerIds).fileId;
    run(w, cancelBookingFile, { fileId: b }, "neema");
    expect(fileStatus(w.db, b, w.now)).toBe("cancelled");
  });

  it("derives travel dates from active lines", () => {
    const w = createWorld();
    const s = issuedFlightScenario(w);
    expect(travelDates(w.db, s.fileId)).toEqual({ start: "2026-10-12", end: "2026-10-26" });
  });
});

describe("payment status (§7.3)", () => {
  const t = (charges: number, received: number) => ({ charges: usd(charges), received: usd(received) });
  it("maps charges and received to a chip", () => {
    expect(paymentStatus(t(0, 0))).toBe("none");
    expect(paymentStatus(t(100, 0))).toBe("unpaid");
    expect(paymentStatus(t(100, 40))).toBe("partial");
    expect(paymentStatus(t(100, 100))).toBe("paid");
    expect(paymentStatus(t(100, 120))).toBe("credit");
    expect(paymentStatus(t(0, 50))).toBe("credit"); // voided after payment
  });
});

describe("due date and overdue", () => {
  it("individual: earlier of the ticketing time limit and the first travel date", () => {
    const w = createWorld();
    const { clientId, travellerIds } = newClient(w);
    const { fileId } = newFile(w, clientId, travellerIds);
    const lineId = addFlight(w, fileId, travellerIds);
    expect(fileDueAt(w.db, fileId)).toBe("2026-10-12");
    run(w, updateServiceLine, { lineId, patch: { details: { ticketingTimeLimit: "2026-10-05T20:59:00.000Z" } } }, "neema");
    expect(fileDueAt(w.db, fileId)).toBe("2026-10-05");
    expect(isOverdue(w.db, fileId, new Date("2026-10-06T08:00:00Z"))).toBe(true);
    expect(isOverdue(w.db, fileId, new Date("2026-10-05T08:00:00Z"))).toBe(false);
  });

  it("corporate: invoice date + payment terms", () => {
    const w = createWorld();
    const { clientId, travellerIds } = newClient(w, { type: "corporate", paymentTermsDays: 30 });
    const { fileId } = newFile(w, clientId, travellerIds);
    addFlight(w, fileId, travellerIds);
    run(w, issueInvoice, { fileId }, "neema");
    expect(fileDueAt(w.db, fileId)).toBe("2026-10-28");
    expect(Object.values(w.db.invoices)[0].dueAt).toBe("2026-10-28");
  });
});
