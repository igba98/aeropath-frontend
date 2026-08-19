import { describe, expect, it } from "vitest";
import { canTransition, deriveBookingStatus, holdTtlSeconds, legalEvents, transitions } from "../state-machine";
import type { ItemStatus } from "../types";

describe("booking item state machine", () => {
  it("follows the primary happy path", () => {
    let s: ItemStatus = "draft";
    for (const ev of ["HOLD", "INITIATE_PAYMENT", "PAYMENT_CONFIRMED", "SUPPLIER_REQUESTED", "SUPPLIER_CONFIRMED", "TRAVEL_COMPLETED"] as const) {
      const t = canTransition(s, ev);
      expect(t, `${s} --${ev}`).toBeDefined();
      s = t!.to;
    }
    expect(s).toBe("used");
  });

  it("rejects illegal transitions", () => {
    expect(canTransition("draft", "PAYMENT_CONFIRMED")).toBeUndefined();
    expect(canTransition("confirmed", "HOLD")).toBeUndefined();
    expect(canTransition("used", "CANCEL")).toBeUndefined();
    expect(canTransition("refunded", "REFUND_PROCESSED")).toBeUndefined();
  });

  it("supplier rejection leads to an automatic refund", () => {
    expect(canTransition("awaiting_supplier", "SUPPLIER_REJECTED")?.to).toBe("supplier_rejected");
    expect(canTransition("awaiting_supplier", "SUPPLIER_REJECTED")?.effects).toContain("autoRefund");
    expect(canTransition("supplier_rejected", "REFUND_PROCESSED")?.to).toBe("refunded");
  });

  it("approval flow extends the hold and returns to payment", () => {
    expect(canTransition("held", "SUBMIT_FOR_APPROVAL")?.effects).toContain("extendHold4h");
    expect(canTransition("pending_approval", "APPROVAL_GRANTED")?.to).toBe("pending_payment");
    expect(canTransition("pending_approval", "APPROVAL_REJECTED")?.to).toBe("approval_rejected");
  });

  it("terminal states have no outgoing events except payment retry", () => {
    const terminal: ItemStatus[] = ["expired", "used", "refunded", "approval_rejected"];
    for (const t of terminal) expect(legalEvents(t), t).toHaveLength(0);
    expect(legalEvents("payment_failed")).toEqual(["RETRY_PAYMENT"]);
    expect(new Set(transitions.map((t) => t.from)).size).toBeGreaterThan(8);
  });

  it("applies hold TTLs per vertical", () => {
    expect(holdTtlSeconds("stay")).toBe(900);
    expect(holdTtlSeconds("tour")).toBe(900);
    expect(holdTtlSeconds("flight")).toBe(1200);
    expect(holdTtlSeconds("transfer")).toBe(0);
  });
});

describe("booking status derivation", () => {
  it("all confirmed becomes confirmed", () => expect(deriveBookingStatus(["confirmed", "confirmed"])).toBe("confirmed"));
  it("paid without confirmation becomes processing", () => expect(deriveBookingStatus(["paid", "confirmed"])).toBe("processing"));
  it("one rejected leg with others good becomes partial", () => expect(deriveBookingStatus(["supplier_rejected", "confirmed"])).toBe("partial"));
  it("a refunded rejected leg is still partial", () => expect(deriveBookingStatus(["refunded", "confirmed"])).toBe("partial"));
  it("all cancelled becomes cancelled", () => expect(deriveBookingStatus(["cancelled", "refunded"])).toBe("cancelled"));
  it("held only is still draft", () => expect(deriveBookingStatus(["held"])).toBe("draft"));
  it("pending approval surfaces on the parent", () => expect(deriveBookingStatus(["pending_approval"])).toBe("pending_approval"));
  it("all dead legs become expired", () => expect(deriveBookingStatus(["expired", "payment_failed"])).toBe("expired"));
  it("an empty booking is draft", () => expect(deriveBookingStatus([])).toBe("draft"));
});
