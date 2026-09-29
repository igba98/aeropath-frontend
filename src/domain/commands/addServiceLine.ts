import { z } from "zod";
import type { BookingFile, Command, Ctx, Currency, DbState, ExternalRef, FlightDetails, ID, LineDetailsByType, LineType, Money, ServiceLine } from "../types";
import { makeAudit } from "../audit";
import { describeLine } from "../describe";
import { format } from "../money";
import { canTransition } from "../status/line-machine";
import { denied, fail, historyEntry, nowIso, ok, parse, produce, unique, type Fail } from "./_helpers";
import { zExternalRef, zId, zOptText, zPricingInput } from "./_schemas";
import { checkTravellers, findTicketConflict, lineTravellerIds, parseLineDetails, passengersFromTravellers, priceLine, ticketsOf, type LinePricingInput } from "./_lines";

export interface AddServiceLinePricing {
  /** Pricing currency. For flights the fare currency is used. */
  currency: Currency;
  /** Net cost for non-flight lines. Ignored for flights (cost = totalFare − commission). */
  cost?: Money;
  markup: Money;
  /** Defaults from settings.defaultServiceFee[type], converted to the line currency. */
  serviceFee?: Money;
  /** Rate to the file currency; only an Accountant or a Manager may differ from the settings rate. */
  fxToFile?: number;
}

export interface AddServiceLineInput {
  fileId: ID;
  type: LineType;
  /** Required except for flights, which default to the air settlement supplier (settings). */
  supplierId?: ID;
  travellerIds: ID[];
  details: LineDetailsByType[LineType];
  pricing: AddServiceLinePricing;
  /** Default 'quoted'. 'booked' runs the quoted → booked guard. */
  status?: "quoted" | "booked";
  source?: "manual" | "amadeus";
  external?: ExternalRef;
  notes?: string;
  /** Required (Manager only) when the selling price is below cost. */
  overrideReason?: string;
}

export interface AddServiceLineResult {
  lineId: ID;
}

export const LINE_TYPES = ["flight", "hotel", "car", "transfer", "tour", "visa", "insurance", "service_fee", "other"] as const;

const schema = z.object({
  fileId: zId,
  type: z.enum(LINE_TYPES),
  supplierId: z.preprocess((v) => (v === "" || v === null ? undefined : v), zId.optional()),
  travellerIds: z.array(zId).default([]),
  details: z.unknown(),
  pricing: zPricingInput,
  status: z.enum(["quoted", "booked"]).default("quoted"),
  source: z.enum(["manual", "amadeus"]).default("manual"),
  external: zExternalRef.optional(),
  notes: zOptText,
  overrideReason: zOptText,
});

export interface BuildLineArgs {
  file: BookingFile;
  type: LineType;
  supplierId: ID | undefined;
  travellerIds: ID[];
  details: LineDetailsByType[LineType];
  pricing: LinePricingInput;
  status: "quoted" | "booked";
  source: "manual" | "amadeus";
  external?: ExternalRef;
  notes?: string;
  overrideReason?: string;
  /** Note on the first status history entry. */
  historyNote?: string;
  /** Skip the quoted → booked guard (system-created lines, e.g. an approved exchange). */
  skipBookedGuard?: boolean;
}

/** Validates and builds a new line (not yet stored). Shared by addServiceLine, importFromProvider and exchanges. */
export function buildServiceLine(state: DbState, ctx: Ctx, a: BuildLineArgs): { ok: true; line: ServiceLine } | Fail {
  const supplierId = a.supplierId ?? (a.type === "flight" ? state.settings.airSettlement.supplierId : undefined);
  if (!supplierId) return fail("VALIDATION", "Choose the supplier for this service.", "supplierId");
  const supplier = state.suppliers[supplierId];
  if (!supplier) return fail("NOT_FOUND", "The supplier could not be found. Choose another supplier.", "supplierId");
  if (!supplier.active) return fail("VALIDATION", `${supplier.name} is marked inactive. Choose an active supplier.`, "supplierId");

  let details = a.details;
  if (a.type === "flight") {
    const fd = details as FlightDetails;
    if (!fd.passengers.length && a.travellerIds.length) details = { ...fd, passengers: passengersFromTravellers(state, a.travellerIds) };
  }
  const travellerIds = lineTravellerIds(a.type, details, a.travellerIds);
  const badTraveller = checkTravellers(state, travellerIds);
  if (badTraveller) return badTraveller;

  const at = nowIso(ctx);
  const id = ctx.newId("lin");
  const draft = { type: a.type, details } as Pick<ServiceLine, "type" | "details">;
  const conflict = findTicketConflict(state, ticketsOf(draft as ServiceLine), id);
  if (conflict) return conflict;

  const priced = priceLine({ state, ctx, type: a.type, details, input: a.pricing, fileCurrency: a.file.currency, overrideReason: a.overrideReason });
  if (!priced.ok) return priced;

  const line = {
    id,
    fileId: a.file.id,
    type: a.type,
    status: "quoted",
    supplierId,
    travellerIds,
    description: describeLine(a.type, details),
    pricing: priced.pricing,
    source: a.source,
    supplierPaidMinor: 0,
    createdAt: at,
    createdBy: ctx.user.id,
    updatedAt: at,
    statusHistory: [historyEntry(null, "quoted", ctx, a.historyNote)],
    details,
  } as ServiceLine;
  if (a.external) line.external = a.external;
  if (a.notes) line.notes = a.notes;

  if (a.status === "booked") {
    if (!a.skipBookedGuard) {
      const check = canTransition(line, "booked", { now: ctx.now, via: "transitionLine" });
      if (!check.ok) return check;
    }
    line.status = "booked";
    line.statusHistory.push(historyEntry("quoted", "booked", ctx, a.historyNote));
  }
  return { ok: true, line };
}

export const addServiceLine: Command<AddServiceLineInput, AddServiceLineResult> = (state, input, ctx) => {
  const no = denied(ctx, "line.edit");
  if (no) return no;

  const parsed = parse(schema, input);
  if (!parsed.ok) return parsed;
  const f = parsed.data;

  const file = state.files[f.fileId];
  if (!file) return fail("NOT_FOUND", "This booking could not be found.", "fileId");
  if (file.cancelledAt) return fail("CONFLICT", `Booking ${file.number} is cancelled. Services cannot be added to it.`);

  const details = parseLineDetails(f.type, f.details);
  if (!details.ok) return details;

  const built = buildServiceLine(state, ctx, {
    file,
    type: f.type,
    supplierId: f.supplierId,
    travellerIds: f.travellerIds,
    details: details.data,
    pricing: f.pricing,
    status: f.status,
    source: f.source,
    external: f.external,
    notes: f.notes,
    overrideReason: f.overrideReason,
  });
  if (!built.ok) return built;
  const line = built.line;

  const next = produce(state, (d) => {
    d.lines[line.id] = line;
    const df = d.files[file.id];
    df.travellerIds = unique([...df.travellerIds, ...line.travellerIds]);
    df.updatedAt = line.createdAt;
  });
  const audit = [makeAudit(ctx, "line.added", "line", line.id, `${line.description} added (${line.status}, sell ${format(line.pricing.sell)})`, file.id)];
  if (line.pricing.overrideBelowCost) {
    audit.push(makeAudit(ctx, "line.below_cost", "line", line.id, `Sold below cost: ${line.pricing.overrideBelowCost.reason}`, file.id));
  }
  return ok(next, audit, { lineId: line.id }, `${line.description} added`);
};
