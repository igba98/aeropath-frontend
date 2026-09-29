import type { Ctx, Currency, DbState, FlightDetails, FlightPassenger, ID, LineDetailsByType, LineType, Money, Pricing, ServiceLine } from "../types";
import { can, forbiddenMessage } from "../permissions";
import { computePricing, fxToFileFor, isBelowCost, samePricingAmounts } from "../pricing";
import { nameInPnrFor } from "../describe";
import { format } from "../money";
import { DETAILS_SCHEMAS } from "./_schemas";
import { fail, nowIso, parse, unique, type Fail } from "./_helpers";

/** Line helpers shared by addServiceLine, updateServiceLine, transitionLine, decideRefund and importFromProvider. */

export interface LinePricingInput {
  /** Pricing currency (non-flight). Flights are priced in their fare currency. */
  currency?: Currency;
  /** Net cost (non-flight). Flights: computed from details.fare. */
  cost?: Money;
  markup: Money;
  /** Defaults from settings.defaultServiceFee[type] (converted to the line currency) when omitted. */
  serviceFee?: Money;
  /** File-currency units per 1 line-currency unit. Only an Accountant or a Manager may differ from the settings rate. */
  fxToFile?: number;
}

export function parseLineDetails<T extends LineType>(type: T, details: unknown): { ok: true; data: LineDetailsByType[T] } | Fail {
  const schema = DETAILS_SCHEMAS[type];
  if (!schema) return fail("VALIDATION", "Choose a valid service type.", "type");
  const r = parse(schema, details ?? {}, "details");
  return r.ok ? { ok: true, data: r.data as LineDetailsByType[T] } : r;
}

/** Keeps the system-managed flight fields (issue time, void deadline, exchange links) when details are replaced. */
export function keepFlightSystemFields(next: FlightDetails, prev: FlightDetails | undefined): FlightDetails {
  if (!prev) return next;
  const out: FlightDetails = { ...next };
  if (prev.issuedAt) out.issuedAt = prev.issuedAt;
  if (prev.voidDeadline) out.voidDeadline = prev.voidDeadline;
  if (prev.exchangedFromLineId) out.exchangedFromLineId = prev.exchangedFromLineId;
  if (prev.exchangedToLineId) out.exchangedToLineId = prev.exchangedToLineId;
  return out;
}

const RATE_EPSILON = 1e-9;
const sameRate = (a: number, b: number) => Math.abs(a - b) <= RATE_EPSILON * Math.max(1, Math.abs(b));

/**
 * Prices a line (spec §8.2), captures fxToFile when the line and file currencies differ, and enforces the
 * below-cost rule: only a Manager can sell below cost, and a reason is required.
 */
export function priceLine(opts: {
  state: DbState;
  ctx: Ctx;
  type: LineType;
  details: LineDetailsByType[LineType];
  input: LinePricingInput;
  fileCurrency: Currency;
  overrideReason?: string;
  existing?: Pricing;
}): { ok: true; pricing: Pricing } | Fail {
  const { state, ctx, type, input, fileCurrency, existing } = opts;
  const settings = state.settings;
  const fare = type === "flight" ? (opts.details as FlightDetails).fare : undefined;
  const currency: Currency | undefined = fare ? fare.currency : input.currency ?? existing?.currency;
  if (!currency) return fail("VALIDATION", "Choose the pricing currency.", "pricing.currency");

  const settingsFx = fxToFileFor(currency, fileCurrency, settings.fx.USD_TZS);
  let fxToFile = settingsFx;
  if (settingsFx !== undefined) {
    const keepExisting = existing?.fxToFile !== undefined && existing.currency === currency;
    if (input.fxToFile !== undefined && !sameRate(input.fxToFile, settingsFx) && !(keepExisting && sameRate(input.fxToFile, existing!.fxToFile!))) {
      if (!can(ctx.user, "fx.override")) return fail("FORBIDDEN", forbiddenMessage("fx.override"), "pricing.fxToFile");
      fxToFile = input.fxToFile;
    } else if (input.fxToFile === undefined && keepExisting) {
      fxToFile = existing!.fxToFile;
    }
  }

  const pricing = computePricing({ currency, cost: input.cost, markup: input.markup, serviceFee: input.serviceFee, fxToFile, fare }, settings, type);

  if (isBelowCost(pricing)) {
    if (existing?.overrideBelowCost && samePricingAmounts(existing, pricing) && !opts.overrideReason) {
      pricing.overrideBelowCost = existing.overrideBelowCost;
    } else if (!can(ctx.user, "line.price_below_cost")) {
      return fail("BELOW_COST", `Only a Manager can sell below cost, with a reason. The price ${format(pricing.sell)} is below the cost ${format(pricing.cost)}.`, "pricing.markup");
    } else if (!opts.overrideReason?.trim()) {
      return fail("BELOW_COST", `Give a reason for selling below cost (price ${format(pricing.sell)}, cost ${format(pricing.cost)}).`, "overrideReason");
    } else {
      pricing.overrideBelowCost = { by: ctx.user.id, at: nowIso(ctx), reason: opts.overrideReason.trim() };
    }
  }
  return { ok: true, pricing };
}

export function checkTravellers(state: DbState, ids: ID[], field = "travellerIds"): Fail | null {
  const missing = ids.find((id) => !state.travellers[id]);
  return missing ? fail("NOT_FOUND", "One of the travellers could not be found. Refresh and try again.", field) : null;
}

/** Passengers generated from travellers (nameInPnr "SURNAME/GIVEN TITLE"). */
export function passengersFromTravellers(state: DbState, travellerIds: ID[]): FlightPassenger[] {
  return travellerIds
    .map((id) => state.travellers[id])
    .filter(Boolean)
    .map((t, i) => ({ travellerId: t.id, nameInPnr: nameInPnrFor(t), paxType: t.paxType, pnrPaxNo: i + 1, emdNumbers: [] }));
}

/** Line travellers = given travellers ∪ flight passengers. */
export function lineTravellerIds(type: LineType, details: LineDetailsByType[LineType], travellerIds: ID[]): ID[] {
  if (type !== "flight") return unique(travellerIds);
  return unique([...travellerIds, ...(details as FlightDetails).passengers.map((p) => p.travellerId)]);
}

export const ticketsOf = (line: ServiceLine): string[] => (line.type === "flight" ? line.details.passengers.map((p) => p.ticketNumber).filter((t): t is string => !!t) : []);

/**
 * Ticket numbers are unique across all lines. Voided (and refunded, exchanged) tickets stay reserved; only cancelled
 * lines — never issued — are ignored. `lineId` is the line being edited (its own numbers do not conflict).
 */
export function findTicketConflict(state: DbState, tickets: string[], lineId?: ID): Fail | null {
  const seen = new Set<string>();
  for (const t of tickets) {
    if (seen.has(t)) return fail("CONFLICT", `Ticket ${t} is entered for two passengers. Each passenger has their own ticket number.`, "tickets");
    seen.add(t);
  }
  for (const other of Object.values(state.lines)) {
    if (other.id === lineId || other.type !== "flight" || other.status === "cancelled") continue;
    const clash = ticketsOf(other).find((t) => seen.has(t));
    if (clash) {
      const file = state.files[other.fileId];
      const where = file ? `booking ${file.number}` : "another booking";
      const note = other.status === "voided" ? " That ticket was voided; voided numbers stay reserved." : "";
      return fail("CONFLICT", `Ticket ${clash} is already recorded on ${where} (${other.description}).${note}`, "tickets");
    }
  }
  return null;
}
