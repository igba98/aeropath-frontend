import { z } from "zod";
import type { Command, FlightDetails, ID, LineDetailsByType, LineType, ServiceLine } from "../types";
import { makeAudit } from "../audit";
import { describeLine } from "../describe";
import { format } from "../money";
import { samePricingAmounts } from "../pricing";
import { canTransition } from "../status/line-machine";
import { EDITABLE_STATUSES, LINE_STATUS_LABELS } from "../status/line-statuses";
import { denied, fail, nowIso, ok, parse, produce, unique } from "./_helpers";
import { zId, zMoney, zMoneyNonNeg, zCurrency } from "./_schemas";
import { checkTravellers, findTicketConflict, keepFlightSystemFields, lineTravellerIds, parseLineDetails, passengersFromTravellers, priceLine, ticketsOf } from "./_lines";
import type { AddServiceLinePricing } from "./addServiceLine";

export interface UpdateServiceLineInput {
  lineId: ID;
  patch: {
    supplierId?: ID;
    travellerIds?: ID[];
    /** Merged over the current details, then validated. */
    details?: Partial<LineDetailsByType[LineType]>;
    /** Merged over the current pricing, then recomputed. */
    pricing?: Partial<AddServiceLinePricing>;
    /** Editable in any status; "" clears. */
    notes?: string;
  };
  overrideReason?: string;
}

const patchSchema = z.object({
  supplierId: zId.optional(),
  travellerIds: z.array(zId).optional(),
  details: z.record(z.unknown()).optional(),
  pricing: z
    .object({
      currency: zCurrency.optional(),
      cost: zMoneyNonNeg.optional(),
      markup: zMoney.optional(),
      serviceFee: zMoneyNonNeg.optional(),
      fxToFile: z.number().positive("The exchange rate must be more than zero.").optional(),
    })
    .optional(),
  notes: z.string().trim().optional(),
});

export const updateServiceLine: Command<UpdateServiceLineInput> = (state, input, ctx) => {
  const no = denied(ctx, "line.edit");
  if (no) return no;
  const line = state.lines[input?.lineId];
  if (!line) return fail("NOT_FOUND", "This service could not be found.", "lineId");
  const file = state.files[line.fileId];
  if (!file) return fail("NOT_FOUND", "The booking for this service could not be found.");
  if (file.cancelledAt) return fail("CONFLICT", `Booking ${file.number} is cancelled and can no longer be edited.`);

  const parsed = parse(patchSchema, input.patch ?? {}, "patch");
  if (!parsed.ok) return parsed;
  const p = parsed.data;

  const structural = p.supplierId !== undefined || p.travellerIds !== undefined || p.details !== undefined || p.pricing !== undefined;
  if (structural && !EDITABLE_STATUSES.includes(line.status)) {
    return fail(
      "CONFLICT",
      `This service is ${LINE_STATUS_LABELS[line.status]}, so only its notes can be changed. Use void, refund or exchange to change anything else.`,
    );
  }

  // Supplier
  const supplierId = p.supplierId ?? line.supplierId;
  if (p.supplierId !== undefined) {
    const s = state.suppliers[p.supplierId];
    if (!s) return fail("NOT_FOUND", "The supplier could not be found. Choose another supplier.", "patch.supplierId");
    if (!s.active && p.supplierId !== line.supplierId) return fail("VALIDATION", `${s.name} is marked inactive. Choose an active supplier.`, "patch.supplierId");
  }

  // Details
  let details: LineDetailsByType[LineType] = line.details;
  if (p.details !== undefined) {
    const merged = parseLineDetails(line.type, { ...(line.details as object), ...p.details });
    if (!merged.ok) return merged;
    details = line.type === "flight" ? keepFlightSystemFields(merged.data as FlightDetails, line.details as FlightDetails) : merged.data;
  }

  // Travellers (flights keep passengers in step unless the passenger list itself was edited)
  let travellerIds = line.travellerIds;
  if (p.travellerIds !== undefined) {
    travellerIds = unique(p.travellerIds);
    const bad = checkTravellers(state, travellerIds, "patch.travellerIds");
    if (bad) return bad;
    if (line.type === "flight" && !(p.details && "passengers" in p.details)) {
      const fd = details as FlightDetails;
      const kept = fd.passengers.filter((x) => travellerIds.includes(x.travellerId));
      const added = passengersFromTravellers(
        state,
        travellerIds.filter((id) => !kept.some((x) => x.travellerId === id)),
      ).map((x, i) => ({ ...x, pnrPaxNo: kept.length + i + 1 }));
      details = { ...fd, passengers: [...kept, ...added] };
    }
  }
  travellerIds = lineTravellerIds(line.type, details, travellerIds);

  const candidate = { ...line, supplierId, travellerIds, details } as ServiceLine;
  const conflict = findTicketConflict(state, ticketsOf(candidate), line.id);
  if (conflict) return conflict;

  // Pricing
  let pricing = line.pricing;
  if (p.pricing !== undefined || p.details !== undefined) {
    const cur = line.pricing;
    const priced = priceLine({
      state,
      ctx,
      type: line.type,
      details,
      fileCurrency: file.currency,
      existing: cur,
      overrideReason: input.overrideReason,
      input: {
        currency: p.pricing?.currency ?? cur.currency,
        cost: p.pricing?.cost ?? cur.cost,
        markup: p.pricing?.markup ?? cur.markup,
        serviceFee: p.pricing?.serviceFee ?? cur.serviceFee,
        fxToFile: p.pricing?.fxToFile,
      },
    });
    if (!priced.ok) return priced;
    pricing = priced.pricing;
  }

  const updated = { ...candidate, pricing, description: describeLine(line.type, details), updatedAt: nowIso(ctx) } as ServiceLine;
  if (p.notes !== undefined) {
    if (p.notes) updated.notes = p.notes;
    else delete updated.notes;
  }

  if (updated.status === "booked" && (p.details !== undefined || p.travellerIds !== undefined)) {
    const probe = { ...updated, status: "quoted" } as ServiceLine;
    const check = canTransition(probe, "booked", { now: ctx.now, via: "transitionLine" });
    if (!check.ok) return fail("VALIDATION", `${check.error.message} It is already marked booked, so this change cannot be saved.`);
  }

  const next = produce(state, (d) => {
    d.lines[line.id] = updated;
    const df = d.files[file.id];
    df.travellerIds = unique([...df.travellerIds, ...updated.travellerIds]);
    df.updatedAt = updated.updatedAt;
  });

  const changed = (Object.keys(p) as (keyof typeof p)[]).filter((k) => p[k] !== undefined);
  const priceNote = !samePricingAmounts(line.pricing, pricing) ? ` · sell now ${format(pricing.sell)}` : "";
  const audit = [makeAudit(ctx, "line.updated", "line", line.id, `${updated.description} updated (${changed.join(", ")})${priceNote}`, file.id)];
  if (pricing.overrideBelowCost && pricing.overrideBelowCost !== line.pricing.overrideBelowCost) {
    audit.push(makeAudit(ctx, "line.below_cost", "line", line.id, `Sold below cost: ${pricing.overrideBelowCost.reason}`, file.id));
  }
  return ok(next, audit, undefined, "Service saved");
};
