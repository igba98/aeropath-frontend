/**
 * Booking-file builder for the seed: each method schedules real commands on the Seeder timeline.
 * Amounts are given in major units (e.g. 420 = USD 420.00) in the currency of the line.
 */
import type { Board, CarDetails, Currency, FileSource, FlightDetails, FlightSegment, HotelDetails, ID, InsuranceDetails, LineType, TransferDetails, VisaDetails } from "@/domain/types";
import { addServiceLine, createBookingFile, issueInvoice, issueQuote, transitionLine, type AddServiceLineInput, type TransitionLineInput } from "@/domain/commands";
import { inferTripType } from "@/domain/commands/_schemas";
import { major, money } from "@/domain/money";
import { AIRLINES, cabinForClass } from "./reference";
import type { Seeder, StaffKey } from "./seed-kit";

/** One flight segment: day offset from today (negative = past) and local times; `plus` = arrival day offset. */
export interface SegSpec {
  c: string;
  n: string;
  rbd?: string;
  from: string;
  to: string;
  d: number;
  dep: string;
  arr: string;
  plus?: 0 | 1 | 2;
  eq?: string;
}

/** Fare per passenger in major units; multiplied by the number of passengers. */
export interface FareSpec {
  cur: Currency;
  base: number;
  tax: [string, number][];
}

export interface FileSpec {
  key: string;
  client: string;
  owner: StaffKey;
  currency: Currency;
  source: FileSource;
  title: string;
  pax: string[];
  at: Date;
  notes?: string;
  tags?: string[];
}

interface LineMeta {
  type: LineType;
  pax: string[];
  carrier?: string;
}

type Status = "quoted" | "booked";
type LineInput = Omit<AddServiceLineInput, "fileId" | "type" | "travellerIds">;

export function ticketPrefix(carrier: string): string {
  const prefix = AIRLINES.find((a) => a.code === carrier)?.ticketPrefix;
  if (!prefix) throw new Error(`Seed data error: ${carrier} has no ticket prefix, so its tickets cannot be issued`);
  return prefix;
}

export function buildSegments(s: Seeder, segs: SegSpec[], seats: number): FlightSegment[] {
  return segs.map((g, i) => {
    const rbd = g.rbd ?? "Y";
    const plus = g.plus ?? 0;
    const seg: FlightSegment = {
      segmentNo: i + 1,
      carrier: g.c,
      flightNumber: g.n,
      bookingClass: rbd,
      cabin: cabinForClass(rbd),
      origin: g.from,
      destination: g.to,
      departureLocal: s.local(g.d, g.dep),
      arrivalLocal: s.local(g.d + plus, g.arr),
      arrivalDayOffset: plus,
      statusCode: "HK",
      seats,
    };
    if (g.eq) seg.equipment = g.eq;
    return seg;
  });
}

const initials = (name: string) =>
  name
    .split(/\s+/)
    .map((w) => w[0])
    .join("")
    .slice(0, 3)
    .toUpperCase();

export class FileBuilder {
  readonly lines: Record<string, ID> = {};
  readonly payments: Record<string, ID> = {};
  readonly meta: Record<string, LineMeta> = {};
  fileId?: ID;
  refundId?: ID;

  constructor(
    readonly s: Seeder,
    readonly spec: FileSpec,
  ) {
    s.at(spec.at, `${spec.key}: create booking`, () => {
      const r = s.run(`${spec.key}: createBookingFile`, spec.at, spec.owner, createBookingFile, {
        clientId: s.ref(`c:${spec.client}`),
        title: spec.title,
        currency: spec.currency,
        source: spec.source,
        travellerIds: spec.pax.map((p) => s.ref(`t:${p}`)),
        notes: spec.notes,
        tags: spec.tags,
      });
      if (r) this.fileId = r.fileId;
    });
  }

  get id(): ID {
    if (!this.fileId) throw new Error(`Booking ${this.spec.key} was not created (an earlier step failed)`);
    return this.fileId;
  }

  lineId(key: string): ID {
    const id = this.lines[key];
    if (!id) throw new Error(`Line ${this.spec.key}.${key} does not exist (an earlier step failed)`);
    return id;
  }

  step(at: Date, label: string, fn: () => void): this {
    this.s.at(at, `${this.spec.key}: ${label}`, fn);
    return this;
  }

  label(what: string): string {
    return `${this.spec.key}: ${what}`;
  }

  /** `supplier` is a supplier key resolved when the step runs; flights default to the air settlement supplier. */
  private add(key: string, at: Date, type: LineType, input: LineInput, pax: string[], opts: { carrier?: string; supplier?: string } = {}): this {
    this.meta[key] = { type, pax, carrier: opts.carrier };
    return this.step(at, `add ${type} ${key}`, () => {
      const full = { ...input, fileId: this.id, type, travellerIds: pax.map((p) => this.s.ref(`t:${p}`)) } as AddServiceLineInput;
      if (opts.supplier) full.supplierId = this.s.ref(`s:${opts.supplier}`);
      const r = this.s.run(this.label(`addServiceLine ${key}`), at, this.spec.owner, addServiceLine, full);
      if (r) this.lines[key] = r.lineId;
    });
  }

  flight(key: string, at: Date, o: { pax: string[]; segs: SegSpec[]; fare: FareSpec; markup: number; fee?: number; status: Status; ttl?: Date; baggage?: string }): this {
    const n = o.pax.length;
    const cur = o.fare.cur;
    const segments = buildSegments(this.s, o.segs, n);
    const taxes = o.fare.tax.map(([code, amt]) => ({ code, amount: major(amt * n, cur) }));
    const baseFare = major(o.fare.base * n, cur);
    const totalFare = money(baseFare.amountMinor + taxes.reduce((a, t) => a + t.amount.amountMinor, 0), cur);
    const details: FlightDetails = {
      recordLocator: o.status === "booked" ? this.s.locator() : "",
      officeId: "DARTZ2100",
      validatingCarrier: segments[0].carrier,
      tripType: inferTripType(segments),
      segments,
      passengers: [],
      fare: { currency: cur, baseFare, taxes, totalFare, commissionPct: 0 },
      baggage: o.baggage ?? "2PC",
    };
    if (o.ttl) details.ticketingTimeLimit = o.ttl.toISOString();
    const pricing: LineInput["pricing"] = { currency: cur, markup: major(o.markup, cur) };
    if (o.fee !== undefined) pricing.serviceFee = major(o.fee, cur);
    return this.add(key, at, "flight", { details, pricing, status: o.status }, o.pax, { carrier: segments[0].carrier });
  }

  hotel(
    key: string,
    at: Date,
    o: { supplier: string; pax: string[]; name: string; city: string; inD: number; outD: number; rooms: { roomType: string; board: Board; adults: number; children?: number }[]; perNight: number; markup: number; status: Status; fee?: number },
  ): this {
    const cur: Currency = "USD";
    const nights = o.outD - o.inD;
    const details: HotelDetails = {
      hotelName: o.name,
      city: o.city,
      checkIn: this.s.date(o.inD),
      checkOut: this.s.date(o.outD),
      rooms: o.rooms.map((r) => ({ ...r, children: r.children ?? 0 })),
      cancellationPolicy: "Free cancellation up to 7 days before arrival; after that the first night is charged.",
      freeCancelUntil: this.s.local(o.inD - 7, "12:00"),
    };
    if (o.status === "booked") details.confirmationNumber = this.s.code(`${initials(o.name)}-`, 6, "0123456789");
    const pricing: LineInput["pricing"] = { currency: cur, cost: major(o.perNight * nights * o.rooms.length, cur), markup: major(o.markup, cur) };
    if (o.fee !== undefined) pricing.serviceFee = major(o.fee, cur);
    return this.add(key, at, "hotel", { details, pricing, status: o.status }, o.pax, { supplier: o.supplier });
  }

  transfer(key: string, at: Date, o: { supplier: string; pax: string[]; from: string; to: string; when: [number, string]; vehicle: string; cost: number; markup: number; flightRef?: string; status: Status }): this {
    const details: TransferDetails = { from: o.from, to: o.to, at: this.s.local(o.when[0], o.when[1]), vehicle: o.vehicle, pax: o.pax.length };
    if (o.flightRef) details.flightRef = o.flightRef;
    if (o.status === "booked") details.confirmationNumber = this.s.code("UAT-", 5, "0123456789");
    const pricing = { currency: "TZS" as const, cost: major(o.cost, "TZS"), markup: major(o.markup, "TZS") };
    return this.add(key, at, "transfer", { details, pricing, status: o.status }, o.pax, { supplier: o.supplier });
  }

  car(key: string, at: Date, o: { supplier: string; pax: string[]; company: string; carClass: string; withDriver: boolean; pickup: [string, number, string]; dropoff: [string, number, string]; perDay: number; markup: number; status: Status }): this {
    const days = o.dropoff[1] - o.pickup[1];
    const details: CarDetails = {
      company: o.company,
      carClass: o.carClass,
      withDriver: o.withDriver,
      pickupLocation: o.pickup[0],
      pickupAt: this.s.local(o.pickup[1], o.pickup[2]),
      dropoffLocation: o.dropoff[0],
      dropoffAt: this.s.local(o.dropoff[1], o.dropoff[2]),
    };
    if (o.status === "booked") details.confirmationNumber = this.s.code(`${initials(o.company)}-`, 5, "0123456789");
    const pricing = { currency: "TZS" as const, cost: major(o.perDay * Math.max(1, days), "TZS"), markup: major(o.markup, "TZS") };
    return this.add(key, at, "car", { details, pricing, status: o.status }, o.pax, { supplier: o.supplier });
  }

  visa(key: string, at: Date, o: { supplier: string; pax: string[]; country: string; visaType: string; submittedD: number; decision: VisaDetails["decision"]; cost: number; markup: number; status: Status }): this {
    const details: VisaDetails = { country: o.country, visaType: o.visaType, submittedAt: this.s.date(o.submittedD), decision: o.decision };
    const pricing = { currency: "USD" as const, cost: major(o.cost, "USD"), markup: major(o.markup, "USD") };
    return this.add(key, at, "visa", { details, pricing, status: o.status }, o.pax, { supplier: o.supplier });
  }

  insurance(key: string, at: Date, o: { supplier: string; pax: string[]; provider: string; plan: string; startD: number; endD: number; cost: number; markup: number; status: Status }): this {
    const details: InsuranceDetails = { provider: o.provider, plan: o.plan, coverStart: this.s.date(o.startD), coverEnd: this.s.date(o.endD) };
    const pricing = { currency: "TZS" as const, cost: major(o.cost, "TZS"), markup: major(o.markup, "TZS") };
    return this.add(key, at, "insurance", { details, pricing, status: o.status }, o.pax, { supplier: o.supplier });
  }

  // ───────────────────────────── Transitions and documents ─────────────────────────────

  /** Issues a line: flights get a fresh ticket per passenger; visas and insurance get a reference. */
  issue(key: string, at: Date, who?: StaffKey): this {
    const meta = this.meta[key];
    if (!meta) throw new Error(`Seed data error: ${this.spec.key}.${key} is issued before it is added`);
    const tickets = meta.type === "flight" ? meta.pax.map(() => this.s.ticket(ticketPrefix(meta.carrier ?? ""))) : undefined;
    const ref = meta.type === "visa" ? this.s.code("GWF0", 8, "0123456789") : meta.type === "insurance" ? this.s.code("KTI/", 7, "0123456789") : undefined;
    return this.step(at, `issue ${key}`, () => {
      const input: TransitionLineInput = { lineId: this.lineId(key), to: "issued" };
      if (tickets) input.tickets = meta.pax.map((p, i) => ({ travellerId: this.s.ref(`t:${p}`), ticketNumber: tickets[i] }));
      if (ref) input.confirmationNumber = ref;
      this.s.run(this.label(`issue ${key}`), at, who ?? this.spec.owner, transitionLine, input);
    });
  }

  complete(key: string, at: Date, who?: StaffKey): this {
    return this.step(at, `complete ${key}`, () => {
      this.s.run(this.label(`complete ${key}`), at, who ?? this.spec.owner, transitionLine, { lineId: this.lineId(key), to: "completed", note: "Travelled" });
    });
  }

  invoice(at: Date, who?: StaffKey): this {
    return this.step(at, "invoice", () => {
      this.s.run(this.label("issueInvoice"), at, who ?? this.spec.owner, issueInvoice, { fileId: this.id });
    });
  }

  quote(at: Date, who?: StaffKey): this {
    return this.step(at, "quote", () => {
      this.s.run(this.label("issueQuote"), at, who ?? this.spec.owner, issueQuote, { fileId: this.id });
    });
  }
}
