import { describe, expect, it } from "vitest";
import type { FlightLine } from "../types";
import { canTransition } from "../status/line-machine";
import { NOW } from "./fixtures";
import { hotelLine, simpleLine, validFlight } from "./lines";

const soon = new Date(NOW.getTime() + 3_600_000).toISOString();
const past = new Date(NOW.getTime() - 1000).toISOString();
const flightWith = (status: FlightLine["status"], mutate: (l: FlightLine) => void) => {
  const l = validFlight(status, soon);
  mutate(l);
  return l;
};
const check = (l: Parameters<typeof canTransition>[0], to: Parameters<typeof canTransition>[1]) => canTransition(l, to, { now: NOW });

describe("quoted → booked guard", () => {
  it("flight needs a 6-character record locator", () => {
    const r = check(flightWith("quoted", (l) => (l.details.recordLocator = "")), "booked");
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.message).toMatch(/record locator/);
    expect(check(flightWith("quoted", (l) => (l.details.recordLocator = "ABC12")), "booked").ok).toBe(false);
  });
  it("flight needs at least one HK, KK or TK segment", () => {
    const r = check(flightWith("quoted", (l) => l.details.segments.forEach((s) => (s.statusCode = "HL"))), "booked");
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.message).toMatch(/HK, KK or TK/);
    for (const code of ["HK", "KK", "TK"] as const) {
      expect(check(flightWith("quoted", (l) => (l.details.segments[0].statusCode = code)), "booked").ok).toBe(true);
    }
  });
  it("other types are always allowed (confirmation number optional)", () => {
    expect(check(hotelLine("quoted"), "booked").ok).toBe(true);
    for (const t of ["car", "transfer", "tour", "visa", "insurance", "service_fee", "other"] as const) {
      expect(check(simpleLine(t, "quoted"), "booked").ok).toBe(true);
    }
  });
});

describe("booked → issued guard", () => {
  it("flight needs a valid ticket number for every passenger", () => {
    const missing = check(flightWith("booked", (l) => delete l.details.passengers[0].ticketNumber), "issued");
    expect(missing.ok).toBe(false);
    if (!missing.ok) expect(missing.error.message).toMatch(/ticket number/);
    expect(check(flightWith("booked", (l) => (l.details.passengers[0].ticketNumber = "176-12345")), "issued").ok).toBe(false);
    expect(check(flightWith("booked", (l) => (l.details.passengers[0].ticketNumber = "1762401234567")), "issued").ok).toBe(true);
  });
  it("flight needs passengers, a validating carrier and a fare above zero", () => {
    expect(check(flightWith("booked", (l) => (l.details.passengers = [])), "issued").ok).toBe(false);
    expect(check(flightWith("booked", (l) => (l.details.validatingCarrier = "")), "issued").ok).toBe(false);
    expect(check(flightWith("booked", (l) => (l.details.fare.totalFare = { amountMinor: 0, currency: "USD" })), "issued").ok).toBe(false);
  });
  it("hotel, car, transfer and tour need a confirmation number", () => {
    expect(check(hotelLine("booked"), "issued").ok).toBe(false);
    expect(check(hotelLine("booked", "SER-123"), "issued").ok).toBe(true);
    for (const t of ["car", "transfer", "tour"] as const) {
      const r = check(simpleLine(t, "booked"), "issued");
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.error.message).toMatch(/confirmation number/);
    }
  });
  it("visa, insurance, service fee and other issue without extra data", () => {
    for (const t of ["visa", "insurance", "service_fee", "other"] as const) expect(check(simpleLine(t, "booked"), "issued").ok).toBe(true);
  });
});

describe("issued → voided guard", () => {
  it("allowed up to and including the void deadline", () => {
    expect(check(validFlight("issued", NOW.toISOString()), "voided").ok).toBe(true);
  });
  it("rejected after the deadline, with a plain-words reason", () => {
    const r = check(validFlight("issued", past), "voided");
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.message).toMatch(/void window closed/);
  });
  it("rejected when no deadline was recorded, and for non-flights", () => {
    expect(check(validFlight("issued"), "voided").ok).toBe(false);
    expect(check(hotelLine("issued", "X"), "voided").ok).toBe(false);
  });
});
