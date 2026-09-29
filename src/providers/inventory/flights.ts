/**
 * Flight search for the demo: schedules, fares and bookings generated from the network in ./network.ts.
 * Deterministic: the same search on the same day returns the same flights and prices, so an offer id in the URL
 * can be looked up again. The shape mirrors what a real GDS search returns, so a live adapter can replace it.
 */
import { formatInTimeZone, fromZonedTime } from "date-fns-tz";

import type { Cabin, Currency, FlightDetails, FlightSegment, ISODate, ISODateTime, LocalDateTime, Money, PaxType, Title } from "@/domain/types";
import { airportTz } from "@/store/seed/reference";
import { addDaysIso, diffDaysIso } from "@/providers/util/dates";
import { CARRIERS, CARRIER_BY_CODE, TANZANIA, aircraftFor, connectsViaHub, distanceKm, flies, hash, isDomestic, seeded, type CarrierNet, type Tier } from "./network";

export type CabinChoice = "economy" | "business";

export interface FlightSearch {
  from: string;
  to: string;
  date: ISODate;
  adults: number;
  children: number;
  infants: number;
  cabin: CabinChoice;
}

export interface SearchCtx {
  /** Today in Dar es Salaam; prices rise as departure gets closer. */
  today: ISODate;
  /** TZS per USD (settings), for domestic fares quoted in shillings. */
  fx: number;
}

export interface FlightLeg {
  carrier: string;
  flightNumber: string;
  origin: string;
  destination: string;
  departureLocal: LocalDateTime;
  arrivalLocal: LocalDateTime;
  arrivalDayOffset: 0 | 1 | 2;
  durationMin: number;
  equipment: string;
  km: number;
}

export type FareId = "saver" | "flex" | "business";

export interface FareOption {
  id: FareId;
  name: string;
  cabin: Cabin;
  /** Booking class (RBD). */
  rbd: string;
  fareBasis: string;
  /** Short allowance as stored on the booking: "1PC", "20K". */
  baggage: string;
  baggageLabel: string;
  cabinBag: string;
  changes: string;
  refund: string;
  /** 0 = sold out. */
  seatsLeft: number;
  /** Per adult, minor units of the offer currency. */
  adultBase: number;
  adultTaxes: { code: string; amount: number }[];
}

export interface FlightOffer {
  id: string;
  /** Marketing and validating carrier (one carrier per itinerary). */
  carrier: string;
  legs: FlightLeg[];
  origin: string;
  destination: string;
  departureLocal: LocalDateTime;
  arrivalLocal: LocalDateTime;
  /** Calendar days between departure and arrival, local to local. */
  arrivalDayOffset: number;
  durationMin: number;
  stops: number;
  via: string[];
  layoversMin: number[];
  currency: Currency;
  domestic: boolean;
  fares: FareOption[];
}

export interface FareQuote {
  currency: Currency;
  base: Money;
  taxes: { code: string; amount: Money }[];
  total: Money;
  perAdult: Money;
  /** Per passenger total, in passenger order (adults, children, infants). */
  perPax: { paxType: PaxType; total: Money }[];
}

// ─────────────────────────────── Time helpers ───────────────────────────────

const pad = (n: number) => String(n).padStart(2, "0");
const hhmm = (min: number) => `${pad(Math.floor(min / 60) % 24)}:${pad(min % 60)}`;
const round5 = (n: number) => Math.round(n / 5) * 5;

/** Local wall time at `origin` plus `minutes`, expressed in the local time of `dest`. */
function arriveLocal(depLocal: LocalDateTime, origin: string, dest: string, minutes: number): LocalDateTime {
  const utc = fromZonedTime(`${depLocal}:00`, airportTz(origin));
  return formatInTimeZone(new Date(utc.getTime() + minutes * 60_000), airportTz(dest), "yyyy-MM-dd'T'HH:mm");
}

/** Minutes between two local times at two airports. */
function minutesBetween(aLocal: LocalDateTime, aAirport: string, bLocal: LocalDateTime, bAirport: string): number {
  const a = fromZonedTime(`${aLocal}:00`, airportTz(aAirport)).getTime();
  const b = fromZonedTime(`${bLocal}:00`, airportTz(bAirport)).getTime();
  return Math.round((b - a) / 60_000);
}

const weekday = (iso: ISODate) => new Date(`${iso}T12:00:00Z`).getUTCDay(); // 0 = Sunday

// ─────────────────────────────── Schedules ───────────────────────────────

/** Scheduled departures of one carrier on one nonstop route on a date. Same times every operating day. */
export function legsOn(c: CarrierNet, origin: string, dest: string, date: ISODate): FlightLeg[] {
  if (!flies(c, origin, dest)) return [];
  const pair = [origin, dest].sort().join("");
  const route = seeded(`${c.code}|${origin}|${dest}`);
  const km = distanceKm(origin, dest);
  const { equipment, speed } = aircraftFor(c.code, km);

  // Thin routes do not fly every day.
  const trunk = c.daily[1] > 1 || c.tier === "premium" || km < 900;
  if (!trunk) {
    const days = seeded(`${c.code}|${pair}|days`);
    const skip = new Set([Math.floor(days() * 7), Math.floor(days() * 7)]);
    if (skip.has(weekday(date))) return [];
  }

  const n = c.daily[0] + Math.floor(route() * (c.daily[1] - c.daily[0] + 1));
  const long = km > 2500;
  const first = long ? 60 * (1 + Math.floor(route() * 20)) : 6 * 60 + round5(route() * 150);
  const gap = n > 1 ? Math.max(150, Math.floor((16 * 60) / n)) : 0;
  const duration = round5((km / speed) * 60 + (km < 400 ? 20 : 30));
  const blockBase = c.base + (hash(pair) % 45) * 10;
  const dir = origin < dest ? 0 : 1;

  const legs: FlightLeg[] = [];
  for (let i = 0; i < n; i++) {
    const depMin = (first + i * gap + round5(route() * 40)) % (24 * 60);
    const departureLocal = `${date}T${hhmm(depMin)}`;
    const arrivalLocal = arriveLocal(departureLocal, origin, dest, duration);
    const offset = Math.max(0, Math.min(2, diffDaysIso(arrivalLocal.slice(0, 10), date))) as 0 | 1 | 2;
    legs.push({ carrier: c.code, flightNumber: String(blockBase + i * 2 + dir), origin, destination: dest, departureLocal, arrivalLocal, arrivalDayOffset: offset, durationMin: duration, equipment, km });
  }
  return legs.sort((a, b) => a.departureLocal.localeCompare(b.departureLocal));
}

function offerFrom(c: CarrierNet, legs: FlightLeg[], s: FlightSearch, ctx: SearchCtx): FlightOffer {
  const first = legs[0];
  const last = legs[legs.length - 1];
  const layoversMin = legs.slice(1).map((l, i) => minutesBetween(legs[i].arrivalLocal, legs[i].destination, l.departureLocal, l.origin));
  const durationMin = minutesBetween(first.departureLocal, first.origin, last.arrivalLocal, last.destination);
  const domestic = isDomestic(s.from, s.to);
  const core = {
    id: `${legs.map((l) => `${l.carrier}${l.flightNumber}`).join("-")}_${first.departureLocal.slice(0, 10)}`,
    carrier: c.code,
    legs,
    origin: first.origin,
    destination: last.destination,
    departureLocal: first.departureLocal,
    arrivalLocal: last.arrivalLocal,
    arrivalDayOffset: diffDaysIso(last.arrivalLocal.slice(0, 10), first.departureLocal.slice(0, 10)),
    durationMin,
    stops: legs.length - 1,
    via: legs.slice(0, -1).map((l) => l.destination),
    layoversMin,
    currency: (domestic ? "TZS" : "USD") as Currency,
    domestic,
  };
  return { ...core, fares: faresFor(core, c, s, ctx) };
}

/** Every itinerary for a search, earliest departure first. */
export function searchFlights(s: FlightSearch, ctx: SearchCtx): FlightOffer[] {
  if (!s.from || !s.to || s.from === s.to || !s.date) return [];
  if (diffDaysIso(s.date, ctx.today) < 0) return [];
  const offers: FlightOffer[] = [];
  for (const c of CARRIERS) {
    for (const leg of legsOn(c, s.from, s.to, s.date)) offers.push(offerFrom(c, [leg], s, ctx));
    if (connectsViaHub(c, s.from, s.to)) {
      // Sensible connections only: at least 50/75 minutes, at most 6 hours at home and 10 hours abroad.
      const home = isDomestic(s.from, c.hub) && isDomestic(c.hub, s.to);
      const [minWait, maxWait] = home ? [50, 6 * 60] : [75, 10 * 60];
      const byLastLeg = new Map<string, FlightOffer>();
      for (const a of legsOn(c, s.from, c.hub, s.date)) {
        const arrDate = a.arrivalLocal.slice(0, 10);
        const onward = [...legsOn(c, c.hub, s.to, arrDate), ...legsOn(c, c.hub, s.to, addDaysIso(arrDate, 1))];
        const b = onward.find((o) => {
          const wait = minutesBetween(a.arrivalLocal, c.hub, o.departureLocal, c.hub);
          return wait >= minWait && wait <= maxWait;
        });
        if (!b) continue;
        // Two first flights feeding the same onward flight: keep the one with the shorter wait.
        const key = `${b.flightNumber}|${b.departureLocal}`;
        const offer = offerFrom(c, [a, b], s, ctx);
        const prev = byLastLeg.get(key);
        if (!prev || offer.durationMin < prev.durationMin) byLastLeg.set(key, offer);
      }
      offers.push(...byLastLeg.values());
    }
  }
  const wanted = offers.filter((o) => (s.cabin === "business" ? o.fares.some((f) => f.cabin === "business") : true));
  return wanted.sort((a, b) => a.departureLocal.localeCompare(b.departureLocal) || a.durationMin - b.durationMin);
}

export function findOffer(s: FlightSearch, id: string, ctx: SearchCtx): FlightOffer | undefined {
  return searchFlights(s, ctx).find((o) => o.id === id);
}

// ─────────────────────────────── Fares ───────────────────────────────

const RATE: Record<Tier, { perKm: number; add: number }> = {
  bush: { perKm: 0.36, add: 60 },
  regional: { perKm: 0.15, add: 32 },
  value: { perKm: 0.064, add: 85 },
  full: { perKm: 0.076, add: 115 },
  premium: { perKm: 0.086, add: 150 },
};

const RBD: Record<Tier, { saver: string; flex: string }> = {
  bush: { saver: "Y", flex: "Y" },
  regional: { saver: "L", flex: "Y" },
  value: { saver: "T", flex: "B" },
  full: { saver: "K", flex: "Y" },
  premium: { saver: "Q", flex: "Y" },
};

/** Cheapest fare first in the requested cabin; sold-out fares last. */
function faresFor(o: Omit<FlightOffer, "fares">, c: CarrierNet, s: FlightSearch, ctx: SearchCtx): FareOption[] {
  const r = seeded(`${o.id}|fares`);
  const km = distanceKm(o.origin, o.destination);
  // At home every carrier prices like a regional airline, except the bush operators.
  const tier: Tier = o.domestic ? (c.tier === "bush" ? "bush" : "regional") : c.tier;
  const rate = RATE[tier];

  // Demand: the day, the weekday and how close departure is.
  const lead = diffDaysIso(o.departureLocal.slice(0, 10), ctx.today);
  const wd = weekday(o.departureLocal.slice(0, 10));
  let demand = 0.84 + r() * 0.42;
  if (wd === 5 || wd === 0) demand *= 1.08;
  if (lead < 3) demand *= 1.35;
  else if (lead < 7) demand *= 1.18;
  else if (lead < 14) demand *= 1.07;
  else if (lead > 60) demand *= 0.92;
  const stopsFactor = o.stops ? 0.88 : 1;
  const baseUsd = (rate.add + km * rate.perKm) * demand * stopsFactor * (c.code === "TC" && o.domestic ? 0.92 : 1);

  const toMinor = (usd: number) => (o.currency === "TZS" ? Math.round((usd * ctx.fx) / 1000) * 1000 * 100 : Math.round(usd) * 100);
  const taxes = (mult: number): { code: string; amount: number }[] => {
    if (o.domestic) {
      const t = [{ code: "TZ", amount: 10_000 * 100 }];
      if (tier !== "bush") t.push({ code: "NS", amount: 5_000 * 100 });
      return t;
    }
    const t: { code: string; amount: number }[] = [];
    if (TANZANIA.has(o.origin)) t.push({ code: "TZ", amount: 49 * 100 });
    t.push({ code: "YQ", amount: Math.round((40 + km * 0.012) * mult) * 100 });
    t.push({ code: "XT", amount: (25 + o.stops * 15) * 100 });
    return t;
  };

  const bush = tier === "bush";
  const bag = (kind: FareId) =>
    bush
      ? { baggage: "15K", baggageLabel: "15 kg in a soft bag", cabinBag: "Small handbag" }
      : o.domestic
        ? kind === "saver"
          ? { baggage: "20K", baggageLabel: "1 bag, 20 kg", cabinBag: "7 kg cabin bag" }
          : { baggage: "30K", baggageLabel: "1 bag, 30 kg", cabinBag: "7 kg cabin bag" }
        : kind === "business"
          ? { baggage: "2PC", baggageLabel: "2 bags, 32 kg each", cabinBag: "2 cabin bags" }
          : kind === "flex"
            ? { baggage: "2PC", baggageLabel: "2 bags, 23 kg each", cabinBag: "7 kg cabin bag" }
            : { baggage: "1PC", baggageLabel: "1 bag, 23 kg", cabinBag: "7 kg cabin bag" };
  const changeFee = o.currency === "TZS" ? "TZS 50,000" : "USD 100";
  const season = o.domestic ? "OW" : "LOW";
  const fares: FareOption[] = [];

  if (bush) {
    fares.push({
      id: "flex",
      name: "Standard",
      cabin: "economy",
      rbd: "Y",
      fareBasis: `Y${season}${o.carrier}`,
      ...bag("flex"),
      changes: `Change for ${changeFee}`,
      refund: "Refundable up to 48 hours before departure",
      seatsLeft: 1 + Math.floor(r() * 9),
      adultBase: toMinor(baseUsd * 1.1),
      adultTaxes: taxes(1),
    });
  } else {
    const saverSeats = Math.floor(r() * 10);
    fares.push({
      id: "saver",
      name: "Economy Saver",
      cabin: "economy",
      rbd: RBD[tier].saver,
      fareBasis: `${RBD[tier].saver}${season}${o.carrier}`,
      ...bag("saver"),
      changes: `Change for ${changeFee} plus any fare difference`,
      refund: "Not refundable; unused taxes are returned",
      seatsLeft: saverSeats,
      adultBase: toMinor(baseUsd),
      adultTaxes: taxes(1),
    });
    fares.push({
      id: "flex",
      name: "Economy Flex",
      cabin: "economy",
      rbd: RBD[tier].flex,
      fareBasis: `${RBD[tier].flex}${season}FX`,
      ...bag("flex"),
      changes: "Free changes; pay only any fare difference",
      refund: `Refundable for ${changeFee}`,
      seatsLeft: 1 + Math.floor(r() * 9),
      adultBase: toMinor(baseUsd * 1.32),
      adultTaxes: taxes(1),
    });
    const businessOnAllLegs = o.legs.every((l) => aircraftFor(l.carrier, l.km).business);
    if (businessOnAllLegs) {
      fares.push({
        id: "business",
        name: "Business",
        cabin: "business",
        rbd: "J",
        fareBasis: `J${season}${o.carrier}`,
        ...bag("business"),
        changes: "Free changes",
        refund: "Fully refundable",
        seatsLeft: 1 + Math.floor(r() * 6),
        adultBase: toMinor(baseUsd * 3.1),
        adultTaxes: taxes(1.4),
      });
    }
  }
  void s;
  return fares;
}

/** The fare to show first for a search: cheapest available in the requested cabin. */
export function leadFare(o: FlightOffer, cabin: CabinChoice): FareOption | undefined {
  const inCabin = o.fares.filter((f) => (cabin === "business" ? f.cabin === "business" : f.cabin !== "business") && f.seatsLeft > 0);
  return inCabin.sort((a, b) => adultTotal(a) - adultTotal(b))[0];
}

export const adultTotal = (f: FareOption) => f.adultBase + f.adultTaxes.reduce((s, t) => s + t.amount, 0);

/** Total price of a fare for the whole party: children pay 75% of the base fare, infants on a lap 10% and no taxes. */
export function quoteFare(o: FlightOffer, f: FareOption, pax: { adults: number; children: number; infants: number }): FareQuote {
  const cur = o.currency;
  const m = (n: number): Money => ({ amountMinor: Math.round(n), currency: cur });
  const childBase = Math.round((f.adultBase * 0.75) / 100) * 100;
  const infantBase = Math.round((f.adultBase * 0.1) / 100) * 100;
  const taxTotals = new Map<string, number>();
  for (const t of f.adultTaxes) taxTotals.set(t.code, t.amount * (pax.adults + pax.children));
  const taxPer = f.adultTaxes.reduce((s, t) => s + t.amount, 0);
  const base = f.adultBase * pax.adults + childBase * pax.children + infantBase * pax.infants;
  const taxSum = taxPer * (pax.adults + pax.children);
  const perPax: FareQuote["perPax"] = [
    ...Array.from({ length: pax.adults }, () => ({ paxType: "ADT" as const, total: m(f.adultBase + taxPer) })),
    ...Array.from({ length: pax.children }, () => ({ paxType: "CHD" as const, total: m(childBase + taxPer) })),
    ...Array.from({ length: pax.infants }, () => ({ paxType: "INF" as const, total: m(infantBase) })),
  ];
  return {
    currency: cur,
    base: m(base),
    taxes: [...taxTotals].map(([code, amount]) => ({ code, amount: m(amount) })),
    total: m(base + taxSum),
    perAdult: m(f.adultBase + taxPer),
    perPax,
  };
}

// ─────────────────────────────── Booking ───────────────────────────────

const LOCATOR_CHARS = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

export function newRecordLocator(random: () => number = Math.random): string {
  let s = "";
  for (let i = 0; i < 6; i++) s += LOCATOR_CHARS[Math.floor(random() * LOCATOR_CHARS.length)];
  return s;
}

export interface BookingPassenger {
  travellerId: string;
  title: Title;
  givenName: string;
  surname: string;
  paxType: PaxType;
}

/**
 * Hold seats on one or more offers booked together (same carrier): a confirmed reservation (HK segments)
 * with a record locator and a ticketing time limit, ready to be priced and issued like any flight in the system.
 */
export function holdSeats(args: {
  parts: { offer: FlightOffer; fare: FareOption }[];
  passengers: BookingPassenger[];
  now: Date;
  officeId?: string;
  random?: () => number;
}): FlightDetails {
  const { parts, passengers, now } = args;
  const pax = {
    adults: passengers.filter((p) => p.paxType === "ADT").length,
    children: passengers.filter((p) => p.paxType === "CHD").length,
    infants: passengers.filter((p) => p.paxType === "INF").length,
  };
  const seats = pax.adults + pax.children;
  const quotes = parts.map((p) => quoteFare(p.offer, p.fare, pax));
  const cur = quotes[0].currency;
  const sum = (pick: (q: FareQuote) => number) => quotes.reduce((s, q) => s + pick(q), 0);
  const taxMap = new Map<string, number>();
  for (const q of quotes) for (const t of q.taxes) taxMap.set(t.code, (taxMap.get(t.code) ?? 0) + t.amount.amountMinor);

  const segments: FlightSegment[] = parts.flatMap((p) =>
    p.offer.legs.map((l) => ({
      segmentNo: 0,
      carrier: l.carrier,
      flightNumber: l.flightNumber,
      bookingClass: p.fare.rbd,
      cabin: p.fare.cabin,
      origin: l.origin,
      destination: l.destination,
      departureLocal: l.departureLocal,
      arrivalLocal: l.arrivalLocal,
      arrivalDayOffset: l.arrivalDayOffset,
      statusCode: "HK" as const,
      seats,
      equipment: l.equipment,
    })),
  );
  segments.forEach((s, i) => (s.segmentNo = passengers.length + 1 + i));

  // Hold for 3 days abroad, 1 day at home, and never past 24 hours before departure.
  const firstDepUtc = fromZonedTime(`${parts[0].offer.departureLocal}:00`, airportTz(parts[0].offer.origin)).getTime();
  const holdMs = (parts[0].offer.domestic ? 24 : 72) * 3_600_000;
  const limit = Math.max(now.getTime() + 2 * 3_600_000, Math.min(now.getTime() + holdMs, firstDepUtc - 24 * 3_600_000));
  const ticketingTimeLimit: ISODateTime = new Date(limit).toISOString();

  const perPaxTotals = passengers.map((_, i) => quotes.reduce((s, q) => s + (q.perPax[i]?.total.amountMinor ?? 0), 0));

  return {
    recordLocator: newRecordLocator(args.random),
    officeId: args.officeId,
    validatingCarrier: parts[0].offer.carrier,
    tripType: parts.length > 1 ? (parts[1].offer.destination === parts[0].offer.origin ? "return" : "multi_city") : "one_way",
    segments,
    passengers: passengers.map((p, i) => ({
      travellerId: p.travellerId,
      nameInPnr: `${p.surname.toUpperCase()}/${p.givenName.toUpperCase()} ${p.title}`,
      paxType: p.paxType,
      pnrPaxNo: i + 1,
      emdNumbers: [],
      fareAmount: { amountMinor: perPaxTotals[i], currency: cur },
    })),
    fare: {
      currency: cur,
      baseFare: { amountMinor: sum((q) => q.base.amountMinor), currency: cur },
      taxes: [...taxMap].map(([code, amount]) => ({ code, amount: { amountMinor: amount, currency: cur } })),
      totalFare: { amountMinor: sum((q) => q.total.amountMinor), currency: cur },
      commissionPct: 0,
      fareBasis: parts.map((p) => p.fare.fareBasis).join("/"),
    },
    baggage: parts[0].fare.baggage,
    ticketingTimeLimit,
  };
}

/** E-ticket numbers for a hold made through search: the airline's 3-digit code, then 10 digits, one per passenger. */
export function ticketNumbers(prefix: string, count: number, random: () => number = Math.random): string[] {
  return Array.from({ length: count }, () => `${prefix}-${Array.from({ length: 10 }, () => Math.floor(random() * 10)).join("")}`);
}

/** Airline code → carrier network entry (for the UI). */
export const carrierNet = (code: string) => CARRIER_BY_CODE[code];
