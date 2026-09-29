/**
 * PnrSnapshot → draft FlightDetails (spec §11.4 "Mapper"), plus the helpers the Paste PNR / Fetch
 * from Amadeus preview needs: traveller auto-matching, new-traveller drafts and a one-line summary.
 * Pure functions; no store, no React.
 */
import type {
  AirlineRef,
  Cabin,
  Currency,
  FlightDetails,
  FlightPassenger,
  FlightSegment,
  ID,
  LocalDateTime,
  Money,
  PaxType,
  SegmentStatus,
  Title,
  Traveller,
} from "@/domain/types";
import { major, sum, zero } from "@/domain/money";
import { AIRLINES, CABIN_BY_CLASS, airlineByTicketPrefix, cabinForClass } from "@/store/seed/reference";
import type { PnrSnapshot, PnrSnapshotPassenger, PnrSnapshotSegment } from "../types";
import { minutesBetweenLocal } from "../util/dates";

export interface SnapshotToFlightOptions {
  /** pnrPaxNo → travellerId, as confirmed by the agent. Unmapped passengers get travellerId "". */
  travellerMap: Record<number, ID | null | undefined>;
  /** Fare currency when the PNR has no priced FA lines. Defaults to USD. */
  currency?: Currency;
  /** Airline list (Settings → Airlines) used to read the validating carrier from a ticket prefix. */
  airlines?: AirlineRef[];
  /** Editable booking class → cabin map. Defaults to the reference map. */
  cabinMap?: Record<string, Cabin>;
}

/** Segments that are cancelled or refused don't shape the trip. */
const DEAD_STATUSES: readonly SegmentStatus[] = ["HX", "XX", "UN", "UC", "NO"];

/** Ground time above which a stop counts as a stopover (a "gap" in the journey). */
const STOPOVER_MINUTES = 24 * 60;

export function snapshotToFlightDetails(snapshot: PnrSnapshot, opts: SnapshotToFlightOptions): FlightDetails {
  const airlines = opts.airlines ?? AIRLINES;
  const cabinMap = opts.cabinMap ?? CABIN_BY_CLASS;

  const segments: FlightSegment[] = snapshot.segments.map((s) => ({
    ...s,
    cabin: s.cabin ?? cabinForClass(s.bookingClass, cabinMap),
  }));

  // Fare currency: the FA lines' currency (the most common one if mixed), else the caller's, else USD.
  const priced = snapshot.tickets.filter((t) => t.currency && typeof t.amount === "number" && Number.isFinite(t.amount));
  const currency: Currency = mostCommon(priced.map((t) => t.currency as Currency)) ?? opts.currency ?? "USD";

  const passengers: FlightPassenger[] = snapshot.passengers.map((p) => {
    const tickets = snapshot.tickets.filter((t) => t.pnrPaxNo === p.pnrPaxNo);
    const ticket = tickets[0];
    const pricedTicket = tickets.find((t) => t.currency === currency && typeof t.amount === "number" && Number.isFinite(t.amount));
    const fp: FlightPassenger = {
      travellerId: opts.travellerMap[p.pnrPaxNo] ?? "",
      nameInPnr: formatNameInPnr(p),
      paxType: p.paxType,
      pnrPaxNo: p.pnrPaxNo,
      emdNumbers: [],
    };
    if (ticket) fp.ticketNumber = normaliseTicketNumber(ticket.ticketNumber);
    if (pricedTicket) fp.fareAmount = major(pricedTicket.amount as number, currency);
    return fp;
  });

  const perPax = passengers.map((p) => p.fareAmount).filter((m): m is Money => !!m);
  const totalFare = perPax.length ? sum(perPax, currency) : zero(currency);

  const details: FlightDetails = {
    recordLocator: snapshot.recordLocator,
    validatingCarrier: inferValidatingCarrier(snapshot, airlines),
    tripType: inferTripType(snapshot.segments),
    segments,
    passengers,
    fare: {
      currency,
      // FA lines carry the total per passenger only; the base/tax split is unknown, so base = total.
      baseFare: totalFare,
      taxes: [],
      totalFare,
      commissionPct: 0,
    },
  };
  if (snapshot.officeId) details.officeId = snapshot.officeId;
  if (snapshot.ticketingTimeLimit) details.ticketingTimeLimit = snapshot.ticketingTimeLimit;
  return details;
}

// ─────────────────────────────── Inference ───────────────────────────────

export function activeSegments<S extends Pick<FlightSegment, "statusCode">>(segments: S[]): S[] {
  const live = segments.filter((s) => !DEAD_STATUSES.includes(s.statusCode));
  return live.length ? live : segments;
}

/**
 * A "gap" is a break in the journey: the next flight leaves from another airport (surface sector),
 * or more than 24 h after arriving (stopover). More than one gap → multi-city; otherwise the trip
 * is a return when it ends where it started, else one-way. (Multi-city is checked first so a
 * triangle trip DAR → AMS → LHR → DAR is not reported as a return.)
 */
export function inferTripType(segments: PnrSnapshotSegment[]): FlightDetails["tripType"] {
  const live = activeSegments(segments);
  if (live.length === 0) return "one_way";
  let gaps = 0;
  for (let i = 0; i < live.length - 1; i++) {
    const a = live[i];
    const b = live[i + 1];
    if (a.destination !== b.origin || minutesBetweenLocal(a.arrivalLocal, b.departureLocal) > STOPOVER_MINUTES) gaps++;
  }
  if (gaps > 1) return "multi_city";
  return live[0].origin === live[live.length - 1].destination ? "return" : "one_way";
}

/** FA line carrier, else the airline owning the ticket prefix, else the first flown segment's carrier. */
export function inferValidatingCarrier(snapshot: Pick<PnrSnapshot, "tickets" | "segments">, airlines: AirlineRef[] = AIRLINES): string {
  const fromFa = snapshot.tickets.find((t) => t.carrier)?.carrier;
  if (fromFa) return fromFa;
  for (const t of snapshot.tickets) {
    const airline = airlineByTicketPrefix(t.ticketNumber, airlines);
    if (airline) return airline.code;
  }
  return activeSegments(snapshot.segments)[0]?.carrier ?? "";
}

/** "MWAKALINGA/PETER MR" */
export function formatNameInPnr(p: { surname: string; givenName: string; title?: Title }): string {
  const surname = p.surname.trim().toUpperCase();
  const given = p.givenName.trim().toUpperCase();
  return `${surname}${given ? "/" + given : ""}${p.title ? " " + p.title : ""}`;
}

/** "1762401234567" or "176-2401234567" → "176-2401234567"; anything else is returned trimmed. */
export function normaliseTicketNumber(n: string): string {
  const digits = n.replace(/\D/g, "");
  return digits.length === 13 ? `${digits.slice(0, 3)}-${digits.slice(3)}` : n.trim();
}

function mostCommon<T extends string>(values: T[]): T | undefined {
  const counts = new Map<T, number>();
  for (const v of values) counts.set(v, (counts.get(v) ?? 0) + 1);
  let best: T | undefined;
  let bestCount = 0;
  for (const [v, c] of counts) if (c > bestCount) [best, bestCount] = [v, c];
  return best;
}

// ─────────────────────────────── Travellers ───────────────────────────────

/** Uppercase, accents removed, letters only (so "O'Brien" = "OBRIEN" and "Anna-Maria" = "ANNAMARIA"). */
function nameKey(s: string): string {
  return s.normalize("NFD").toUpperCase().replace(/[^A-Z]/g, "");
}

function firstNameKey(s: string): string {
  return nameKey(s.trim().split(/\s+/)[0] ?? "");
}

/**
 * Suggest a traveller for each PNR passenger: surname + given name, case-insensitive, titles ignored.
 * Falls back to surname + first given name when exactly one traveller fits. A traveller is used once.
 * Returns pnrPaxNo → travellerId, or null when the agent must pick or create one.
 */
export function autoMatchTravellers(
  snapshotPassengers: PnrSnapshotPassenger[],
  travellers: Traveller[],
): Record<number, ID | null> {
  const result: Record<number, ID | null> = {};
  const used = new Set<ID>();

  const pick = (p: PnrSnapshotPassenger, candidates: Traveller[]): Traveller | undefined => {
    const free = candidates.filter((t) => !used.has(t.id));
    return free.find((t) => t.paxType === p.paxType) ?? free[0];
  };

  // Pass 1: full given name.
  for (const p of snapshotPassengers) {
    const sKey = nameKey(p.surname);
    const gKey = nameKey(p.givenName);
    const match = sKey && gKey ? pick(p, travellers.filter((t) => nameKey(t.surname) === sKey && nameKey(t.givenName) === gKey)) : undefined;
    result[p.pnrPaxNo] = match?.id ?? null;
    if (match) used.add(match.id);
  }

  // Pass 2: first given name only, when unambiguous ("PETER JOHN" in the PNR vs "PETER" on file).
  for (const p of snapshotPassengers) {
    if (result[p.pnrPaxNo]) continue;
    const sKey = nameKey(p.surname);
    const fKey = firstNameKey(p.givenName);
    if (!sKey || !fKey) continue;
    const candidates = travellers.filter((t) => !used.has(t.id) && nameKey(t.surname) === sKey && firstNameKey(t.givenName) === fKey);
    if (candidates.length === 1) {
      result[p.pnrPaxNo] = candidates[0].id;
      used.add(candidates[0].id);
    }
  }
  return result;
}

export type TravellerDraft = Omit<Traveller, "id">;

const DEFAULT_TITLE: Record<PaxType, Title> = { ADT: "MR", CHD: "MSTR", INF: "MSTR" };
const GENDER_BY_TITLE: Record<Title, "M" | "F"> = { MR: "M", MSTR: "M", MRS: "F", MS: "F", MISS: "F" };

/**
 * A new traveller built from a PNR passenger, for "create as new" in the mapping step.
 * When the PNR has no title a default is used (MR / MSTR) and gender is left blank: the agent confirms.
 */
export function draftTravellerFromPnr(p: PnrSnapshotPassenger, clientId: ID): TravellerDraft {
  const draft: TravellerDraft = {
    clientId,
    title: p.title ?? DEFAULT_TITLE[p.paxType],
    givenName: p.givenName.trim().toUpperCase(),
    surname: p.surname.trim().toUpperCase(),
    paxType: p.paxType,
    frequentFlyer: [],
  };
  if (p.title) draft.gender = GENDER_BY_TITLE[p.title];
  if (p.dateOfBirth) draft.dateOfBirth = p.dateOfBirth;
  return draft;
}

// ─────────────────────────────── Summary ───────────────────────────────

export interface SnapshotSummary {
  /** "DAR → DXB → DAR"; a surface sector is shown as " · " ("DAR → AMS · LHR → DAR"). */
  route: string;
  firstDeparture?: LocalDateTime;
  paxCount: number;
  /** Every adult and child has a ticket number. */
  ticketed: boolean;
}

export function snapshotSummary(snapshot: PnrSnapshot): SnapshotSummary {
  const live = activeSegments(snapshot.segments);
  const legs: string[][] = [];
  live.forEach((s, i) => {
    if (i === 0 || live[i - 1].destination !== s.origin) legs.push([s.origin]);
    legs[legs.length - 1].push(s.destination);
  });

  const needTickets = snapshot.passengers.filter((p) => p.paxType !== "INF");
  const ticketed =
    snapshot.tickets.length > 0 &&
    (needTickets.length === 0 || needTickets.every((p) => snapshot.tickets.some((t) => t.pnrPaxNo === p.pnrPaxNo)));

  return {
    route: legs.map((leg) => leg.join(" → ")).join(" · "),
    firstDeparture: live[0]?.departureLocal,
    paxCount: snapshot.passengers.length,
    ticketed,
  };
}
