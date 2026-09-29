import { z } from "zod";
import type { Command, ID, Traveller } from "../types";
import { makeAudit } from "../audit";
import { darToday } from "../dates";
import { travellerDisplayName } from "../describe";
import { AIRLINE_RE, normaliseName, TRAVELLER_NAME_RE } from "../validation";
import { denied, fail, ok, parse, produce } from "./_helpers";
import { zId, zOptEmail, zOptISODate, zOptPhone } from "./_schemas";

export interface UpsertTravellerInput {
  traveller: Omit<Traveller, "id" | "frequentFlyer"> & { id?: ID; frequentFlyer?: { airline: string; number: string }[] };
}

export interface UpsertTravellerResult {
  travellerId: ID;
}

const zName = (label: string) =>
  z
    .string({ required_error: `${label} is required.` })
    .transform(normaliseName)
    .pipe(z.string().min(1, `${label} is required.`).regex(TRAVELLER_NAME_RE, `${label}: use letters, spaces, hyphens and apostrophes only, as in the passport.`));

const zCountry = z.preprocess(
  (v) => (typeof v === "string" && v.trim() === "" ? undefined : v),
  z
    .string()
    .transform((s) => s.trim().toUpperCase())
    .pipe(z.string().regex(/^[A-Z]{2}$/, "Use the 2-letter country code, e.g. TZ."))
    .optional(),
);

const travellerSchema = z.object({
  id: z.preprocess((v) => (v === "" || v === null ? undefined : v), zId.optional()),
  clientId: zId,
  title: z.enum(["MR", "MRS", "MS", "MSTR", "MISS"]),
  givenName: zName("Given name"),
  surname: zName("Surname"),
  paxType: z.enum(["ADT", "CHD", "INF"]).default("ADT"),
  dateOfBirth: zOptISODate,
  gender: z.preprocess((v) => (v === "" || v === null ? undefined : v), z.enum(["M", "F"]).optional()),
  nationality: zCountry,
  passportNumber: z.preprocess((v) => (typeof v === "string" ? v.replace(/\s/g, "").toUpperCase() || undefined : v), z.string().optional()),
  passportExpiry: zOptISODate,
  passportCountry: zCountry,
  frequentFlyer: z
    .array(
      z.object({
        airline: z
          .string()
          .transform((s) => s.trim().toUpperCase())
          .pipe(z.string().regex(AIRLINE_RE, "Airline codes have 2 letters or digits, e.g. EK.")),
        number: z.string().trim().min(1, "Frequent flyer number is required."),
      }),
    )
    .default([]),
  phone: zOptPhone,
  email: zOptEmail,
});

export const upsertTraveller: Command<UpsertTravellerInput, UpsertTravellerResult> = (state, input, ctx) => {
  const no = denied(ctx, "traveller.edit");
  if (no) return no;

  const parsed = parse(travellerSchema, input?.traveller, "traveller");
  if (!parsed.ok) return parsed;
  const f = parsed.data;

  if (!state.clients[f.clientId]) return fail("NOT_FOUND", "The client for this traveller could not be found.", "traveller.clientId");
  const existing = f.id ? state.travellers[f.id] : undefined;
  if (f.id && !existing) return fail("NOT_FOUND", "This traveller could not be found.", "traveller.id");
  if (f.dateOfBirth && f.dateOfBirth > darToday(ctx.now)) return fail("VALIDATION", "Date of birth cannot be in the future.", "traveller.dateOfBirth");

  const id = existing?.id ?? ctx.newId("trv");
  const t: Traveller = { id, clientId: f.clientId, title: f.title, givenName: f.givenName, surname: f.surname, paxType: f.paxType, frequentFlyer: f.frequentFlyer };
  const optional = ["dateOfBirth", "gender", "nationality", "passportNumber", "passportExpiry", "passportCountry", "phone", "email"] as const;
  for (const k of optional) if (f[k] !== undefined) (t as unknown as Record<string, unknown>)[k] = f[k];

  const next = produce(state, (d) => {
    d.travellers[id] = t;
  });
  const name = travellerDisplayName(t);
  const audit = makeAudit(ctx, existing ? "traveller.updated" : "traveller.created", "traveller", id, `Traveller ${name} ${existing ? "updated" : "added"}`);
  return ok(next, [audit], { travellerId: id }, existing ? `${name} saved` : `${name} added`);
};
