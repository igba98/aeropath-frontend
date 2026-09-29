import type { FlightDetails, LineDetailsByType, LineType, Traveller } from "./types";
import { diffDaysISO, shortDate, toDarLocal } from "./dates";

/**
 * Human one-line summaries and traveller names. Plain words, as staff read them on cards and documents.
 */

/** "MR PETER MWAKALINGA" */
export const travellerDisplayName = (t: Pick<Traveller, "title" | "givenName" | "surname">): string => `${t.title} ${t.givenName} ${t.surname}`;

/** Amadeus-style "MWAKALINGA/PETER MR" */
export const nameInPnrFor = (t: Pick<Traveller, "title" | "givenName" | "surname">): string => `${t.surname}/${t.givenName} ${t.title}`;

export function describeFlight(d: Pick<FlightDetails, "segments" | "recordLocator">): string {
  if (!d.segments.length) return d.recordLocator ? `Flight ${d.recordLocator}` : "Flight (no segments yet)";
  return [...d.segments]
    .sort((a, b) => a.segmentNo - b.segmentNo)
    .map((s) => `${s.carrier} ${s.flightNumber} ${s.origin}→${s.destination} ${shortDate(s.departureLocal)}`)
    .join(" · ");
}

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;

/** Auto-generated description for a service line (spec §6.2 `description`). */
export function describeLine<T extends LineType>(type: T, details: LineDetailsByType[T]): string {
  switch (type) {
    case "flight":
      return describeFlight(details as FlightDetails);
    case "hotel": {
      const d = details as LineDetailsByType["hotel"];
      const nights = Math.max(0, diffDaysISO(d.checkIn, d.checkOut));
      return `${d.hotelName}, ${d.city} · ${plural(nights, "night")}`;
    }
    case "car": {
      const d = details as LineDetailsByType["car"];
      const driver = d.withDriver ? " with driver" : "";
      return `${d.company} ${d.carClass}${driver} · ${d.pickupLocation} ${shortDate(toDarLocal(d.pickupAt))}–${shortDate(toDarLocal(d.dropoffAt))}`;
    }
    case "transfer": {
      const d = details as LineDetailsByType["transfer"];
      const local = toDarLocal(d.at);
      return `Transfer ${d.from} → ${d.to} · ${shortDate(local)} ${local.slice(11, 16)} · ${d.pax} pax`;
    }
    case "tour": {
      const d = details as LineDetailsByType["tour"];
      const dates = d.startDate === d.endDate ? shortDate(d.startDate) : `${shortDate(d.startDate)}–${shortDate(d.endDate)}`;
      return `${d.name} · ${dates} · ${d.pax} pax`;
    }
    case "visa": {
      const d = details as LineDetailsByType["visa"];
      return `${d.country} visa · ${d.visaType}`;
    }
    case "insurance": {
      const d = details as LineDetailsByType["insurance"];
      return `${d.provider} ${d.plan} · ${shortDate(d.coverStart)}–${shortDate(d.coverEnd)}`;
    }
    case "service_fee":
      return `Service fee · ${(details as LineDetailsByType["service_fee"]).reason}`;
    case "other":
      return (details as LineDetailsByType["other"]).label;
    default:
      return "Service";
  }
}

export const LINE_TYPE_LABELS: Record<LineType, string> = {
  flight: "Flight",
  hotel: "Hotel",
  car: "Car hire",
  transfer: "Transfer",
  tour: "Tour",
  visa: "Visa",
  insurance: "Insurance",
  service_fee: "Service fee",
  other: "Other",
};
