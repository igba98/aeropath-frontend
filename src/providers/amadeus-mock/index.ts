/**
 * Amadeus mock provider (spec §11.3). Serves the JSON fixtures with simulated latency and failures so
 * the future "Fetch from Amadeus" flow can be demoed end to end. Not domain code: it may use timers
 * and randomness (both injectable for tests).
 *
 * Fixture dates are re-based on every read so demos always look current: the first departure lands
 * 10 days from today (gaps between flights kept) and a ticketing time limit lands 36 hours from now.
 */
import type { AirlineRef, Currency, ISODate, Settings } from "@/domain/types";
import { major, mul, sub } from "@/domain/money";
import { AIRLINES, airlineName, findAirline } from "@/store/seed/reference";
import { ProviderError, type PnrSnapshot, type PnrSnapshotTicket, type TravelProvider } from "../types";
import { addDaysIso, addDaysLocal, darLocalDate, diffDaysIso } from "../util/dates";
import fixtureZ8K4QM from "./fixtures/Z8K4QM.json";
import fixtureW3JN6P from "./fixtures/W3JN6P.json";
import fixtureT5MV8C from "./fixtures/T5MV8C.json";
import fixtureL9BX2D from "./fixtures/L9BX2D.json";

// ─────────────────────────────── Fixtures ───────────────────────────────

/** A fixture is a PnrSnapshot (without raw/warnings) plus mock-only extras. */
export interface MockFixture extends Omit<PnrSnapshot, "raw" | "warnings"> {
  mock?: {
    /** Fare per passenger (major units) used when the mock issues tickets. */
    fare?: { currency: Currency; perPax: Record<string, number> };
    /** Reason shown when this PNR comes back from readQueue. */
    queueReason?: string;
  };
}

export const MOCK_FIXTURES: readonly MockFixture[] = [fixtureZ8K4QM, fixtureW3JN6P, fixtureT5MV8C, fixtureL9BX2D] as unknown as MockFixture[];

/** Record locators the mock knows: Z8K4QM (ticketed family), W3JN6P (booked return), T5MV8C (multi-city), L9BX2D (infant). */
export const MOCK_RECORD_LOCATORS: readonly string[] = MOCK_FIXTURES.map((f) => f.recordLocator);

export function findFixture(recordLocator: string): MockFixture | undefined {
  const loc = recordLocator.trim().toUpperCase();
  return MOCK_FIXTURES.find((f) => f.recordLocator === loc);
}

const HOUR_MS = 3_600_000;
const DAY_MS = 24 * HOUR_MS;
export const FIRST_DEPARTURE_IN_DAYS = 10;
export const TIME_LIMIT_IN_HOURS = 36;

const clone = <T>(x: T): T => JSON.parse(JSON.stringify(x)) as T;
const minIsoDate = (a: ISODate, b: ISODate): ISODate => (a < b ? a : b);

/** Shift a fixture so its first departure is today + 10 days (Dar time) and any time limit is now + 36 h. */
export function rebaseFixture(fixture: MockFixture, now: Date): PnrSnapshot {
  const { mock: _mock, ...fx } = clone(fixture);
  void _mock;
  const today = darLocalDate(now);
  const firstDate = fx.segments.map((s) => s.departureLocal.slice(0, 10)).sort()[0];
  const delta = firstDate ? diffDaysIso(addDaysIso(today, FIRST_DEPARTURE_IN_DAYS), firstDate) : 0;

  const snapshot: PnrSnapshot = {
    recordLocator: fx.recordLocator,
    ...(fx.officeId ? { officeId: fx.officeId } : {}),
    ...(fx.createdAt
      ? { createdAt: new Date(Math.min(Date.parse(fx.createdAt) + delta * DAY_MS, now.getTime() - HOUR_MS)).toISOString() }
      : {}),
    passengers: fx.passengers,
    segments: fx.segments.map((s) => ({
      ...s,
      departureLocal: addDaysLocal(s.departureLocal, delta),
      arrivalLocal: addDaysLocal(s.arrivalLocal, delta),
    })),
    ...(fx.ticketingTimeLimit ? { ticketingTimeLimit: new Date(now.getTime() + TIME_LIMIT_IN_HOURS * HOUR_MS).toISOString() } : {}),
    tickets: fx.tickets.map((t) => (t.issuedAt ? { ...t, issuedAt: minIsoDate(addDaysIso(t.issuedAt, delta), today) } : t)),
    contacts: fx.contacts,
    raw: "",
    warnings: [],
  };
  snapshot.raw = JSON.stringify({ source: "amadeus-mock", retrievedAt: now.toISOString(), pnr: { ...snapshot, raw: undefined } }, null, 2);
  return snapshot;
}

// ─────────────────────────────── Messages ───────────────────────────────

export const MOCK_MESSAGES = {
  timeout: "Amadeus didn't answer in time. Try again, or enter the flight manually.",
  auth: "Amadeus rejected our credentials. Ask your manager to check Settings → Integrations.",
  pnrNotFound: (loc: string) => `No booking found for ${loc}. Check the record locator.`,
  notALocator: (input: string) => `"${input}" isn't a record locator. It has 6 letters or digits, like Z8K4QM.`,
  ticketNotFound: (n: string) => `No ticket ${n} found in Amadeus. Check the ticket number.`,
  notATicket: (input: string) => `"${input}" isn't a ticket number. It has 13 digits, like 176-2401234567.`,
  noFare: (n: string) => `Amadeus has no fare for ticket ${n}. Enter the airline penalty from the fare rules.`,
  noPrefix: (carrier: string, name: string) =>
    `No ticket prefix is set for ${name} (${carrier}). Add it in Settings → Airlines, then try again.`,
} as const;

// ─────────────────────────────── Provider ───────────────────────────────

type AmadeusSettings = Settings["integrations"]["amadeus"];
export type MockFailure = AmadeusSettings["mock"]["failure"];

export interface AmadeusMockOptions {
  latencyMs?: number;
  failure?: MockFailure;
  environment?: AmadeusSettings["environment"];
  officeId?: string;
  /** Settings → Airlines (for ticket prefixes). Defaults to the reference list. */
  airlines?: AirlineRef[];
  now?: () => Date;
  random?: () => number;
  sleep?: (ms: number) => Promise<void>;
}

/** Share of calls that fail in "random" mode. */
export const RANDOM_FAILURE_RATE = 0.3;
export const REFUND_PENALTY_RATE = 0.15;

/** Tickets issued by the mock during this page session (lost on reload, like any demo state outside the store). */
const issuedByLocator = new Map<string, PnrSnapshotTicket[]>();
const issuedByNumber = new Map<string, PnrSnapshotTicket>();

/** Test helper: forget tickets issued by the mock. */
export function resetMockMemory(): void {
  issuedByLocator.clear();
  issuedByNumber.clear();
}

const defaultSleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, Math.max(0, ms)));

const LOCATOR = /^[A-Z0-9]{6}$/;

function normaliseTicket(input: string): string | null {
  const digits = input.replace(/\D/g, "");
  return digits.length === 13 ? `${digits.slice(0, 3)}-${digits.slice(3)}` : null;
}

export function createAmadeusMockProvider(opts: AmadeusMockOptions = {}): TravelProvider {
  const latencyMs = Math.max(0, opts.latencyMs ?? 600);
  const failure: MockFailure = opts.failure ?? "none";
  const environment = opts.environment ?? "test";
  const officeId = opts.officeId || "DARTZ2100";
  const airlines = opts.airlines?.length ? opts.airlines : AIRLINES;
  const now = opts.now ?? (() => new Date());
  const random = opts.random ?? Math.random;
  const sleep = opts.sleep ?? defaultSleep;

  /** Wait the simulated latency, then decide which failure (if any) this call suffers. */
  async function simulate(): Promise<Exclude<MockFailure, "random">> {
    await sleep(latencyMs);
    if (failure !== "random") return failure;
    if (random() >= RANDOM_FAILURE_RATE) return "none";
    const modes = ["timeout", "not_found", "auth_error"] as const;
    return modes[Math.min(modes.length - 1, Math.floor(random() * modes.length))];
  }

  /** Throw the error for a failure mode; `notFound` is the message when the mode is not_found. */
  function raise(mode: Exclude<MockFailure, "random">, notFound: string): void {
    if (mode === "timeout") throw new ProviderError("TIMEOUT", MOCK_MESSAGES.timeout);
    if (mode === "auth_error") throw new ProviderError("AUTH", MOCK_MESSAGES.auth);
    if (mode === "not_found") throw new ProviderError("NOT_FOUND", notFound);
  }

  function readLocator(input: string): string {
    const loc = (input ?? "").replace(/\s+/g, "").toUpperCase();
    if (!LOCATOR.test(loc)) throw new ProviderError("NOT_FOUND", MOCK_MESSAGES.notALocator((input ?? "").trim()));
    return loc;
  }

  function readTicket(input: string): string {
    const n = normaliseTicket(input ?? "");
    if (!n) throw new ProviderError("NOT_FOUND", MOCK_MESSAGES.notATicket((input ?? "").trim()));
    return n;
  }

  function serial(): string {
    let s = "";
    for (let i = 0; i < 10; i++) s += Math.min(9, Math.floor(random() * 10));
    return s;
  }

  /** A ticket number not issued before. Retries a few times, then steps forward (a poor random source may repeat). */
  function uniqueTicketNumber(prefix: string): string {
    const taken = (s: string) => issuedByNumber.has(`${prefix}-${s}`);
    let s = serial();
    for (let tries = 0; taken(s) && tries < 20; tries++) s = serial();
    while (taken(s)) s = String((Number(s) + 1) % 1e10).padStart(10, "0");
    return `${prefix}-${s}`;
  }

  return {
    id: "amadeus-mock",

    async ping() {
      const mode = await simulate();
      if (mode === "timeout") return { ok: false, message: MOCK_MESSAGES.timeout };
      if (mode === "auth_error") return { ok: false, message: MOCK_MESSAGES.auth };
      const note = failure === "none" ? "" : ` Simulated failure mode: ${failure.replace("_", " ")}.`;
      return { ok: true, message: `Connected to the Amadeus mock (${environment}, office ${officeId}) in ${latencyMs} ms.${note}` };
    },

    async retrievePnr(recordLocator) {
      const loc = readLocator(recordLocator);
      raise(await simulate(), MOCK_MESSAGES.pnrNotFound(loc));
      const fixture = findFixture(loc);
      if (!fixture) throw new ProviderError("NOT_FOUND", MOCK_MESSAGES.pnrNotFound(loc));
      const snapshot = rebaseFixture(fixture, now());
      // A PNR ticketed through the mock now carries its tickets and no longer has a time limit.
      const issued = issuedByLocator.get(loc);
      if (issued && snapshot.tickets.length === 0) {
        snapshot.tickets = clone(issued);
        delete snapshot.ticketingTimeLimit;
      }
      return snapshot;
    },

    async issueTicket(recordLocator) {
      const loc = readLocator(recordLocator);
      raise(await simulate(), MOCK_MESSAGES.pnrNotFound(loc));
      const fixture = findFixture(loc);
      if (!fixture) throw new ProviderError("NOT_FOUND", MOCK_MESSAGES.pnrNotFound(loc));

      const current = rebaseFixture(fixture, now());
      if (current.tickets.length) return { tickets: current.tickets }; // already ticketed
      const already = issuedByLocator.get(loc);
      if (already) return { tickets: clone(already) };

      const carrier = current.segments[0]?.carrier ?? "";
      const prefix = findAirline(carrier, airlines)?.ticketPrefix;
      if (!prefix || !/^\d{3}$/.test(prefix)) {
        throw new ProviderError("UNKNOWN", MOCK_MESSAGES.noPrefix(carrier, airlineName(carrier, airlines)));
      }

      const today = darLocalDate(now());
      const fare = fixture.mock?.fare;
      const tickets: PnrSnapshotTicket[] = current.passengers.map((p) => {
        const ticketNumber = uniqueTicketNumber(prefix);
        const amount = fare?.perPax[String(p.pnrPaxNo)];
        const t: PnrSnapshotTicket = { pnrPaxNo: p.pnrPaxNo, ticketNumber, carrier, issuedAt: today };
        if (fare && typeof amount === "number") {
          t.currency = fare.currency;
          t.amount = amount;
        }
        issuedByNumber.set(ticketNumber, t);
        return t;
      });
      issuedByLocator.set(loc, tickets);
      return { tickets: clone(tickets) };
    },

    async voidDocument(documentNumber) {
      const n = readTicket(documentNumber);
      raise(await simulate(), MOCK_MESSAGES.ticketNotFound(n));
      return { ok: true as const };
    },

    async refundQuote(ticketNumber) {
      const n = readTicket(ticketNumber);
      raise(await simulate(), MOCK_MESSAGES.ticketNotFound(n));
      const known = issuedByNumber.get(n) ?? MOCK_FIXTURES.flatMap((f) => f.tickets).find((t) => t.ticketNumber === n);
      if (!known) throw new ProviderError("NOT_FOUND", MOCK_MESSAGES.ticketNotFound(n));
      if (!known.currency || typeof known.amount !== "number") throw new ProviderError("NOT_FOUND", MOCK_MESSAGES.noFare(n));
      const fare = major(known.amount, known.currency);
      const supplierPenalty = mul(fare, REFUND_PENALTY_RATE);
      return { supplierPenalty, refundable: sub(fare, supplierPenalty) };
    },

    async readQueue(queue) {
      void queue;
      const mode = await simulate();
      if (mode === "not_found") return []; // empty queue
      raise(mode, "");
      const pool = [...MOCK_FIXTURES];
      // Fisher–Yates with the injectable random source.
      for (let i = pool.length - 1; i > 0; i--) {
        const j = Math.min(i, Math.floor(random() * (i + 1)));
        [pool[i], pool[j]] = [pool[j], pool[i]];
      }
      const count = random() < 0.5 ? 2 : 3;
      return pool.slice(0, count).map((f) => ({
        recordLocator: f.recordLocator,
        reason: f.mock?.queueReason ?? "Queued for review.",
      }));
    },
  };
}
