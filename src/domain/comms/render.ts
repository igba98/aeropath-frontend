import type { DbState, ID, MessageTemplateKey, Money, ServiceLine, User } from "../types";
import { defaultComms } from "../defaults";
import { darLocalToUtc, shortDate, toDarLocal } from "../dates";
import { abs, format, isPos, sum } from "../money";
import { activeLines } from "../selectors/core";
import { chargeItems } from "../selectors/charges";
import { fileTotals } from "../selectors/fileTotals";
import { clientBalance } from "../selectors/balances";
import { fileDueAt } from "../status/payment-status";
import { PLACEHOLDERS, type Placeholder } from "./labels";

/**
 * Message templates: {placeholders} filled from the database for a client and, optionally, one of their bookings.
 * Text is kept to the GSM-7 alphabet where we write it ourselves (itinerary lines use "-", not arrows), so an SMS
 * stays at 160 characters a part.
 */

export type PlaceholderValues = Partial<Record<Placeholder, string>>;

export interface RenderContext {
  db: DbState;
  clientId?: ID;
  fileId?: ID;
  /** Defaults to the current time; used to pick the next departure and the client's balance. */
  now?: Date;
  /** The person written to (a contact or traveller); {client} greets them by first name. */
  recipientName?: string;
  /** The staff member sending; {agent}. Defaults to the booking's agent. */
  agent?: Pick<User, "name"> | null;
  /** Values that win over the ones worked out from the database, e.g. a time limit as {dueDate}. */
  vars?: PlaceholderValues;
}

export interface Rendered {
  subject: string;
  body: string;
  /** Known placeholders left unfilled because the booking or client does not have that information. */
  missing: Placeholder[];
}

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const PLACEHOLDER_RE = /\{([A-Za-z]+)\}/g;
const isPlaceholder = (k: string): k is Placeholder => (PLACEHOLDERS as readonly string[]).includes(k);

/** "Peter" from "PETER MWAKALINGA" or "peter mwakalinga". */
export function firstNameOf(name: string): string {
  const n = name.trim().split(/\s+/)[0] ?? "";
  return n ? n.charAt(0).toUpperCase() + n.slice(1).toLowerCase() : "";
}

/** "Mon 12 Oct" for a date or a local date-time. */
export function dayLabel(dateOrLocal: string): string {
  const d = dateOrLocal.slice(0, 10);
  const wd = WEEKDAYS[new Date(`${d}T00:00:00Z`).getUTCDay()] ?? "";
  return `${wd} ${shortDate(d)}`.trim();
}

/** "12 Oct 2026" */
export function longDate(date: string): string {
  return `${shortDate(date)} ${date.slice(0, 4)}`;
}

/** "Mon 12 Oct, 16:50" for a local wall clock. */
export function whenLabel(local: string): string {
  return `${dayLabel(local)}, ${local.slice(11, 16)}`;
}

/** One line per service in time order: each flight segment, hotel stays at check-in, transfers, cars and the rest. */
export function itineraryLines(db: DbState, fileId: ID): string[] {
  const entries = activeLines(db, fileId).flatMap(entriesForMessage);
  return entries.sort((a, b) => (a.key < b.key ? -1 : a.key > b.key ? 1 : 0)).map((e) => e.text);
}

/** Sort key (local "YYYY-MM-DDTHH:mm") and text per itinerary entry. */
function entriesForMessage(line: ServiceLine): { key: string; text: string }[] {
  switch (line.type) {
    case "flight":
      return line.details.segments.map((s) => ({
        key: s.departureLocal,
        text: `${s.carrier} ${s.flightNumber}, ${dayLabel(s.departureLocal)}: ${s.origin} ${s.departureLocal.slice(11, 16)} - ${s.destination} ${s.arrivalLocal.slice(11, 16)}${s.arrivalDayOffset ? ` (+${s.arrivalDayOffset})` : ""}`,
      }));
    case "hotel": {
      const d = line.details;
      return [{ key: `${d.checkIn}T14:00`, text: `${d.hotelName}, ${d.city}: ${dayLabel(d.checkIn)} - ${dayLabel(d.checkOut)}${d.confirmationNumber ? ` (conf. ${d.confirmationNumber})` : ""}` }];
    }
    case "transfer": {
      const at = toDarLocal(line.details.at);
      return [{ key: at, text: `Transfer ${line.details.from} to ${line.details.to}: ${whenLabel(at)}` }];
    }
    case "car": {
      const d = line.details;
      const at = toDarLocal(d.pickupAt);
      return [{ key: at, text: `${d.company} ${d.carClass}${d.withDriver ? " with driver" : ""}: ${dayLabel(at)} - ${dayLabel(toDarLocal(d.dropoffAt))}` }];
    }
    case "tour":
      return [{ key: `${line.details.startDate}T08:00`, text: `${line.details.name}: ${dayLabel(line.details.startDate)} - ${dayLabel(line.details.endDate)}` }];
    case "insurance":
      return [{ key: `${line.details.coverStart}T00:00`, text: `${line.details.provider} ${line.details.plan}: ${dayLabel(line.details.coverStart)} - ${dayLabel(line.details.coverEnd)}` }];
    case "visa":
      return [{ key: `${line.details.submittedAt ?? "0000-00-00"}T00:00`, text: `Visa ${line.details.country}, ${line.details.visaType}` }];
    default:
      return [];
  }
}

/** The next departure on the booking (or its first, when all are past): "Mon 12 Oct at 16:50 from DAR (EK 726)". */
export function nextDeparture(db: DbState, fileId: ID, now: Date): string | undefined {
  const segs = activeLines(db, fileId)
    .flatMap((l) => (l.type === "flight" ? l.details.segments : []))
    .filter((s) => s.departureLocal)
    .sort((a, b) => a.departureLocal.localeCompare(b.departureLocal));
  if (!segs.length) return undefined;
  const t = now.getTime();
  const s = segs.find((x) => Date.parse(darLocalToUtc(x.departureLocal)) > t) ?? segs[0];
  return `${dayLabel(s.departureLocal)} at ${s.departureLocal.slice(11, 16)} from ${s.origin} (${s.carrier} ${s.flightNumber})`;
}

/** "USD 120.00", or "USD 45.00 in your favour" when the client is in credit. */
const balanceText = (m: Money) => (m.amountMinor < 0 ? `${format(abs(m))} in your favour` : format(m));

/** Everything the placeholders can say about this client and booking. Missing information is left out. */
export function placeholderValues(ctx: RenderContext): PlaceholderValues {
  const { db } = ctx;
  const now = ctx.now ?? new Date();
  const file = ctx.fileId ? db.files[ctx.fileId] : undefined;
  const client = db.clients[ctx.clientId ?? file?.clientId ?? ""];
  const v: PlaceholderValues = {};

  const greet = ctx.recipientName ?? (client ? (client.type === "corporate" ? client.contactPerson || client.name : client.name) : "");
  if (greet) v.client = firstNameOf(greet);
  v.company = db.settings.comms?.senderName || db.settings.company.name;
  const agent = ctx.agent ?? (file ? db.users[file.ownerId] : undefined);
  if (agent?.name) v.agent = agent.name;

  if (file) {
    v.file = file.number;
    const lines = activeLines(db, file.id);
    const pnrs = [...new Set(lines.flatMap((l) => (l.type === "flight" && l.details.recordLocator ? [l.details.recordLocator] : [])))];
    if (pnrs.length) v.pnr = pnrs.join(", ");
    const itin = itineraryLines(db, file.id);
    if (itin.length) v.itinerary = itin.join("\n");
    const t = fileTotals(db, file.id);
    const quoted = sum(
      chargeItems(db, file.id, "quote").map((i) => i.sell),
      file.currency,
    );
    const total = isPos(t.charges) ? t.charges : quoted;
    if (isPos(total)) v.total = format(total);
    v.balance = balanceText(t.balance);
    const due = fileDueAt(db, file.id);
    if (due) v.dueDate = longDate(due);
    const dep = nextDeparture(db, file.id, now);
    if (dep) v.departure = dep;
  } else if (client) {
    v.balance = balanceText(clientBalance(db, client.id, now).balance);
  }

  for (const [k, val] of Object.entries(ctx.vars ?? {})) if (val !== undefined && isPlaceholder(k)) v[k] = val;
  return v;
}

/** Replaces known {placeholders} that have a value; everything else is left as typed. */
export function fillPlaceholders(text: string, values: PlaceholderValues): { text: string; missing: Placeholder[] } {
  const missing = new Set<Placeholder>();
  const out = text.replace(PLACEHOLDER_RE, (whole, key: string) => {
    if (!isPlaceholder(key)) return whole;
    const val = values[key];
    if (val === undefined || val === "") {
      missing.add(key);
      return whole;
    }
    return val;
  });
  return { text: out, missing: [...missing] };
}

/** Known placeholders still in a text, e.g. after rendering without a booking. */
export function unfilledPlaceholders(text: string): Placeholder[] {
  const out = new Set<Placeholder>();
  for (const m of text.matchAll(PLACEHOLDER_RE)) if (isPlaceholder(m[1])) out.add(m[1]);
  return [...out];
}

/** The saved template (Settings → Communications), falling back to the default wording. */
export function templateText(db: DbState, key: MessageTemplateKey): { subject: string; body: string } {
  const t = db.settings.comms?.templates?.[key] ?? defaultComms().templates[key];
  return { subject: t?.subject ?? "", body: t?.body ?? "" };
}

/** Fills a template for a client and optional booking. */
export function renderTemplate(key: MessageTemplateKey, ctx: RenderContext): Rendered {
  const t = templateText(ctx.db, key);
  const values = placeholderValues(ctx);
  const subject = fillPlaceholders(t.subject, values);
  const body = fillPlaceholders(t.body, values);
  return { subject: subject.text, body: body.text, missing: [...new Set([...subject.missing, ...body.missing])] };
}
