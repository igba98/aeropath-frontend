import { z } from "zod";
import type { Command, ExternalRef, FlightDetails, FlightLine, FlightPassenger, ID, Money } from "../types";
import { makeAudit } from "../audit";
import { describeFlight } from "../describe";
import { format } from "../money";
import { canTransition } from "../status/line-machine";
import { EDITABLE_STATUSES, TERMINAL_STATUSES } from "../status/line-statuses";
import { CONFIRMED_SEGMENT_STATUSES, isValidLocator } from "../validation";
import { denied, fail, historyEntry, nowIso, ok, parse, produce, unique } from "./_helpers";
import { zExternalRef, zId, zMoney, zMoneyNonNeg } from "./_schemas";
import { findTicketConflict, keepFlightSystemFields, parseLineDetails, priceLine, ticketsOf } from "./_lines";
import { buildServiceLine } from "./addServiceLine";

export interface ImportFromProviderInput {
  fileId: ID;
  /** Update this flight line; otherwise a non-terminal flight line with the same record locator is updated, or a new one created. */
  lineId?: ID;
  /** Already mapped from the PnrSnapshot (passengers mapped to travellers). */
  details: FlightDetails;
  external: ExternalRef;
  source: "manual" | "amadeus";
  /** Defaults to settings.airSettlement.supplierId. */
  supplierId?: ID;
  /** Used when a new line is created. An existing line keeps its agent-set markup and service fee. */
  pricing: { markup: Money; serviceFee?: Money };
}

export interface ImportFromProviderResult {
  lineId: ID;
  created: boolean;
}

const schema = z.object({
  fileId: zId,
  lineId: z.preprocess((v) => (v === "" || v === null ? undefined : v), zId.optional()),
  details: z.unknown(),
  external: zExternalRef,
  source: z.enum(["manual", "amadeus"]),
  supplierId: z.preprocess((v) => (v === "" || v === null ? undefined : v), zId.optional()),
  pricing: z.object({ markup: zMoney, serviceFee: zMoneyNonNeg.optional() }),
});

const hasConfirmedSegment = (d: FlightDetails) => d.segments.some((s) => (CONFIRMED_SEGMENT_STATUSES as readonly string[]).includes(s.statusCode));
const sameFare = (a: FlightDetails["fare"], b: FlightDetails["fare"]) =>
  a.currency === b.currency && a.totalFare.amountMinor === b.totalFare.amountMinor && a.baseFare.amountMinor === b.baseFare.amountMinor && a.commissionPct === b.commissionPct;

/** Merges imported passengers into existing ones. Issued lines never lose or change a ticket: differences mark drift. */
function mergePassengers(existing: FlightPassenger[], imported: FlightPassenger[], editable: boolean): { passengers: FlightPassenger[]; drift: boolean } {
  let drift = false;
  const out = existing.map((p) => ({ ...p, emdNumbers: [...p.emdNumbers] }));
  for (const imp of imported) {
    const cur = out.find((p) => p.travellerId === imp.travellerId);
    if (!cur) {
      if (editable) out.push({ ...imp });
      else drift = true;
      continue;
    }
    cur.nameInPnr = imp.nameInPnr;
    cur.paxType = imp.paxType;
    if (imp.pnrPaxNo !== undefined) cur.pnrPaxNo = imp.pnrPaxNo;
    if (imp.ticketNumber && imp.ticketNumber !== cur.ticketNumber) {
      if (!cur.ticketNumber || editable) cur.ticketNumber = imp.ticketNumber;
      else drift = true;
    }
    cur.emdNumbers = unique([...cur.emdNumbers, ...imp.emdNumbers]);
    if (imp.fareAmount && editable) cur.fareAmount = imp.fareAmount;
  }
  return { passengers: out, drift };
}

/**
 * Creates or updates a flight line from provider data (Paste PNR or Amadeus). Idempotent: the same PNR updates the
 * existing line (segments, tickets, fare while still quoted/booked, external.lastSyncedAt) instead of adding a new
 * one. Agent-set markup and service fee are never overwritten; on an issued line a different fare or ticket marks
 * syncStatus 'drift' instead of changing it. Ticket numbers stay unique (CONFLICT).
 */
export const importFromProvider: Command<ImportFromProviderInput, ImportFromProviderResult> = (state, input, ctx) => {
  const no = denied(ctx, "provider.import");
  if (no) return no;
  const parsed = parse(schema, input);
  if (!parsed.ok) return parsed;
  const f = parsed.data;

  const file = state.files[f.fileId];
  if (!file) return fail("NOT_FOUND", "This booking could not be found.", "fileId");
  if (file.cancelledAt) return fail("CONFLICT", `Booking ${file.number} is cancelled. Services cannot be added to it.`);
  const det = parseLineDetails("flight", f.details);
  if (!det.ok) return det;
  const details = det.data;
  const at = nowIso(ctx);

  let target: FlightLine | undefined;
  if (f.lineId) {
    const l = state.lines[f.lineId];
    if (!l || l.fileId !== file.id) return fail("NOT_FOUND", "The flight to update could not be found on this booking.", "lineId");
    if (l.type !== "flight") return fail("VALIDATION", "Only flight services can be updated from a PNR.", "lineId");
    if (TERMINAL_STATUSES.includes(l.status)) return fail("CONFLICT", `This flight is ${l.status} and can no longer be updated from the PNR.`, "lineId");
    target = l;
  } else if (details.recordLocator) {
    target = Object.values(state.lines).find(
      (l): l is FlightLine => l.fileId === file.id && l.type === "flight" && !TERMINAL_STATUSES.includes(l.status) && l.details.recordLocator === details.recordLocator,
    );
  }

  const external: ExternalRef = { ...f.external, recordLocator: f.external.recordLocator ?? (details.recordLocator || undefined), lastSyncedAt: at, syncStatus: "ok" };

  // ── Create ──
  if (!target) {
    const status = isValidLocator(details.recordLocator) && hasConfirmedSegment(details) ? "booked" : "quoted";
    const built = buildServiceLine(state, ctx, {
      file,
      type: "flight",
      supplierId: f.supplierId,
      travellerIds: details.passengers.map((p) => p.travellerId),
      details,
      pricing: { currency: details.fare.currency, markup: f.pricing.markup, serviceFee: f.pricing.serviceFee },
      status,
      source: f.source,
      external,
      historyNote: `Imported from ${f.source === "amadeus" ? "Amadeus" : "pasted PNR"}${details.recordLocator ? ` ${details.recordLocator}` : ""}`,
    });
    if (!built.ok) return built;
    const line = built.line;
    const next = produce(state, (d) => {
      d.lines[line.id] = line;
      const df = d.files[file.id];
      df.travellerIds = unique([...df.travellerIds, ...line.travellerIds]);
      df.updatedAt = at;
    });
    const summary = `${line.description} imported (${line.status}, sell ${format(line.pricing.sell)})`;
    return ok(next, [makeAudit(ctx, "line.imported", "line", line.id, summary, file.id)], { lineId: line.id, created: true }, `${line.description} imported`);
  }

  // ── Update ──
  const cur = target;
  const editable = EDITABLE_STATUSES.includes(cur.status);
  const merged = mergePassengers(cur.details.passengers, details.passengers, editable);
  let drift = merged.drift;
  const fareChanged = !sameFare(cur.details.fare, details.fare);
  if (fareChanged && !editable) drift = true;

  const nextDetails: FlightDetails = keepFlightSystemFields(
    {
      ...cur.details,
      recordLocator: details.recordLocator || cur.details.recordLocator,
      validatingCarrier: editable ? details.validatingCarrier || cur.details.validatingCarrier : cur.details.validatingCarrier,
      tripType: details.tripType,
      segments: details.segments.length ? details.segments : cur.details.segments,
      passengers: merged.passengers,
      fare: editable ? details.fare : cur.details.fare,
    },
    cur.details,
  );
  if (details.airlineLocator) nextDetails.airlineLocator = details.airlineLocator;
  if (details.officeId) nextDetails.officeId = details.officeId;
  if (details.baggage) nextDetails.baggage = details.baggage;
  if (details.ticketingTimeLimit) nextDetails.ticketingTimeLimit = details.ticketingTimeLimit;

  const conflict = findTicketConflict(state, ticketsOf({ ...cur, details: nextDetails }), cur.id);
  if (conflict) return conflict;

  let pricing = cur.pricing;
  if (editable && fareChanged) {
    // Keep the agent's markup and service fee; only the airline cost follows the new fare.
    const priced = priceLine({ state, ctx, type: "flight", details: nextDetails, fileCurrency: file.currency, existing: cur.pricing, input: { markup: cur.pricing.markup, serviceFee: cur.pricing.serviceFee } });
    if (!priced.ok) return priced;
    pricing = priced.pricing;
  }

  let updated: FlightLine = {
    ...cur,
    details: nextDetails,
    pricing,
    travellerIds: unique([...cur.travellerIds, ...merged.passengers.map((p) => p.travellerId)]),
    description: describeFlight(nextDetails),
    source: f.source === "amadeus" ? "amadeus" : cur.source,
    external: { ...cur.external, ...external, externalIds: { ...(cur.external?.externalIds ?? {}), ...external.externalIds }, syncStatus: drift ? "drift" : "ok" },
    updatedAt: at,
  };
  if (updated.status === "quoted" && canTransition(updated, "booked", { now: ctx.now, via: "transitionLine" }).ok) {
    updated = { ...updated, status: "booked", statusHistory: [...updated.statusHistory, historyEntry("quoted", "booked", ctx, "Confirmed by PNR import")] };
  }

  const next = produce(state, (d) => {
    d.lines[updated.id] = updated;
    const df = d.files[file.id];
    df.travellerIds = unique([...df.travellerIds, ...updated.travellerIds]);
    df.updatedAt = at;
  });
  const summary = `${updated.description} updated from ${f.source === "amadeus" ? "Amadeus" : "pasted PNR"}${drift ? " — airline data differs from the issued ticket, review the changes" : ""}`;
  return ok(next, [makeAudit(ctx, "line.synced", "line", updated.id, summary, file.id)], { lineId: updated.id, created: false }, drift ? "Updated — some airline data differs, review the changes" : `${updated.description} updated`);
};
