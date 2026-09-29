import type { FlightLine, HotelLine, LineStatus, LineType, Pricing, ServiceLine } from "../types";
import { major } from "../money";
import { flightDetails } from "./builders";
import { NOW } from "./fixtures";

/** Plain line objects for pure (non-command) tests. */

const pricing = (): Pricing => ({
  currency: "USD",
  cost: major(1450, "USD"),
  markup: major(50, "USD"),
  serviceFee: major(20, "USD"),
  vat: major(3.6, "USD"),
  sell: major(1523.6, "USD"),
});

const base = (type: LineType, status: LineStatus) => ({
  id: `lin_${type}`,
  fileId: "fil_1",
  type,
  status,
  supplierId: "sup_1",
  travellerIds: ["trv_1"],
  description: type,
  pricing: pricing(),
  source: "manual" as const,
  supplierPaidMinor: 0,
  createdAt: NOW.toISOString(),
  createdBy: "usr_neema",
  updatedAt: NOW.toISOString(),
  statusHistory: [],
});

/** A flight that satisfies every guard (PNR, HK segments, ticket per passenger, validating carrier, fare > 0). */
export function validFlight(status: LineStatus, voidDeadline?: string): FlightLine {
  const details = flightDetails(["trv_1"], { tickets: ["176-2401234567"] });
  if (voidDeadline) details.voidDeadline = voidDeadline;
  return { ...base("flight", status), type: "flight", details };
}

export function hotelLine(status: LineStatus, confirmationNumber?: string): HotelLine {
  return {
    ...base("hotel", status),
    type: "hotel",
    details: { hotelName: "Serena Hotel", city: "Dar es Salaam", checkIn: "2026-10-12", checkOut: "2026-10-15", rooms: [{ roomType: "Double", board: "BB", adults: 2, children: 0 }], confirmationNumber },
  };
}

export function simpleLine(type: Exclude<LineType, "flight" | "hotel">, status: LineStatus): ServiceLine {
  const details = {
    car: { company: "Avis", carClass: "Compact", withDriver: false, pickupLocation: "DAR", pickupAt: "2026-10-12T06:00:00.000Z", dropoffLocation: "DAR", dropoffAt: "2026-10-15T06:00:00.000Z" },
    transfer: { from: "DAR airport", to: "Serena", at: "2026-10-12T13:00:00.000Z", vehicle: "Van", pax: 2 },
    tour: { name: "City tour", startDate: "2026-10-13", endDate: "2026-10-13", pax: 2 },
    visa: { country: "AE", visaType: "Tourist 30 days", decision: "pending" as const },
    insurance: { provider: "Jubilee", plan: "Travel basic", coverStart: "2026-10-12", coverEnd: "2026-10-26" },
    service_fee: { reason: "Visa handling" },
    other: { label: "Airport lounge" },
  }[type];
  return { ...base(type, status), type, details } as ServiceLine;
}
