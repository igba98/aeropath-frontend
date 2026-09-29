import type { Client, ClientSource, Currency, ID, ISODate, OrgType, PaxType, Title, Traveller, TravelPolicy } from "@/domain/types";
import type { CreateClientInput } from "@/domain/commands/createClient";
import type { ClientPatch } from "@/domain/commands/updateClient";
import type { UpsertTravellerInput } from "@/domain/commands/upsertTraveller";
import { normaliseName, normalisePhone, TRAVELLER_NAME_RE } from "@/domain/validation";

/**
 * The client stepper's working copy (plain strings, like the inputs) and the pure rules around it:
 * which steps a kind of client has, per-step checks, and turning the draft into command inputs.
 */

export type ClientKind = Client["type"];
export type StepId = "type" | "personal" | "contact" | "travel" | "billing" | "org" | "address" | "people" | "policy" | "review";
export type Errors = Record<string, string>;

export const PERSON_STEPS: StepId[] = ["type", "personal", "contact", "travel", "billing", "review"];
export const ORG_STEPS: StepId[] = ["type", "org", "address", "people", "policy", "review"];
export const stepsFor = (type: ClientKind | ""): StepId[] => (type === "corporate" ? ORG_STEPS : PERSON_STEPS);

export const STEP_META: Record<StepId, { rail: string; title: string; description: string }> = {
  type: { rail: "Type", title: "Who is the client?", description: "A person booking for themselves, or an organisation that books for its people." },
  personal: { rail: "Personal", title: "Personal details", description: "Names as in the passport or national ID, so tickets match." },
  contact: { rail: "Contact", title: "Contact and address", description: "How we reach them, and where invoices are addressed." },
  travel: { rail: "Travel", title: "Travel documents and preferences", description: "Saved as the client's own traveller, ready for the next booking." },
  billing: { rail: "Billing", title: "Billing", description: "How their invoices are made out." },
  org: { rail: "Details", title: "Organisation details", description: "The legal name and numbers printed on invoices and receipts." },
  address: { rail: "Address", title: "Address and billing", description: "Where they are, and where invoices and statements go." },
  people: { rail: "People", title: "People", description: "Who books, approves and pays. The primary contact is the one we call first." },
  policy: { rail: "Policy", title: "Travel policy and account", description: "Rules every booking for this organisation follows." },
  review: { rail: "Review", title: "Review", description: "Check the details, then save. You can change anything later." },
};

export interface ContactDraft {
  /** Stable key for React lists; not saved. */
  key: string;
  id?: ID;
  name: string;
  role: string;
  phone: string;
  email: string;
  primary: boolean;
  canBook: boolean;
}

export interface ProfileDraft {
  type: ClientKind | "";
  // Shared
  phone: string;
  email: string;
  address: string;
  city: string;
  region: string;
  country: string;
  tin: string;
  defaultCurrency: Currency;
  source: ClientSource | "";
  notes: string;
  // Organisation
  orgType: OrgType | "";
  sector: string;
  legalName: string;
  registrationNumber: string;
  vrn: string;
  website: string;
  postalAddress: string;
  billingEmail: string;
  contacts: ContactDraft[];
  departments: string[];
  cabin: TravelPolicy["cabin"];
  approvalRequired: boolean;
  approver: string;
  policyNotes: string;
  poRequired: boolean;
  creditLimitMinor: number | null;
  paymentTermsDays: string;
  // Individual
  title: Title | "";
  firstName: string;
  lastName: string;
  gender: "" | "M" | "F";
  dateOfBirth: string;
  nationality: string;
  idType: NonNullable<Client["idType"]> | "";
  idNumber: string;
  occupation: string;
  employer: string;
  passportNumber: string;
  passportExpiry: string;
  passportCountry: string;
  seat: "" | "window" | "aisle" | "any";
  meal: string;
  travelNotes: string;
  emergencyName: string;
  emergencyPhone: string;
  emergencyRelation: string;
  /** The client's own traveller record, when there is one. */
  selfTravellerId?: ID;
}

/** Quick details carried over from a short form (checkout, a search). */
export interface ClientSeed {
  type?: ClientKind;
  name?: string;
  phone?: string;
  email?: string;
}

let contactSerial = 0;
export function blankContact(primary = false): ContactDraft {
  contactSerial += 1;
  return { key: `new-${contactSerial}`, name: "", role: "", phone: "", email: "", primary, canBook: primary };
}

/** Split "Peter John Mwakalinga" into first names and the last word; `givenWords` follows a known passport split. */
export function splitFullName(full: string, givenWords?: number): { first: string; last: string } {
  const parts = full.trim().split(/\s+/).filter(Boolean);
  if (parts.length < 2) return { first: parts[0] ?? "", last: "" };
  const n = givenWords && givenWords < parts.length ? givenWords : parts.length - 1;
  return { first: parts.slice(0, n).join(" "), last: parts.slice(n).join(" ") };
}

export const fullName = (first: string, last: string): string => `${first} ${last}`.trim().replace(/\s+/g, " ");

/** The traveller record that is the client themself: same name as the client. */
export function findSelfTraveller(client: Client, travellers: Traveller[]): Traveller | undefined {
  const name = normaliseName(client.name);
  return travellers.find((t) => t.clientId === client.id && normaliseName(`${t.givenName} ${t.surname}`) === name);
}

const s = (v?: string | number | null) => (v === undefined || v === null ? "" : String(v));

/** The stepper asks for the box number only: "P.O. Box 1234" ⇄ "1234". */
export const stripPoBox = (v?: string) => s(v).replace(/^\s*P\.?\s*O\.?\s*Box\s*/i, "");
export const withPoBox = (v: string): string | undefined => {
  const box = stripPoBox(v).trim();
  return box ? `P.O. Box ${box}` : undefined;
};

export function profileDraftFrom(c?: Client, self?: Traveller, seed?: ClientSeed): ProfileDraft {
  const corp = c?.type === "corporate";
  const seedName = seed?.name?.trim() ?? "";
  const personName = c && !corp ? splitFullName(c.name, self ? self.givenName.split(/\s+/).length : undefined) : splitFullName(seedName);
  const contacts: ContactDraft[] = (c?.contacts ?? []).map((k) => ({
    key: k.id,
    id: k.id,
    name: k.name,
    role: s(k.role),
    phone: s(k.phone),
    email: s(k.email),
    primary: Boolean(k.primary),
    canBook: Boolean(k.canBook),
  }));
  // Organisations saved before contacts existed: their contact person becomes the first contact.
  if (corp && !contacts.length && c?.contactPerson) contacts.push({ ...blankContact(true), name: c.contactPerson, phone: c.phone });
  return {
    type: c?.type ?? seed?.type ?? "",
    phone: c?.phone ?? seed?.phone ?? "",
    email: c?.email ?? seed?.email ?? "",
    address: s(c?.address),
    city: s(c?.city),
    region: s(c?.region),
    country: c ? s(c.country) : "TZ",
    tin: s(c?.tin),
    defaultCurrency: c?.defaultCurrency ?? "TZS",
    source: c?.source ?? "",
    notes: s(c?.notes),
    orgType: c?.orgType ?? "",
    sector: s(c?.sector),
    legalName: corp ? c!.name : seedName,
    registrationNumber: s(c?.registrationNumber),
    vrn: s(c?.vrn),
    website: s(c?.website).replace(/^https?:\/\//i, ""),
    postalAddress: stripPoBox(c?.postalAddress),
    billingEmail: s(c?.billingEmail),
    contacts: contacts.length || c ? contacts : [blankContact(true)],
    departments: c?.departments ?? [],
    cabin: c?.travelPolicy?.cabin ?? "economy",
    approvalRequired: c?.travelPolicy?.approvalRequired ?? false,
    approver: s(c?.travelPolicy?.approver),
    policyNotes: s(c?.travelPolicy?.notes),
    poRequired: Boolean(c?.poRequired),
    creditLimitMinor: c?.creditLimit?.amountMinor ?? null,
    paymentTermsDays: s(c?.paymentTermsDays),
    title: self?.title ?? "",
    firstName: personName.first,
    lastName: personName.last,
    gender: c?.gender ?? self?.gender ?? "",
    dateOfBirth: c?.dateOfBirth ?? self?.dateOfBirth ?? "",
    nationality: c ? (c.nationality ?? self?.nationality ?? "") : "TZ",
    idType: c?.idType ?? "",
    idNumber: s(c?.idNumber),
    occupation: s(c?.occupation),
    employer: s(c?.employer),
    passportNumber: s(self?.passportNumber),
    passportExpiry: s(self?.passportExpiry),
    passportCountry: c ? s(self?.passportCountry) : "TZ",
    seat: c?.preferences?.seat ?? "",
    meal: s(c?.preferences?.meal),
    travelNotes: s(c?.preferences?.notes),
    emergencyName: s(c?.emergencyContact?.name),
    emergencyPhone: s(c?.emergencyContact?.phone),
    emergencyRelation: s(c?.emergencyContact?.relation),
    selfTravellerId: self?.id,
  };
}

// ───────────────────────────── Checks ─────────────────────────────

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const CODE_RE = /^[A-Za-z]{2}$/;
const PASSPORT_RE = /^[A-Z0-9]{5,12}$/;
const WEBSITE_RE = /^(https?:\/\/)?[^\s/.]+(\.[^\s/.]+)+(\/\S*)?$/i;
const PHONE_MSG = "Enter a phone number like 0754 123 456 or +255 754 123 456.";

export interface CheckOpts {
  /** Dar calendar date, "YYYY-MM-DD". */
  today: ISODate;
  mode: "create" | "edit";
  canSetCredit: boolean;
}

/** An individual's own traveller record is written when creating, or when it exists or passport details are given. */
export const writesSelfTraveller = (d: ProfileDraft, mode: CheckOpts["mode"]): boolean =>
  d.type === "individual" && (mode === "create" || Boolean(d.selfTravellerId) || Boolean(d.passportNumber.trim()));

function checkPhone(e: Errors, key: string, v: string, required: string | false) {
  if (!v.trim()) {
    if (required) e[key] = required;
  } else if (!normalisePhone(v)) e[key] = PHONE_MSG;
}
function checkEmail(e: Errors, key: string, v: string) {
  if (v.trim() && !EMAIL_RE.test(v.trim())) e[key] = "Check the email address.";
}
function checkCountry(e: Errors, key: string, v: string) {
  if (v.trim() && !CODE_RE.test(v.trim())) e[key] = "Pick a country from the list, or type its 2-letter code.";
}
function checkPassportName(e: Errors, key: string, v: string, label: string, strict: boolean) {
  if (!v.trim()) e[key] = `Enter the ${label}.`;
  else if (strict && !TRAVELLER_NAME_RE.test(normaliseName(v))) e[key] = "Letters, spaces, hyphens and apostrophes only, as in the passport.";
}

export function validateStep(step: StepId, d: ProfileDraft, o: CheckOpts): Errors {
  const e: Errors = {};
  switch (step) {
    case "type":
      if (!d.type) e.type = "Choose Individual or Organisation.";
      if (d.type === "corporate") {
        if (!d.orgType) e.orgType = "Choose the kind of organisation.";
        if (!d.sector) e.sector = "Choose the sector they work in.";
      }
      break;
    case "personal": {
      const strict = writesSelfTraveller(d, o.mode);
      if (strict && !d.title) e.title = "Choose a title for their tickets.";
      checkPassportName(e, "firstName", d.firstName, "first name", strict);
      checkPassportName(e, "lastName", d.lastName, "last name", strict);
      if (!e.firstName && !e.lastName && fullName(d.firstName, d.lastName).length > 120) e.lastName = "The full name is too long.";
      if (d.dateOfBirth && d.dateOfBirth > o.today) e.dateOfBirth = "Date of birth cannot be in the future.";
      checkCountry(e, "nationality", d.nationality);
      if (d.idNumber.trim() && !d.idType) e.idType = "Choose the ID type for this number.";
      if (d.idType && !d.idNumber.trim()) e.idNumber = "Enter the ID number, or set the ID type back to none.";
      if (d.idType === "nida" && d.idNumber.trim() && d.idNumber.replace(/\D/g, "").length !== 20) e.idNumber = "A NIDA number has 20 digits.";
      break;
    }
    case "contact":
      checkPhone(e, "phone", d.phone, "Enter a phone number so we can reach them.");
      checkEmail(e, "email", d.email);
      checkCountry(e, "country", d.country);
      break;
    case "travel": {
      const pp = d.passportNumber.replace(/\s/g, "").toUpperCase();
      if (pp && !PASSPORT_RE.test(pp)) e.passportNumber = "5 to 12 letters and numbers, as printed in the passport.";
      if (!pp && (d.passportExpiry || (d.passportCountry && d.passportCountry !== "TZ"))) e.passportNumber = "Add the passport number too, or clear the other passport fields.";
      checkCountry(e, "passportCountry", d.passportCountry);
      if (d.emergencyName.trim() || d.emergencyPhone.trim() || d.emergencyRelation.trim()) {
        if (!d.emergencyName.trim()) e.emergencyName = "Enter their name.";
        checkPhone(e, "emergencyPhone", d.emergencyPhone, "Enter their phone number.");
      }
      break;
    }
    case "billing":
      break;
    case "org":
      if (!d.legalName.trim()) e.legalName = "Enter the organisation's legal name.";
      else if (d.legalName.trim().length > 120) e.legalName = "The name is too long.";
      if (d.website.trim() && !WEBSITE_RE.test(d.website.trim())) e.website = "Enter a web address like www.company.co.tz.";
      break;
    case "address":
      checkPhone(e, "phone", d.phone, "Enter the main phone number.");
      checkEmail(e, "email", d.email);
      checkEmail(e, "billingEmail", d.billingEmail);
      checkCountry(e, "country", d.country);
      break;
    case "people":
      if (!d.contacts.length) e.contacts = "Add at least one contact person.";
      d.contacts.forEach((k, i) => {
        if (!k.name.trim()) e[`contacts.${i}.name`] = "Enter the contact's name.";
        checkPhone(e, `contacts.${i}.phone`, k.phone, false);
        checkEmail(e, `contacts.${i}.email`, k.email);
        if (!k.phone.trim() && !k.email.trim()) e[`contacts.${i}.phone`] = "Add a phone or an email so we can reach them.";
      });
      break;
    case "policy":
      if (d.approvalRequired && !d.approver.trim()) e.approver = "Name who approves bookings, or turn approval off.";
      if (o.canSetCredit && d.paymentTermsDays.trim() && !(/^\d{1,3}$/.test(d.paymentTermsDays.trim()) && Number(d.paymentTermsDays) <= 365)) e.paymentTermsDays = "Whole days, 0 to 365.";
      if (o.canSetCredit && d.creditLimitMinor !== null && d.creditLimitMinor < 0) e.creditLimit = "The credit limit cannot be negative.";
      break;
    case "review":
      break;
  }
  return e;
}

/** First step (in order) with a problem, for the final check before saving. */
export function firstInvalidStep(d: ProfileDraft, o: CheckOpts): { step: StepId; errors: Errors } | null {
  for (const step of stepsFor(d.type)) {
    const errors = validateStep(step, d, o);
    if (Object.keys(errors).length) return { step, errors };
  }
  return null;
}

/** Where a domain error field lives in the stepper: the draft key and its step. */
export function locateField(field: string | undefined, type: ClientKind | ""): { key: string; step: StepId } | null {
  if (!field) return null;
  const org = type === "corporate";
  const direct: Record<string, [string, StepId]> = {
    name: org ? ["legalName", "org"] : ["firstName", "personal"],
    phone: ["phone", org ? "address" : "contact"],
    email: ["email", org ? "address" : "contact"],
    country: ["country", org ? "address" : "contact"],
    billingEmail: ["billingEmail", "address"],
    website: ["website", "org"],
    dateOfBirth: ["dateOfBirth", "personal"],
    nationality: ["nationality", "personal"],
    idType: ["idType", "personal"],
    idNumber: ["idNumber", "personal"],
    "emergencyContact.name": ["emergencyName", "travel"],
    "emergencyContact.phone": ["emergencyPhone", "travel"],
    "travelPolicy.approver": ["approver", "policy"],
    creditLimit: ["creditLimit", "policy"],
    paymentTermsDays: ["paymentTermsDays", "policy"],
  };
  if (direct[field]) return { key: direct[field][0], step: direct[field][1] };
  const contact = /^contacts\.(\d+)\.(\w+)$/.exec(field);
  if (contact) return { key: `contacts.${contact[1]}.${contact[2]}`, step: "people" };
  if (field.startsWith("traveller.")) return { key: field.replace("traveller.", ""), step: org ? "people" : "travel" };
  return null;
}

// ───────────────────────────── To commands ─────────────────────────────

const t = (v: string) => v.trim() || undefined;
const code = (v: string) => t(v)?.toUpperCase();

export function draftToInput(d: ProfileDraft, o: { includeCredit: boolean }): CreateClientInput {
  const common = {
    phone: d.phone.trim(),
    email: t(d.email),
    address: t(d.address),
    city: t(d.city),
    region: t(d.region),
    country: code(d.country),
    tin: t(d.tin),
    defaultCurrency: d.defaultCurrency,
    source: d.source || undefined,
    notes: t(d.notes),
  };
  if (d.type === "corporate") {
    const input: CreateClientInput = {
      type: "corporate",
      name: d.legalName.trim(),
      ...common,
      vrn: t(d.vrn),
      postalAddress: withPoBox(d.postalAddress),
      orgType: d.orgType || undefined,
      sector: t(d.sector),
      registrationNumber: t(d.registrationNumber),
      website: t(d.website),
      billingEmail: t(d.billingEmail),
      contacts: d.contacts.map((k) => ({ id: k.id, name: k.name.trim(), role: t(k.role), phone: t(k.phone), email: t(k.email), primary: k.primary || undefined, canBook: k.canBook || undefined })),
      departments: d.departments.length ? d.departments : undefined,
      travelPolicy: { cabin: d.cabin, approvalRequired: d.approvalRequired, approver: d.approvalRequired ? t(d.approver) : undefined, notes: t(d.policyNotes) },
      poRequired: d.poRequired || undefined,
    };
    if (o.includeCredit) {
      if (d.creditLimitMinor !== null) input.creditLimit = { amountMinor: d.creditLimitMinor, currency: d.defaultCurrency };
      if (d.paymentTermsDays.trim()) input.paymentTermsDays = Number(d.paymentTermsDays);
    }
    return input;
  }
  const emergency = d.emergencyName.trim() || d.emergencyPhone.trim();
  const prefs = d.seat || d.meal.trim() || d.travelNotes.trim();
  return {
    type: "individual",
    name: fullName(d.firstName, d.lastName),
    ...common,
    dateOfBirth: t(d.dateOfBirth),
    gender: d.gender || undefined,
    nationality: code(d.nationality),
    idType: d.idType || undefined,
    idNumber: d.idType ? t(d.idNumber) : undefined,
    occupation: t(d.occupation),
    employer: t(d.employer),
    emergencyContact: emergency ? { name: d.emergencyName.trim(), phone: d.emergencyPhone.trim(), relation: t(d.emergencyRelation) } : undefined,
    preferences: prefs ? { seat: d.seat || undefined, meal: t(d.meal), notes: t(d.travelNotes) } : undefined,
  };
}

/** Every optional client field the stepper owns; left empty in the draft, it is cleared on save. */
const CLEARABLE: (keyof CreateClientInput)[] = [
  "email",
  "address",
  "tin",
  "vrn",
  "contactPerson",
  "source",
  "notes",
  "postalAddress",
  "city",
  "region",
  "country",
  "orgType",
  "sector",
  "registrationNumber",
  "website",
  "billingEmail",
  "contacts",
  "departments",
  "travelPolicy",
  "poRequired",
  "dateOfBirth",
  "gender",
  "nationality",
  "idType",
  "idNumber",
  "occupation",
  "employer",
  "emergencyContact",
  "preferences",
];

export function draftToPatch(d: ProfileDraft, o: { includeCredit: boolean }): ClientPatch {
  const input = draftToInput(d, o);
  const patch: Record<string, unknown> = { ...input };
  for (const k of CLEARABLE) if (patch[k] === undefined) patch[k] = null;
  // The primary contact becomes the contact person.
  if (d.type === "corporate") delete patch.contactPerson;
  if (o.includeCredit) {
    if (patch.creditLimit === undefined) patch.creditLimit = null;
    if (patch.paymentTermsDays === undefined) patch.paymentTermsDays = null;
  }
  return patch as ClientPatch;
}

/** Passenger type from the date of birth on the day of saving. */
export function paxTypeFor(dateOfBirth: string, today: ISODate): PaxType {
  if (!dateOfBirth) return "ADT";
  const [y, m, dd] = dateOfBirth.split("-").map(Number);
  const [ty, tm, td] = today.split("-").map(Number);
  const age = ty - y - (tm < m || (tm === m && td < dd) ? 1 : 0);
  return age < 2 ? "INF" : age < 12 ? "CHD" : "ADT";
}

/**
 * The client's own traveller record from an individual's draft, or null when nothing needs writing.
 * Keeps what the stepper doesn't edit (frequent flyer numbers, contact details) from the existing record.
 */
export function selfTravellerInput(d: ProfileDraft, clientId: ID, o: Pick<CheckOpts, "today" | "mode">, existing?: Traveller): UpsertTravellerInput["traveller"] | null {
  if (!writesSelfTraveller(d, o.mode) || !d.title) return null;
  const next: UpsertTravellerInput["traveller"] = {
    ...(existing ?? {}),
    id: existing?.id,
    clientId,
    title: d.title,
    givenName: d.firstName,
    surname: d.lastName,
    paxType: d.dateOfBirth ? paxTypeFor(d.dateOfBirth, o.today) : (existing?.paxType ?? "ADT"),
    dateOfBirth: t(d.dateOfBirth),
    gender: d.gender || undefined,
    nationality: code(d.nationality),
    passportNumber: t(d.passportNumber.replace(/\s/g, "").toUpperCase()),
    passportExpiry: t(d.passportExpiry),
    passportCountry: d.passportNumber.trim() ? code(d.passportCountry) : undefined,
    phone: existing ? existing.phone : t(d.phone),
    email: existing ? existing.email : t(d.email),
  };
  if (existing) {
    const same = (["title", "givenName", "surname", "paxType", "dateOfBirth", "gender", "nationality", "passportNumber", "passportExpiry", "passportCountry"] as const).every((k) => {
      const a = k === "givenName" || k === "surname" ? normaliseName(String(next[k] ?? "")) : (next[k] ?? undefined);
      return a === (existing[k] ?? undefined);
    });
    if (same) return null;
  }
  return next;
}
