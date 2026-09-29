import { z } from "zod";
import type { Command, Currency, FileSource, ID } from "../types";
import { makeAudit } from "../audit";
import { travellerDisplayName } from "../describe";
import { fxToFileFor } from "../pricing";
import { isActiveStatus } from "../status/line-statuses";
import { denied, fail, nowIso, ok, parse, produce, unique } from "./_helpers";
import { zCurrency, zId, zTags, zText } from "./_schemas";
import { checkTravellers } from "./_lines";
import { zFileSource } from "./createBookingFile";

export interface UpdateBookingFileInput {
  fileId: ID;
  patch: {
    title?: string;
    /** "" clears the notes. */
    notes?: string;
    tags?: string[];
    travellerIds?: ID[];
    currency?: Currency;
    source?: FileSource;
    /** Client's PO or reference number; "" clears it. */
    reference?: string;
    /** Department or cost centre; "" clears it. */
    costCentre?: string;
  };
}

const patchSchema = z.object({
  title: zText("Title").optional(),
  notes: z.string().trim().optional(),
  tags: zTags.optional(),
  travellerIds: z.array(zId).optional(),
  currency: zCurrency.optional(),
  source: zFileSource.optional(),
  reference: z.string().trim().max(80, "Keep the reference under 80 characters.").optional(),
  costCentre: z.string().trim().max(80, "Keep the department under 80 characters.").optional(),
});

export const updateBookingFile: Command<UpdateBookingFileInput> = (state, input, ctx) => {
  const no = denied(ctx, "booking.edit");
  if (no) return no;
  const file = state.files[input?.fileId];
  if (!file) return fail("NOT_FOUND", "This booking could not be found.", "fileId");
  if (file.cancelledAt) return fail("CONFLICT", `Booking ${file.number} is cancelled and can no longer be edited.`);

  const parsed = parse(patchSchema, input.patch ?? {}, "patch");
  if (!parsed.ok) return parsed;
  const p = parsed.data;
  const lines = Object.values(state.lines).filter((l) => l.fileId === file.id);

  let travellerIds = file.travellerIds;
  if (p.travellerIds) {
    travellerIds = unique(p.travellerIds);
    const bad = checkTravellers(state, travellerIds, "patch.travellerIds");
    if (bad) return bad;
    for (const removed of file.travellerIds.filter((id) => !travellerIds.includes(id))) {
      const onLine = lines.find((l) => isActiveStatus(l.status) && l.travellerIds.includes(removed));
      if (onLine) {
        const t = state.travellers[removed];
        return fail("CONFLICT", `${t ? travellerDisplayName(t) : "This traveller"} is on ${onLine.description}. Remove them from that service first.`, "patch.travellerIds");
      }
    }
  }

  const currencyChanged = p.currency !== undefined && p.currency !== file.currency;
  if (currencyChanged) {
    const paid = Object.values(state.payments).some((pay) => pay.status !== "reversed" && pay.allocations.some((a) => a.fileId === file.id));
    if (paid) return fail("CONFLICT", `Booking ${file.number} already has payments in ${file.currency}. Reverse them before changing the booking currency.`, "patch.currency");
  }

  const at = nowIso(ctx);
  const changed: string[] = [];
  const next = produce(state, (d) => {
    const f = d.files[file.id];
    if (p.title !== undefined && p.title !== f.title) {
      f.title = p.title;
      changed.push("title");
    }
    if (p.notes !== undefined) {
      if (p.notes) f.notes = p.notes;
      else delete f.notes;
      changed.push("notes");
    }
    if (p.tags) {
      f.tags = p.tags;
      changed.push("tags");
    }
    if (p.travellerIds) {
      f.travellerIds = travellerIds;
      changed.push("travellers");
    }
    if (p.source && p.source !== f.source) {
      f.source = p.source;
      changed.push("source");
    }
    if (p.reference !== undefined && p.reference !== (f.reference ?? "")) {
      if (p.reference) f.reference = p.reference;
      else delete f.reference;
      changed.push("reference");
    }
    if (p.costCentre !== undefined && p.costCentre !== (f.costCentre ?? "")) {
      if (p.costCentre) f.costCentre = p.costCentre;
      else delete f.costCentre;
      changed.push("cost centre");
    }
    if (currencyChanged) {
      f.currency = p.currency!;
      changed.push("currency");
      // Re-capture each line's rate into the new file currency at today's settings rate.
      for (const l of lines) {
        const fx = fxToFileFor(l.pricing.currency, f.currency, state.settings.fx.USD_TZS);
        const dl = d.lines[l.id];
        if (fx === undefined) delete dl.pricing.fxToFile;
        else dl.pricing.fxToFile = fx;
      }
    }
    f.updatedAt = at;
  });
  return ok(next, [makeAudit(ctx, "file.updated", "file", file.id, `Booking ${file.number} updated (${changed.join(", ") || "no changes"})`, file.id)], undefined, "Booking saved");
};
