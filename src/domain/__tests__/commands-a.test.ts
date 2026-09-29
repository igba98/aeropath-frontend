import { describe, expect, it } from "vitest";
import { major } from "../money";
import { addServiceLine, cancelBookingFile, createBookingFile, createClient, transitionLine, updateClient, voidLine } from "../commands";
import { runCommand } from "../commands/run";
import { addFlight, flightDetails, issuedFlightScenario, newClient, newFile } from "./builders";
import { attempt, createWorld, ctxFor, errorOf, run } from "./fixtures";

const usd = (n: number) => major(n, "USD");

describe("runCommand and purity", () => {
  it("appends audit events and never mutates the input state", () => {
    const w = createWorld();
    const before = structuredClone(w.db);
    const r = runCommand(w.db, createClient, { type: "individual", name: "Asha", phone: "0712000000", defaultCurrency: "TZS" }, ctxFor(w, "neema"));
    expect(r.ok).toBe(true);
    expect(w.db).toEqual(before);
    if (r.ok) {
      expect(r.state.audit).toHaveLength(1);
      expect(r.state.audit[0]).toMatchObject({ action: "client.created", actorId: "usr_neema", at: w.now.toISOString() });
    }
  });
  it("turns an unexpected exception into an error result", () => {
    const w = createWorld();
    const r = runCommand(w.db, () => { throw new Error("boom"); }, {}, ctxFor(w, "neema"));
    expect(errorOf(r).message).toMatch(/boom/);
  });
});

describe("clients", () => {
  it("normalises the phone and rejects bad ones", () => {
    const w = createWorld();
    const { clientId } = run(w, createClient, { type: "individual", name: "Asha", phone: "0712 000 000", defaultCurrency: "TZS" }, "neema");
    expect(w.db.clients[clientId].phone).toBe("+255712000000");
    expect(errorOf(attempt(w, createClient, { type: "individual", name: "B", phone: "123", defaultCurrency: "TZS" }, "neema")).field).toBe("phone");
  });
  it("credit limit and terms are Manager only", () => {
    const w = createWorld();
    const input = { type: "corporate" as const, name: "Acme", phone: "0712000000", defaultCurrency: "USD" as const, creditLimit: usd(10_000), paymentTermsDays: 30 };
    const e = errorOf(attempt(w, createClient, input, "peter"));
    expect(e).toMatchObject({ code: "FORBIDDEN", message: "Only a Manager can set a credit limit or payment terms." });
    const { clientId } = run(w, createClient, input, "grace");
    // An agent may edit other fields of the same client, but not the credit fields
    expect(attempt(w, updateClient, { clientId, patch: { name: "Acme Ltd", creditLimit: usd(10_000) } }, "neema").ok).toBe(true);
    expect(errorOf(attempt(w, updateClient, { clientId, patch: { creditLimit: usd(20_000) } }, "neema")).code).toBe("FORBIDDEN");
    expect(errorOf(attempt(w, createClient, { ...input, type: "individual" }, "grace")).code).toBe("VALIDATION");
  });
});

describe("the domain enforces permissions, not just the UI", () => {
  it("an Accountant cannot create bookings or add services", () => {
    const w = createWorld();
    const { clientId, travellerIds } = newClient(w);
    const e = errorOf(attempt(w, createBookingFile, { clientId, currency: "USD", source: "walk_in", travellerIds }, "peter"));
    expect(e).toEqual({ code: "FORBIDDEN", message: "Only an Agent or a Manager can create bookings." });
    const { fileId } = newFile(w, clientId, travellerIds);
    expect(errorOf(attempt(w, addServiceLine, { fileId, type: "flight", travellerIds, details: flightDetails(travellerIds), pricing: { currency: "USD", markup: usd(1) } }, "peter")).code).toBe("FORBIDDEN");
  });
  it("an Accountant cannot void; an Agent cannot reassign", () => {
    const w = createWorld();
    const s = issuedFlightScenario(w);
    expect(errorOf(attempt(w, voidLine, { lineId: s.lineId }, "peter")).code).toBe("FORBIDDEN");
    expect(errorOf(attempt(w, createBookingFile, { clientId: s.clientId, currency: "USD", source: "walk_in", travellerIds: [], ownerId: "usr_baraka" }, "neema")).code).toBe("FORBIDDEN");
  });
});

describe("selling below cost", () => {
  const input = (fileId: string, travellerIds: string[]) => ({ fileId, type: "flight" as const, travellerIds, details: flightDetails(travellerIds), pricing: { currency: "USD" as const, markup: usd(-100), serviceFee: usd(10) } });
  it("is blocked for an Agent with a plain-words reason", () => {
    const w = createWorld();
    const { clientId, travellerIds } = newClient(w);
    const { fileId } = newFile(w, clientId, travellerIds);
    const e = errorOf(attempt(w, addServiceLine, input(fileId, travellerIds), "neema"));
    expect(e.code).toBe("BELOW_COST");
    expect(e.message).toMatch(/^Only a Manager can sell below cost, with a reason\./);
  });
  it("needs a reason from the Manager, and records the override", () => {
    const w = createWorld();
    const { clientId, travellerIds } = newClient(w);
    const { fileId } = newFile(w, clientId, travellerIds, "USD", "grace");
    expect(errorOf(attempt(w, addServiceLine, input(fileId, travellerIds), "grace")).field).toBe("overrideReason");
    const { lineId } = run(w, addServiceLine, { ...input(fileId, travellerIds), overrideReason: "Match competitor fare" }, "grace");
    expect(w.db.lines[lineId].pricing.overrideBelowCost).toMatchObject({ by: "usr_grace", reason: "Match competitor fare" });
  });
});

describe("line transitions through commands", () => {
  it("adding a line as booked runs the booked guard", () => {
    const w = createWorld();
    const { clientId, travellerIds } = newClient(w);
    const { fileId } = newFile(w, clientId, travellerIds);
    const r = attempt(w, addServiceLine, { fileId, type: "flight", travellerIds, details: flightDetails(travellerIds, { status: "HL" }), pricing: { currency: "USD", markup: usd(1) }, status: "booked" }, "neema");
    expect(errorOf(r).code).toBe("ILLEGAL_TRANSITION");
  });
  it("void is refused after the void window, and refunds cannot be reached via transitionLine", () => {
    const w = createWorld();
    const s = issuedFlightScenario(w);
    expect(errorOf(attempt(w, voidLine, { lineId: s.lineId }, "neema", new Date("2026-09-29T09:00:00Z"))).message).toMatch(/void window closed/);
    expect(errorOf(attempt(w, transitionLine, { lineId: s.lineId, to: "refund_pending" }, "neema")).code).toBe("ILLEGAL_TRANSITION");
  });
  it("cancelling a booking cancels quoted and booked lines, but not with an issued line", () => {
    const w = createWorld();
    const s = issuedFlightScenario(w);
    expect(errorOf(attempt(w, cancelBookingFile, { fileId: s.fileId }, "neema")).code).toBe("CONFLICT");
    const { fileId } = newFile(w, s.clientId, s.travellerIds);
    const lineId = addFlight(w, fileId, s.travellerIds, { locator: "CAN123" });
    run(w, cancelBookingFile, { fileId, reason: "Client changed plans" }, "neema");
    expect(w.db.lines[lineId].status).toBe("cancelled");
    expect(w.db.files[fileId].cancelledAt).toBe(w.now.toISOString());
  });
});
