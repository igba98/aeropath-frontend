import { z } from "zod";
import type { Client, ClientContact, ClientSource, Command, Ctx, Currency, ID, ISODate, Money, OrgType, TravelPolicy } from "../types";
import { makeAudit } from "../audit";
import { darToday } from "../dates";
import { denied, fail, nowIso, ok, parse, produce, type Fail } from "./_helpers";
import { zCurrency, zId, zMoneyNonNeg, zOptEmail, zOptISODate, zOptPhone, zOptText, zPhone, zTags, zText } from "./_schemas";

export { normalisePhone } from "../validation";

/** A contact as entered; ids are assigned by the command (ctx.newId("cct")), existing ones are kept on update. */
export interface ClientContactInput {
  id?: ID;
  name: string;
  role?: string;
  phone?: string;
  email?: string;
  primary?: boolean;
  canBook?: boolean;
}

export interface CreateClientInput {
  type: "individual" | "corporate";
  name: string;
  phone: string;
  email?: string;
  address?: string;
  tin?: string;
  vrn?: string;
  /** Organisations with contacts: set from the primary contact. */
  contactPerson?: string;
  /** Manager only. */
  creditLimit?: Money;
  /** Manager only. */
  paymentTermsDays?: number;
  defaultCurrency: Currency;
  source?: ClientSource;
  notes?: string;
  tags?: string[];
  // Where they are (both kinds)
  postalAddress?: string;
  city?: string;
  region?: string;
  /** ISO-3166 alpha-2; uppercased. */
  country?: string;
  // Organisations
  orgType?: OrgType;
  sector?: string;
  registrationNumber?: string;
  /** "www.acme.co.tz" is saved as "https://www.acme.co.tz". */
  website?: string;
  billingEmail?: string;
  contacts?: ClientContactInput[];
  departments?: string[];
  travelPolicy?: TravelPolicy;
  poRequired?: boolean;
  // Individuals
  dateOfBirth?: ISODate;
  gender?: "M" | "F";
  nationality?: string;
  idType?: Client["idType"];
  idNumber?: string;
  occupation?: string;
  employer?: string;
  emergencyContact?: { name: string; phone: string; relation?: string };
  preferences?: { seat?: "window" | "aisle" | "any"; meal?: string; notes?: string };
}

export interface CreateClientResult {
  clientId: ID;
}

const nullToUndefined = (v: unknown) => (v === null ? undefined : v);
const blankToUndefined = (v: unknown) => (v === null || (typeof v === "string" && v.trim() === "") ? undefined : v);
const opt = <T extends z.ZodTypeAny>(s: T) => z.preprocess(blankToUndefined, s.optional());
const optFlag = z.preprocess(nullToUndefined, z.boolean().optional());

const zCountry = z
  .string()
  .transform((s) => s.trim().toUpperCase())
  .pipe(z.string().regex(/^[A-Z]{2}$/, "Use the 2-letter country code, e.g. TZ."));

const zWebsite = z
  .string()
  .transform((s) => {
    const t = s.trim();
    return /^https?:\/\//i.test(t) ? t : `https://${t}`;
  })
  .pipe(z.string().regex(/^https?:\/\/[^\s/.]+(\.[^\s/.]+)+(\/\S*)?$/i, "Enter a web address like www.company.co.tz."));

const zContact = z.object({
  id: opt(zId),
  name: zText("Contact name").pipe(z.string().max(120, "Contact name is too long.")),
  role: zOptText,
  phone: zOptPhone,
  email: zOptEmail,
  primary: optFlag,
  canBook: optFlag,
});

const zTravelPolicy = z
  .object({
    cabin: z.enum(["economy", "premium_economy", "business"]).default("economy"),
    approvalRequired: z.boolean().default(false),
    approver: zOptText,
    notes: zOptText,
  })
  .refine((p) => !p.approvalRequired || Boolean(p.approver), { message: "Name who approves bookings, or turn approval off.", path: ["approver"] });

const zEmergency = z.object({
  name: zText("Emergency contact name"),
  phone: zPhone,
  relation: zOptText,
});

const zPreferences = z.object({
  seat: opt(z.enum(["window", "aisle", "any"])),
  meal: zOptText,
  notes: zOptText,
});

const NIDA_DIGITS = 20;
const digitsOf = (s: string) => s.replace(/\D/g, "");

export const clientSchema = z
  .object({
    type: z.enum(["individual", "corporate"]),
    name: zText("Name").pipe(z.string().max(120, "Name is too long.")),
    phone: zPhone,
    email: zOptEmail,
    address: zOptText,
    tin: zOptText,
    vrn: zOptText,
    contactPerson: zOptText,
    creditLimit: z.preprocess(nullToUndefined, zMoneyNonNeg.optional()),
    paymentTermsDays: z.preprocess(nullToUndefined, z.number().int().min(0, "Payment terms cannot be negative.").max(365, "Payment terms must be at most 365 days.").optional()),
    defaultCurrency: zCurrency.default("TZS"),
    source: z.preprocess(nullToUndefined, z.enum(["walk_in", "phone", "whatsapp", "email", "referral"]).optional()),
    notes: zOptText,
    tags: zTags,
    postalAddress: zOptText,
    city: zOptText,
    region: zOptText,
    country: opt(zCountry),
    orgType: opt(z.enum(["company", "government", "ngo", "embassy", "education", "other"])),
    sector: zOptText,
    registrationNumber: z.preprocess(blankToUndefined, z.string().trim().toUpperCase().optional()),
    website: opt(zWebsite),
    billingEmail: zOptEmail,
    contacts: z.preprocess(nullToUndefined, z.array(zContact).max(50, "Add up to 50 contacts.").optional()),
    departments: z.preprocess(nullToUndefined, z.array(z.string().trim().min(1, "Department names cannot be blank.").max(60, "Keep department names under 60 characters.")).max(100).optional()),
    travelPolicy: z.preprocess(nullToUndefined, zTravelPolicy.optional()),
    poRequired: optFlag,
    dateOfBirth: zOptISODate,
    gender: opt(z.enum(["M", "F"])),
    nationality: opt(zCountry),
    idType: opt(z.enum(["nida", "passport", "driving_licence", "voter_id"])),
    idNumber: z.preprocess(blankToUndefined, z.string().trim().toUpperCase().optional()),
    occupation: zOptText,
    employer: zOptText,
    emergencyContact: z.preprocess(nullToUndefined, zEmergency.optional()),
    preferences: z.preprocess(nullToUndefined, zPreferences.optional()),
  })
  .superRefine((c, ctx) => {
    if (c.type === "individual" && (c.creditLimit !== undefined || c.paymentTermsDays !== undefined)) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Credit limits and payment terms are for organisations only.", path: ["creditLimit"] });
    }
    if (c.type === "individual" && c.idNumber) {
      if (!c.idType) ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Choose the ID type for this ID number.", path: ["idType"] });
      else if (c.idType === "nida" && digitsOf(c.idNumber).length !== NIDA_DIGITS) ctx.addIssue({ code: z.ZodIssueCode.custom, message: "A NIDA number has 20 digits.", path: ["idNumber"] });
    }
  });

export type ClientFields = z.output<typeof clientSchema>;

/** NIDA numbers are kept in their printed form: 19900101-12345-00001-12. */
export function formatNida(input: string): string {
  const d = digitsOf(input);
  if (d.length !== NIDA_DIGITS) return input.trim().toUpperCase();
  return `${d.slice(0, 8)}-${d.slice(8, 13)}-${d.slice(13, 18)}-${d.slice(18)}`;
}

const COMMON_KEYS = ["email", "address", "tin", "vrn", "contactPerson", "creditLimit", "paymentTermsDays", "source", "notes", "postalAddress", "city", "region", "country"] as const;
const ORG_KEYS = ["orgType", "sector", "registrationNumber", "website", "billingEmail", "travelPolicy"] as const;
const PERSON_KEYS = ["dateOfBirth", "gender", "nationality", "idType", "idNumber", "occupation", "employer", "emergencyContact"] as const;

/** Contacts with ids (existing ids kept, new ones from newId) and exactly one primary: the first marked, else the first. */
function contactsFrom(list: NonNullable<ClientFields["contacts"]>, newId: (prefix: string) => ID, existing: ClientContact[] = []): ClientContact[] {
  const known = new Set(existing.map((c) => c.id));
  const used = new Set<ID>();
  const primary = Math.max(
    0,
    list.findIndex((k) => k.primary),
  );
  return list.map((k, i) => {
    const id = k.id && known.has(k.id) && !used.has(k.id) ? k.id : newId("cct");
    used.add(id);
    const c: ClientContact = { id, name: k.name };
    if (k.role) c.role = k.role;
    if (k.phone) c.phone = k.phone;
    if (k.email) c.email = k.email;
    if (i === primary) c.primary = true;
    if (k.canBook) c.canBook = true;
    return c;
  });
}

/** Trimmed, without repeats (ignoring case), in the order entered. */
function uniqueNames(list: string[]): string[] {
  const seen = new Set<string>();
  return list.filter((d) => {
    const k = d.toLowerCase();
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}

/**
 * Builds a Client record from validated fields, leaving out empty optionals and the fields that belong to the other
 * kind of client (so switching an organisation to an individual drops its contacts and policy).
 */
export function clientFromFields(
  id: ID,
  f: ClientFields,
  base: Pick<Client, "createdAt" | "createdBy" | "archived">,
  ids: { newId: (prefix: string) => ID; existingContacts?: ClientContact[] },
): Client {
  const c: Client = { id, type: f.type, name: f.name, phone: f.phone, defaultCurrency: f.defaultCurrency, tags: f.tags, ...base };
  const rec = c as unknown as Record<string, unknown>;
  const copy = (keys: readonly (keyof ClientFields)[]) => {
    for (const k of keys) if (f[k] !== undefined) rec[k] = f[k];
  };
  copy(COMMON_KEYS);
  if (f.type === "corporate") {
    copy(ORG_KEYS);
    if (f.poRequired) c.poRequired = true;
    if (f.contacts?.length) {
      c.contacts = contactsFrom(f.contacts, ids.newId, ids.existingContacts);
      c.contactPerson = c.contacts.find((x) => x.primary)!.name;
    }
    const departments = uniqueNames(f.departments ?? []);
    if (departments.length) c.departments = departments;
  } else {
    copy(PERSON_KEYS);
    if (c.idType === "nida" && c.idNumber) c.idNumber = formatNida(c.idNumber);
    const p = f.preferences;
    if (p && (p.seat || p.meal || p.notes)) {
      c.preferences = {};
      if (p.seat) c.preferences.seat = p.seat;
      if (p.meal) c.preferences.meal = p.meal;
      if (p.notes) c.preferences.notes = p.notes;
    }
  }
  return c;
}

/** Rules that need the clock: a date of birth cannot be in the future. */
export function checkClientDates(f: ClientFields, ctx: Pick<Ctx, "now">): Fail | null {
  if (f.type === "individual" && f.dateOfBirth && f.dateOfBirth > darToday(ctx.now)) return fail("VALIDATION", "Date of birth cannot be in the future.", "dateOfBirth");
  return null;
}

export const createClient: Command<CreateClientInput, CreateClientResult> = (state, input, ctx) => {
  const no = denied(ctx, "client.create");
  if (no) return no;

  const parsed = parse(clientSchema, input);
  if (!parsed.ok) return parsed;
  const f = parsed.data;

  if (f.creditLimit !== undefined || f.paymentTermsDays !== undefined) {
    const noCredit = denied(ctx, "client.set_credit");
    if (noCredit) return { ...noCredit, error: { ...noCredit.error, field: f.creditLimit !== undefined ? "creditLimit" : "paymentTermsDays" } };
  }
  if (!f.name.trim()) return fail("VALIDATION", "Name is required.", "name");
  const badDate = checkClientDates(f, ctx);
  if (badDate) return badDate;

  const id = ctx.newId("cli");
  const client = clientFromFields(id, f, { createdAt: nowIso(ctx), createdBy: ctx.user.id, archived: false }, { newId: ctx.newId });
  const next = produce(state, (d) => {
    d.clients[id] = client;
  });
  const kind = f.type === "corporate" ? "Organisation" : "Client";
  return ok(next, [makeAudit(ctx, "client.created", "client", id, `${kind} ${client.name} created`)], { clientId: id }, `${client.name} added`);
};
