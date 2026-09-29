import { describe, expect, it } from "vitest";
import type { ID } from "../../types";
import { major } from "../../money";
import { addServiceLine, decideRefund, issueInvoice, recordPayment, requestRefund, updateClient, voidLine } from "../../commands";
import { createWorld, NOW, run, type UserKey, type World } from "../../__tests__/fixtures";
import { addFlight, flightDetails, issueFlight, issuedFlightScenario, newClient, newFile } from "../../__tests__/builders";
import { attentionItems, type AttentionItem, type AttentionKind } from "../attention";

const usd = (n: number) => major(n, "USD");
const HOUR = 3_600_000;
const at = (hours: number) => new Date(NOW.getTime() + hours * HOUR);

const itemsFor = (w: World, who: UserKey, now: Date = NOW) => attentionItems(w.db, w.users[who], now);
const kinds = (w: World, who: UserKey, now?: Date) => itemsFor(w, who, now).map((i) => i.kind);
const find = (w: World, who: UserKey, kind: AttentionKind, now?: Date): AttentionItem | undefined => itemsFor(w, who, now).find((i) => i.kind === kind);

function pay(w: World, clientId: ID, fileId: ID, amount: number, who: UserKey = "neema") {
  return run(w, recordPayment, { clientId, amount: usd(amount), allocations: [{ fileId, amount: usd(amount) }], method: "bank_transfer", accountId: w.acc.crdbUsd, reference: "TT-9" }, who);
}

/** A booked flight whose ticketing time limit is `hours` from NOW. */
function bookedWithTtl(w: World, hours: number) {
  const { clientId, travellerIds } = newClient(w);
  const { fileId } = newFile(w, clientId, travellerIds);
  const details = { ...flightDetails(travellerIds), ticketingTimeLimit: at(hours).toISOString() };
  const { lineId } = run(w, addServiceLine, { fileId, type: "flight", travellerIds, details, pricing: { currency: "USD", markup: usd(50), serviceFee: usd(20) }, status: "booked" }, "neema");
  return { clientId, fileId, lineId };
}

describe("attention: ticketing time limit", () => {
  it("shows a booked flight's TTL within 48 h to the owner and the Manager only", () => {
    const w = createWorld();
    const { fileId, lineId } = bookedWithTtl(w, 20);
    const item = find(w, "neema", "ttl")!;
    expect(item.severity).toBe("red");
    expect(item.sentence).toMatch(/^Ticket EK 726 for Peter Test must be issued by 29 Sep, 08:00\.$/);
    expect(item.action).toEqual({ label: "Issue tickets", href: `/bookings/${fileId}?action=issue&line=${lineId}` });
    expect(kinds(w, "grace")).toContain("ttl");
    expect(kinds(w, "baraka")).not.toContain("ttl");
    expect(kinds(w, "peter")).not.toContain("ttl");
  });

  it("ignores time limits more than 48 h away and warns amber between 24 and 48 h", () => {
    const w = createWorld();
    bookedWithTtl(w, 60);
    expect(kinds(w, "neema")).not.toContain("ttl");
    expect(find(w, "neema", "ttl", at(20))?.severity).toBe("amber"); // 40 h left
  });
});

describe("attention: departing unpaid", () => {
  it("shows files departing within 7 days with a balance to the owner, Accountant and Manager", () => {
    const w = createWorld();
    const s = issuedFlightScenario(w); // departs 12 Oct
    pay(w, s.clientId, s.fileId, 500);
    const soon = new Date("2026-10-08T09:00:00Z");
    const item = find(w, "neema", "departing_unpaid", soon)!;
    expect(item.sentence).toContain("departs on 12 Oct with USD 1,023.60 still unpaid");
    expect(item.action.href).toBe(`/bookings/${s.fileId}?action=payment`);
    expect(kinds(w, "peter", soon)).toContain("departing_unpaid");
    expect(kinds(w, "grace", soon)).toContain("departing_unpaid");
    expect(kinds(w, "baraka", soon)).not.toContain("departing_unpaid");
    expect(kinds(w, "neema", NOW)).not.toContain("departing_unpaid"); // 14 days away
  });
});

describe("attention: stale quote", () => {
  it("prompts the owner about a draft quote older than 3 days", () => {
    const w = createWorld();
    const { clientId, travellerIds } = newClient(w);
    const { fileId } = newFile(w, clientId, travellerIds);
    addFlight(w, fileId, travellerIds, { booked: false });
    expect(kinds(w, "neema", at(48))).not.toContain("stale_quote");
    const item = find(w, "neema", "stale_quote", at(100))!;
    expect(item.severity).toBe("info");
    expect(item.action.href).toBe(`/bookings/${fileId}`);
    expect(kinds(w, "grace", at(100))).not.toContain("stale_quote");
  });
});

describe("attention: finance items", () => {
  it("asks finance to verify payments recorded more than 24 h ago", () => {
    const w = createWorld();
    const s = issuedFlightScenario(w);
    const { paymentId } = pay(w, s.clientId, s.fileId, 100);
    expect(kinds(w, "peter", at(20))).not.toContain("unverified_payment");
    const item = find(w, "peter", "unverified_payment", at(30))!;
    expect(item.action).toEqual({ label: "Verify", href: `/payments?tab=unverified&open=${paymentId}` });
    expect(kinds(w, "neema", at(30))).not.toContain("unverified_payment");
  });

  it("splits refund decisions by the approval limit", () => {
    const w = createWorld();
    const small = issuedFlightScenario(w);
    const big = issuedFlightScenario(w);
    const r1 = run(w, requestRefund, { lineId: small.lineId, kind: "refund", reason: "Changed plans", supplierPenalty: usd(1400) }, "neema");
    const r2 = run(w, requestRefund, { lineId: big.lineId, kind: "refund", reason: "Changed plans", supplierPenalty: usd(100) }, "neema");
    const accountant = itemsFor(w, "peter").filter((i) => i.kind === "refund_decision").map((i) => i.refundId);
    const manager = itemsFor(w, "grace").filter((i) => i.kind === "refund_decision").map((i) => i.refundId);
    expect(accountant).toEqual([r1.refundId]);
    expect(manager.sort()).toEqual([r1.refundId, r2.refundId].sort());
    expect(itemsFor(w, "grace").find((i) => i.refundId === r2.refundId)!.sentence).toContain("needs a Manager's decision");
    expect(kinds(w, "neema")).not.toContain("refund_decision");
  });

  it("asks finance to pay out approved refunds (and does not double up as a client credit)", () => {
    const w = createWorld();
    const s = issuedFlightScenario(w);
    pay(w, s.clientId, s.fileId, 1523.6);
    const { refundId } = run(w, requestRefund, { lineId: s.lineId, kind: "refund", reason: "Visa refused", supplierPenalty: usd(100) }, "neema");
    run(w, decideRefund, { refundId, decision: "approve" }, "grace");
    const item = find(w, "peter", "refund_payout")!;
    expect(item.action).toEqual({ label: "Pay out", href: `/payments?tab=refunds&open=${refundId}` });
    expect(kinds(w, "peter")).not.toContain("client_credit");
    expect(kinds(w, "neema")).not.toContain("refund_payout");
  });

  it("flags suppliers unpaid past their terms", () => {
    const w = createWorld();
    issuedFlightScenario(w);
    expect(kinds(w, "peter", at(24 * 20))).not.toContain("supplier_overdue");
    const item = find(w, "peter", "supplier_overdue", at(24 * 31))!;
    expect(item.severity).toBe("red");
    expect(item.sentence).toContain("Air Consolidator is owed USD 1,450.00 past its 30-day terms");
    expect(item.action).toEqual({ label: "Pay supplier", href: `/money-out/suppliers/${w.sup.consolidator}` });
    expect(kinds(w, "neema", at(24 * 31))).not.toContain("supplier_overdue");
  });

  it("flags corporates over their credit limit", () => {
    const w = createWorld();
    const { clientId, travellerIds } = newClient(w, { type: "corporate" });
    run(w, updateClient, { clientId, patch: { creditLimit: usd(1000) } }, "grace");
    const { fileId } = newFile(w, clientId, travellerIds);
    issueFlight(w, addFlight(w, fileId, travellerIds));
    const item = find(w, "peter", "credit_limit")!;
    expect(item.clientId).toBe(clientId);
    expect(item.sentence).toContain("USD 1,523.60 used of USD 1,000.00");
    expect(kinds(w, "grace")).toContain("credit_limit");
    expect(kinds(w, "neema")).not.toContain("credit_limit");
  });
});

describe("attention: owner information", () => {
  it("tells the owner when the void window of an issued ticket is open", () => {
    const w = createWorld();
    issuedFlightScenario(w);
    const item = find(w, "neema", "void_window")!;
    expect(item.severity).toBe("info");
    expect(item.sentence).toContain("Void closes at 23:59 today");
    expect(kinds(w, "neema", at(24))).not.toContain("void_window");
    expect(kinds(w, "baraka")).not.toContain("void_window");
  });

  it("flags an invoice that no longer matches the booking", () => {
    const w = createWorld();
    const s = issuedFlightScenario(w);
    run(w, issueInvoice, { fileId: s.fileId }, "neema");
    expect(kinds(w, "neema")).not.toContain("invoice_outdated");
    addFlight(w, s.fileId, s.travellerIds, { locator: "ABC123" });
    const item = find(w, "neema", "invoice_outdated")!;
    expect(item.action).toEqual({ label: "Issue invoice", href: `/bookings/${s.fileId}?action=invoice` });
    expect(kinds(w, "baraka")).not.toContain("invoice_outdated");
  });

  it("prompts to refund or keep a client credit after a void (Flow B)", () => {
    const w = createWorld();
    const s = issuedFlightScenario(w);
    pay(w, s.clientId, s.fileId, 1523.6);
    run(w, voidLine, { lineId: s.lineId }, "neema");
    const item = find(w, "neema", "client_credit")!;
    expect(item.sentence).toContain("has a credit of USD 1,523.60");
    expect(item.sentence).toContain("Refund the client or keep it as credit.");
    expect(kinds(w, "peter")).toContain("client_credit");
    expect(kinds(w, "grace")).toContain("client_credit");
    expect(kinds(w, "baraka")).not.toContain("client_credit");
  });
});

describe("attention: order", () => {
  it("sorts red before amber before info, then by due date", () => {
    const w = createWorld();
    bookedWithTtl(w, 30); // amber
    bookedWithTtl(w, 10); // red
    issuedFlightScenario(w); // void window info
    const list = itemsFor(w, "neema");
    expect(list.map((i) => i.severity)).toEqual(["red", "amber", "info"]);
    expect(new Set(list.map((i) => i.id)).size).toBe(list.length);
  });
});
