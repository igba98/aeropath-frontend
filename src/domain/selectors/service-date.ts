import type { ISODate, ServiceLine } from "../types";
import { toDarDate, toDarLocal } from "../dates";

/**
 * Service dates of a line. Flight times are airport-local (as stored); zoned instants (car, transfer) are shown in
 * Dar es Salaam time.
 */

/** Sortable start key: "YYYY-MM-DD" or "YYYY-MM-DDTHH:mm"; undefined when the line has no date. */
export function serviceSortKey(line: ServiceLine): string | undefined {
  switch (line.type) {
    case "flight": {
      const first = [...line.details.segments].sort((a, b) => a.segmentNo - b.segmentNo)[0];
      return first?.departureLocal;
    }
    case "hotel":
      return line.details.checkIn;
    case "car":
      return line.details.pickupAt ? toDarLocal(line.details.pickupAt) : undefined;
    case "transfer":
      return line.details.at ? toDarLocal(line.details.at) : undefined;
    case "tour":
      return line.details.startDate;
    case "insurance":
      return line.details.coverStart;
    case "visa":
      return line.details.submittedAt;
    default:
      return undefined;
  }
}

/** The date a service starts (first departure, check-in, pick-up…), or undefined. */
export function serviceDate(line: ServiceLine): ISODate | undefined {
  return serviceSortKey(line)?.slice(0, 10);
}

/** Every travel date a line covers, used for a file's travel dates (visa, service fee and other have none). */
export function lineTravelDates(line: ServiceLine): ISODate[] {
  switch (line.type) {
    case "flight":
      return line.details.segments.flatMap((s) => [s.departureLocal.slice(0, 10), s.arrivalLocal.slice(0, 10)]).filter(Boolean);
    case "hotel":
      return [line.details.checkIn, line.details.checkOut];
    case "car":
      return [toDarDate(line.details.pickupAt), toDarDate(line.details.dropoffAt)];
    case "transfer":
      return [toDarDate(line.details.at)];
    case "tour":
      return [line.details.startDate, line.details.endDate];
    case "insurance":
      return [line.details.coverStart, line.details.coverEnd];
    default:
      return [];
  }
}

/** Compare for chronological order of service date; lines without a date go last, then by creation. */
export function compareByServiceDate(a: ServiceLine, b: ServiceLine): number {
  const ka = serviceSortKey(a);
  const kb = serviceSortKey(b);
  if (ka && kb && ka !== kb) return ka < kb ? -1 : 1;
  if (ka && !kb) return -1;
  if (!ka && kb) return 1;
  if (a.createdAt !== b.createdAt) return a.createdAt < b.createdAt ? -1 : 1;
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
}
