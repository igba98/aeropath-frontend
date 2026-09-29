import type { Currency, DbState, ExternalRef, ID, LineDetailsByType, LineType, Money, Settings } from "@/domain/types";
import type { AddServiceLinePricing } from "@/domain/commands/addServiceLine";
import { addServiceLine, importFromProvider, updateBookingFile, upsertTraveller } from "@/domain/commands";
import { draftTravellerFromPnr, snapshotToFlightDetails } from "@/providers/mappers/pnr-to-flight-line";
import type { PnrSnapshot } from "@/providers/types";
import type { useApp } from "@/store";

type Dispatch = ReturnType<typeof useApp.getState>["dispatch"];

/**
 * A service line not yet saved: what the line drawer produces in the new-booking wizard,
 * and what it commits straight away on an existing booking.
 */
export interface LineDraft {
  key: string;
  type: LineType;
  supplierId?: ID;
  travellerIds: ID[];
  details: LineDetailsByType[LineType];
  pricing: AddServiceLinePricing;
  status: "quoted" | "booked";
  source: "manual" | "amadeus";
  external?: ExternalRef;
  notes?: string;
  overrideReason?: string;
  /** Flights from a PNR: the parsed snapshot and pnrPaxNo → traveller (or "new"). */
  pnr?: {
    snapshot: PnrSnapshot;
    map: Record<number, ID | "new">;
    fetched: boolean;
    /** Fare typed by the agent when the PNR has no priced FA lines yet (from the Amadeus pricing). */
    fare?: import("@/domain/types").FlightDetails["fare"];
  };
  /** For the wizard's running list. */
  summary: { description: string; sell: Money; cost: Money; margin: Money; vat: Money; serviceFee: Money; markup: Money };
}

export function pnrExternal(s: PnrSnapshot, fetched: boolean, now: Date): ExternalRef {
  return {
    provider: "amadeus",
    officeId: s.officeId,
    recordLocator: s.recordLocator,
    externalIds: {},
    rawPayload: s.raw,
    ...(fetched ? { lastSyncedAt: now.toISOString(), syncStatus: "ok" as const } : {}),
  };
}

/**
 * Save a draft onto a booking file. Creates travellers for "new" PNR passengers, adds them to the
 * file, then imports the PNR (idempotent) or adds the line. Returns the line id, or null on failure
 * (the failing command already toasted its reason).
 */
export function commitLineDraft(
  dispatch: Dispatch,
  getDb: () => DbState,
  fileId: ID,
  draft: LineDraft,
  opts?: { lineId?: ID; quiet?: boolean },
): ID | null {
  const db = getDb();
  const file = db.files[fileId];
  if (!file) return null;

  if (draft.type === "flight" && draft.pnr) {
    const { snapshot, map } = draft.pnr;
    const travellerMap: Record<number, ID> = {};
    const created: ID[] = [];
    for (const p of snapshot.passengers) {
      const m = map[p.pnrPaxNo];
      if (m && m !== "new") {
        travellerMap[p.pnrPaxNo] = m;
        continue;
      }
      const r = dispatch(upsertTraveller, { traveller: draftTravellerFromPnr(p, file.clientId) }, { toast: false });
      if (!r.ok) return null;
      const id = (r.result as { travellerId: ID }).travellerId;
      travellerMap[p.pnrPaxNo] = id;
      created.push(id);
    }
    const need = Object.values(travellerMap).filter((id) => !getDb().files[fileId].travellerIds.includes(id));
    if (need.length) {
      const r = dispatch(updateBookingFile, { fileId, patch: { travellerIds: [...getDb().files[fileId].travellerIds, ...need] } }, { toast: false });
      if (!r.ok) return null;
    }
    const settings: Settings = getDb().settings;
    const details = snapshotToFlightDetails(snapshot, { travellerMap, airlines: settings.airlines });
    if (draft.pnr.fare && details.fare.totalFare.amountMinor === 0) details.fare = draft.pnr.fare;
    const cur: Currency = details.fare.currency;
    const r = dispatch(
      importFromProvider,
      {
        fileId,
        lineId: opts?.lineId,
        details,
        external: pnrExternal(snapshot, draft.pnr.fetched, new Date()),
        source: draft.pnr.fetched ? "amadeus" : "manual",
        supplierId: draft.supplierId,
        pricing: {
          markup: { amountMinor: draft.pricing.markup.amountMinor, currency: cur },
          serviceFee: draft.pricing.serviceFee ? { amountMinor: draft.pricing.serviceFee.amountMinor, currency: cur } : undefined,
        },
      },
      { toast: opts?.quiet ? false : undefined },
    );
    if (!r.ok) return null;
    return (r.result as { lineId: ID }).lineId;
  }

  const need = draft.travellerIds.filter((id) => !file.travellerIds.includes(id));
  if (need.length) {
    const r = dispatch(updateBookingFile, { fileId, patch: { travellerIds: [...file.travellerIds, ...need] } }, { toast: false });
    if (!r.ok) return null;
  }
  const r = dispatch(
    addServiceLine,
    {
      fileId,
      type: draft.type,
      supplierId: draft.supplierId,
      travellerIds: draft.travellerIds,
      details: draft.details,
      pricing: draft.pricing,
      status: draft.status,
      source: draft.source,
      external: draft.external,
      notes: draft.notes,
      overrideReason: draft.overrideReason || undefined,
    },
    { toast: opts?.quiet ? false : undefined },
  );
  if (!r.ok) return null;
  return (r.result as { lineId: ID }).lineId;
}
