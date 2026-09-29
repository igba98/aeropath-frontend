import { z } from "zod";
import type { BookingFile, Command, Currency, FileSource, ID } from "../types";
import { makeAudit } from "../audit";
import { denied, fail, nowIso, ok, parse, produce, takeNumber, unique } from "./_helpers";
import { zCurrency, zId, zOptText, zTags } from "./_schemas";
import { checkTravellers } from "./_lines";

export interface CreateBookingFileInput {
  clientId: ID;
  /** Defaults to the client's name. */
  title?: string;
  currency: Currency;
  source: FileSource;
  travellerIds: ID[];
  notes?: string;
  tags?: string[];
  /** Defaults to the acting user. Another owner needs the reassign permission (Manager). */
  ownerId?: ID;
  /** Organisation bookings: the client's purchase order or reference number. */
  reference?: string;
  /** Organisation bookings: the department or cost centre charged. */
  costCentre?: string;
}

export interface CreateBookingFileResult {
  fileId: ID;
  number: string;
}

export const zFileSource = z.enum(["walk_in", "phone", "whatsapp", "email", "corporate"]);

const zOptShort = (label: string) =>
  z.preprocess((v) => (v === null || (typeof v === "string" && v.trim() === "") ? undefined : v), z.string().trim().max(80, `${label} must be at most 80 characters.`).optional());

const schema = z.object({
  clientId: zId,
  title: zOptText,
  currency: zCurrency,
  source: zFileSource,
  travellerIds: z.array(zId).default([]),
  notes: zOptText,
  tags: zTags,
  ownerId: z.preprocess((v) => (v === "" || v === null ? undefined : v), zId.optional()),
  reference: zOptShort("The PO or reference"),
  costCentre: zOptShort("The department or cost centre"),
});

export const createBookingFile: Command<CreateBookingFileInput, CreateBookingFileResult> = (state, input, ctx) => {
  const no = denied(ctx, "booking.create");
  if (no) return no;

  const parsed = parse(schema, input);
  if (!parsed.ok) return parsed;
  const f = parsed.data;

  const client = state.clients[f.clientId];
  if (!client) return fail("NOT_FOUND", "This client could not be found.", "clientId");
  if (client.archived) return fail("VALIDATION", `${client.name} is archived. Restore the client before creating a booking.`, "clientId");

  const ownerId = f.ownerId ?? ctx.user.id;
  if (ownerId !== ctx.user.id) {
    const noReassign = denied(ctx, "booking.reassign");
    if (noReassign) return { ...noReassign, error: { ...noReassign.error, field: "ownerId" } };
    const owner = state.users[ownerId];
    if (!owner || !owner.active) return fail("VALIDATION", "Choose an active staff member as the booking owner.", "ownerId");
  }
  const travellerIds = unique(f.travellerIds);
  const badTraveller = checkTravellers(state, travellerIds);
  if (badTraveller) return badTraveller;

  const { number, counters } = takeNumber(state, "file", ctx);
  const id = ctx.newId("fil");
  const at = nowIso(ctx);
  const file: BookingFile = {
    id,
    number,
    clientId: client.id,
    title: f.title ?? client.name,
    ownerId,
    currency: f.currency,
    source: f.source,
    travellerIds,
    tags: f.tags,
    createdAt: at,
    createdBy: ctx.user.id,
    updatedAt: at,
  };
  if (f.notes) file.notes = f.notes;
  if (f.reference) file.reference = f.reference;
  if (f.costCentre) file.costCentre = f.costCentre;

  const next = produce(state, (d) => {
    d.files[id] = file;
    d.counters = counters;
  });
  return ok(next, [makeAudit(ctx, "file.created", "file", id, `Booking ${number} created for ${client.name}`, id)], { fileId: id, number }, `Booking ${number} created`);
};
