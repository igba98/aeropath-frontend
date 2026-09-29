import type { Currency, FlightDetails, ID, SegmentStatus } from "../types";
import { major } from "../money";
import { addServiceLine, createBookingFile, createClient, transitionLine, upsertTraveller } from "../commands";
import { run, type UserKey, type World } from "./fixtures";

/** Scenario builders on top of the real commands. */

export interface FlightOpts {
  locator?: string;
  total?: number; // major units, all passengers
  currency?: Currency;
  status?: SegmentStatus;
  commissionPct?: number;
  tickets?: (string | undefined)[];
}

export function flightDetails(travellerIds: ID[], o: FlightOpts = {}): FlightDetails {
  const currency = o.currency ?? "USD";
  const total = major(o.total ?? 1450, currency);
  return {
    recordLocator: o.locator ?? "Z8K4QM",
    validatingCarrier: "EK",
    tripType: "return",
    segments: [
      { segmentNo: 1, carrier: "EK", flightNumber: "726", bookingClass: "Y", cabin: "economy", origin: "DAR", destination: "DXB", departureLocal: "2026-10-12T16:50", arrivalLocal: "2026-10-12T23:05", arrivalDayOffset: 0, statusCode: o.status ?? "HK", seats: travellerIds.length || 1 },
      { segmentNo: 2, carrier: "EK", flightNumber: "725", bookingClass: "Y", cabin: "economy", origin: "DXB", destination: "DAR", departureLocal: "2026-10-26T10:20", arrivalLocal: "2026-10-26T15:00", arrivalDayOffset: 0, statusCode: o.status ?? "HK", seats: travellerIds.length || 1 },
    ],
    passengers: travellerIds.map((id, i) => ({ travellerId: id, nameInPnr: `PAX${String.fromCharCode(65 + i)}/TEST MR`, paxType: "ADT", pnrPaxNo: i + 1, emdNumbers: [], ticketNumber: o.tickets?.[i] })),
    fare: { currency, baseFare: total, taxes: [], totalFare: total, commissionPct: o.commissionPct ?? 0 },
  };
}

let ticketSerial = 2401234560;
/** A fresh valid ticket number per call. */
export const nextTicket = (): string => `176-${ticketSerial++}`;

export function newClient(w: World, opts: { type?: "individual" | "corporate"; travellers?: number; who?: UserKey; paymentTermsDays?: number } = {}) {
  const who = opts.who ?? "neema";
  const corporate = opts.type === "corporate";
  const { clientId } = run(
    w,
    createClient,
    { type: opts.type ?? "individual", name: corporate ? "Acme Ltd" : "Peter Test", phone: "0754123456", defaultCurrency: "USD", ...(corporate && opts.paymentTermsDays !== undefined ? { paymentTermsDays: opts.paymentTermsDays } : {}) },
    corporate && opts.paymentTermsDays !== undefined ? "grace" : who,
  );
  const travellerIds: ID[] = [];
  for (let i = 0; i < (opts.travellers ?? 1); i++) {
    const { travellerId } = run(w, upsertTraveller, { traveller: { clientId, title: "MR", givenName: "Test", surname: `Pax${String.fromCharCode(65 + i)}`, paxType: "ADT" } }, who);
    travellerIds.push(travellerId);
  }
  return { clientId, travellerIds };
}

export function newFile(w: World, clientId: ID, travellerIds: ID[], currency: Currency = "USD", who: UserKey = "neema") {
  return run(w, createBookingFile, { clientId, currency, source: "walk_in", travellerIds }, who);
}

export interface FlightLineOpts extends FlightOpts {
  markup?: number;
  serviceFee?: number;
  booked?: boolean;
  who?: UserKey;
}

export function addFlight(w: World, fileId: ID, travellerIds: ID[], o: FlightLineOpts = {}): ID {
  const currency = o.currency ?? "USD";
  const { lineId } = run(
    w,
    addServiceLine,
    {
      fileId,
      type: "flight",
      travellerIds,
      details: flightDetails(travellerIds, o),
      pricing: { currency, markup: major(o.markup ?? 50, currency), serviceFee: major(o.serviceFee ?? 20, currency) },
      status: o.booked === false ? "quoted" : "booked",
    },
    o.who ?? "neema",
  );
  return lineId;
}

export function issueFlight(w: World, lineId: ID, who: UserKey = "neema", now?: Date): string[] {
  const line = w.db.lines[lineId];
  if (line.type !== "flight") throw new Error("not a flight");
  const tickets = line.details.passengers.map((p) => ({ travellerId: p.travellerId, ticketNumber: p.ticketNumber ?? nextTicket() }));
  run(w, transitionLine, { lineId, to: "issued", tickets }, who, now);
  return tickets.map((t) => t.ticketNumber);
}

/** Client + file + issued USD flight (sell = 1450 + 50 markup + 20 fee + 3.60 VAT = USD 1,523.60). */
export function issuedFlightScenario(w: World, o: FlightLineOpts & { fileCurrency?: Currency; travellers?: number } = {}) {
  const { clientId, travellerIds } = newClient(w, { travellers: o.travellers ?? 1 });
  const { fileId } = newFile(w, clientId, travellerIds, o.fileCurrency ?? "USD");
  const lineId = addFlight(w, fileId, travellerIds, o);
  const tickets = issueFlight(w, lineId);
  return { clientId, travellerIds, fileId, lineId, tickets };
}
