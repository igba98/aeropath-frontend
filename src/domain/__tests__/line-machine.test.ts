import { describe, expect, it } from "vitest";
import type { LineStatus, ServiceLine } from "../types";
import { canTransition, computeVoidDeadline, LINE_EDGES, nextStatuses } from "../status/line-machine";
import { hotelLine, validFlight } from "./lines";
import { NOW } from "./fixtures";

const ALL: LineStatus[] = ["quoted", "booked", "issued", "completed", "cancelled", "voided", "refund_pending", "refunded", "exchanged"];
const later = new Date(NOW.getTime() + 3_600_000).toISOString();

const allowed = (from: LineStatus, to: LineStatus, flight: boolean) => LINE_EDGES.some((e) => e.from.includes(from) && e.to === to && (!e.flightOnly || flight));

describe("line machine: every transition by graph (guards satisfied)", () => {
  for (const flight of [true, false]) {
    for (const from of ALL) {
      for (const to of ALL) {
        const expected = allowed(from, to, flight);
        it(`${flight ? "flight" : "hotel"} ${from} → ${to} is ${expected ? "allowed" : "rejected"}`, () => {
          const line: ServiceLine = flight ? validFlight(from, later) : hotelLine(from, "CONF-1");
          const r = canTransition(line, to, { now: NOW, previousStatus: from === "refund_pending" ? to : undefined });
          expect(r.ok).toBe(expected);
          if (!r.ok) {
            expect(r.error.code).toBe("ILLEGAL_TRANSITION");
            expect(r.error.message.length).toBeGreaterThan(10);
          }
        });
      }
    }
  }
});

describe("line machine: which command may use which edge", () => {
  it("refund_pending, refunded and exchanged are not reachable through transitionLine", () => {
    expect(canTransition(validFlight("issued", later), "refund_pending", { now: NOW, via: "transitionLine" }).ok).toBe(false);
    expect(canTransition(validFlight("refund_pending", later), "refunded", { now: NOW, via: "transitionLine" }).ok).toBe(false);
    expect(canTransition(validFlight("refund_pending", later), "exchanged", { now: NOW, via: "transitionLine" }).ok).toBe(false);
  });
  it("requestRefund reaches refund_pending; decideRefund reaches refunded/exchanged/previous", () => {
    expect(canTransition(validFlight("issued", later), "refund_pending", { now: NOW, via: "requestRefund" }).ok).toBe(true);
    expect(canTransition(validFlight("completed", later), "refund_pending", { now: NOW, via: "requestRefund" }).ok).toBe(true);
    expect(canTransition(validFlight("refund_pending", later), "refunded", { now: NOW, via: "decideRefund" }).ok).toBe(true);
    expect(canTransition(validFlight("refund_pending", later), "exchanged", { now: NOW, via: "decideRefund" }).ok).toBe(true);
    expect(canTransition(validFlight("refund_pending", later), "issued", { now: NOW, via: "decideRefund", previousStatus: "issued" }).ok).toBe(true);
  });
  it("rejecting a refund restores exactly the previous status", () => {
    const r = canTransition(validFlight("refund_pending", later), "completed", { now: NOW, via: "decideRefund", previousStatus: "issued" });
    expect(r.ok).toBe(false);
  });
  it("voidLine and transitionLine can void; requestRefund cannot book", () => {
    expect(canTransition(validFlight("issued", later), "voided", { now: NOW, via: "voidLine" }).ok).toBe(true);
    expect(canTransition(validFlight("quoted", later), "booked", { now: NOW, via: "requestRefund" }).ok).toBe(false);
  });
  it("lists next statuses for the UI", () => {
    expect(nextStatuses("booked", "flight", "transitionLine").sort()).toEqual(["cancelled", "issued"]);
    expect(nextStatuses("issued", "hotel", "transitionLine")).toEqual(["completed"]);
    expect(nextStatuses("issued", "flight", "transitionLine").sort()).toEqual(["completed", "voided"]);
  });
});

describe("computeVoidDeadline", () => {
  it("same_day ends at 23:59:59 Dar time (UTC+3) of the issue day", () => {
    expect(computeVoidDeadline(new Date("2026-09-28T09:00:00Z"), "same_day")).toBe("2026-09-28T20:59:59.000Z");
    // 22:30 UTC is already 01:30 on the 29th in Dar es Salaam
    expect(computeVoidDeadline(new Date("2026-09-28T22:30:00Z"), "same_day")).toBe("2026-09-29T20:59:59.000Z");
  });
  it("{ hours } adds hours to the issue time", () => {
    expect(computeVoidDeadline("2026-09-28T09:00:00.000Z", { hours: 24 })).toBe("2026-09-29T09:00:00.000Z");
  });
});
