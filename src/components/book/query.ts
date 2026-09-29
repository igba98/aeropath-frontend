/**
 * Search and book state lives in the URL: every step can be refreshed, shared and undone with the back button.
 */
import type { ISODate } from "@/domain/types";
import type { CabinChoice } from "@/providers/inventory/flights";
import { addDaysIso, diffDaysIso } from "@/providers/util/dates";
import { findAirport } from "@/store/seed/reference";
import { findDestination } from "@/providers/inventory/hotels";

const isDate = (s: string | null): s is string => !!s && /^\d{4}-\d{2}-\d{2}$/.test(s);
const int = (s: string | null, def: number, min: number, max: number) => {
  const n = Number(s);
  return Number.isFinite(n) && s !== null && s !== "" ? Math.min(max, Math.max(min, Math.round(n))) : def;
};
const later = (d: ISODate | null, today: ISODate, fallback: ISODate): ISODate => (isDate(d) && diffDaysIso(d, today) >= 0 ? d : fallback);

export interface FlightQuery {
  from: string;
  to: string;
  depart: ISODate;
  /** Return date; empty for one way. */
  ret?: ISODate;
  adults: number;
  children: number;
  infants: number;
  cabin: CabinChoice;
  /** Booking for this client (from a client page); carried through every step. */
  client?: string;
}

export function readFlightQuery(sp: URLSearchParams, today: ISODate): FlightQuery {
  const from = (sp.get("from") ?? "DAR").toUpperCase();
  const to = (sp.get("to") ?? "").toUpperCase();
  const depart = later(sp.get("depart"), today, addDaysIso(today, 7));
  const retRaw = sp.get("return");
  const ret = isDate(retRaw) && diffDaysIso(retRaw, depart) >= 0 ? retRaw : undefined;
  const adults = int(sp.get("adults"), 1, 1, 9);
  const children = int(sp.get("children"), 0, 0, 9 - adults);
  const infants = int(sp.get("infants"), 0, 0, adults);
  return { from: findAirport(from) ? from : "DAR", to: findAirport(to) ? to : "", depart, ret, adults, children, infants, cabin: sp.get("cabin") === "business" ? "business" : "economy", client: sp.get("client") ?? undefined };
}

export function flightQs(q: FlightQuery, extra: Record<string, string | undefined | null> = {}): string {
  const p = new URLSearchParams();
  p.set("from", q.from);
  if (q.to) p.set("to", q.to);
  p.set("depart", q.depart);
  if (q.ret) p.set("return", q.ret);
  p.set("adults", String(q.adults));
  if (q.children) p.set("children", String(q.children));
  if (q.infants) p.set("infants", String(q.infants));
  if (q.cabin === "business") p.set("cabin", "business");
  if (q.client) p.set("client", q.client);
  for (const [k, v] of Object.entries(extra)) if (v) p.set(k, v);
  return p.toString();
}

export const paxOf = (q: Pick<FlightQuery, "adults" | "children" | "infants">) => ({ adults: q.adults, children: q.children, infants: q.infants });

export function paxLabel(q: Pick<FlightQuery, "adults" | "children" | "infants">): string {
  const parts = [`${q.adults} adult${q.adults === 1 ? "" : "s"}`];
  if (q.children) parts.push(`${q.children} child${q.children === 1 ? "" : "ren"}`);
  if (q.infants) parts.push(`${q.infants} infant${q.infants === 1 ? "" : "s"}`);
  return parts.join(", ");
}

export interface HotelQuery {
  dest: string;
  checkIn: ISODate;
  checkOut: ISODate;
  adults: number;
  children: number;
  rooms: number;
  client?: string;
}

export function readHotelQuery(sp: URLSearchParams, today: ISODate): HotelQuery {
  const dest = (sp.get("dest") ?? "").toUpperCase();
  const checkIn = later(sp.get("in"), today, addDaysIso(today, 14));
  const outRaw = sp.get("out");
  const checkOut = isDate(outRaw) && diffDaysIso(outRaw, checkIn) >= 1 && diffDaysIso(outRaw, checkIn) <= 30 ? outRaw : addDaysIso(checkIn, 3);
  const rooms = int(sp.get("rooms"), 1, 1, 5);
  const adults = int(sp.get("adults"), 2, rooms, 12);
  const children = int(sp.get("children"), 0, 0, 8);
  return { dest: findDestination(dest) ? dest : "", checkIn, checkOut, adults, children, rooms, client: sp.get("client") ?? undefined };
}

export function hotelQs(q: HotelQuery, extra: Record<string, string | undefined | null> = {}): string {
  const p = new URLSearchParams();
  if (q.dest) p.set("dest", q.dest);
  p.set("in", q.checkIn);
  p.set("out", q.checkOut);
  p.set("adults", String(q.adults));
  if (q.children) p.set("children", String(q.children));
  if (q.rooms > 1) p.set("rooms", String(q.rooms));
  if (q.client) p.set("client", q.client);
  for (const [k, v] of Object.entries(extra)) if (v) p.set(k, v);
  return p.toString();
}

export const nightsBetween = (a: ISODate, b: ISODate) => Math.max(0, diffDaysIso(b, a));

export function guestsLabel(q: Pick<HotelQuery, "adults" | "children" | "rooms">): string {
  const parts = [`${q.adults} adult${q.adults === 1 ? "" : "s"}`];
  if (q.children) parts.push(`${q.children} child${q.children === 1 ? "" : "ren"}`);
  parts.push(`${q.rooms} room${q.rooms === 1 ? "" : "s"}`);
  return parts.join(", ");
}
