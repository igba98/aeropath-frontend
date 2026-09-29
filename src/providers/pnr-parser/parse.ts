/**
 * Amadeus PNR paste parser (spec §11.4).
 *
 * `parsePnr(text, now)` turns the text an agent copies from the Amadeus terminal into a PnrSnapshot.
 * It is pure (the clock is passed in) and never throws: unknown lines are ignored and missing
 * essentials become `warnings` that the preview shows in amber.
 *
 * ALL PATTERNS LIVE IN THIS FILE. They are indicative and must be checked against real PNR displays
 * from the agency's own terminal before go-live (§11.4); the tests in __tests__/parse.test.ts make
 * adjusting them cheap.
 */
import type { Currency, ISODate, ISODateTime, PaxType, SegmentStatus, Title } from "@/domain/types";
import type { PnrSnapshot, PnrSnapshotPassenger, PnrSnapshotSegment, PnrSnapshotTicket } from "../types";
import { MONTHS, addDaysIso, darLocalDate, darLocalToUtcIso, diffDaysIso, isValidYmd, isoDate, nextOccurrence } from "../util/dates";

// ═════════════════════════════════ Patterns ═════════════════════════════════
// Every line is upper-cased, tabs become spaces and prompts are removed before these run.

/** ")>" — the "more to come" prompt Amadeus prints at the bottom right of a page. May sit anywhere on a line. */
const PAGINATION_PROMPT = /\)>/g;

/** A leading ">" command prompt, e.g. ">RT Z8K4QM" or "> MD". */
const LEADING_PROMPT = /^>+\s*/;

/** Whitespace that is not a plain space (tabs, non-breaking spaces from web terminals). */
const ODD_WHITESPACE = /[\t\u00a0\u2007\u202f]/g;

/**
 * Header: "RP/DARTZ2100/DARTZ2100            GK/SU  28SEP26/0812Z   Z8K4QM"
 *   1 office ID (9 chars: city, country, office number)
 */
const HEADER = /^RP\/([A-Z0-9]{9})\//;

/** Record locator: the last 6-character alphanumeric token on the header line. */
const HEADER_RECORD_LOCATOR = /(?:^|\s)([A-Z0-9]{6})$/;

/** Creation stamp on the header: "28SEP26/0812Z" → 1 day · 2 month · 3 year (yy) · 4 hours · 5 minutes (UTC). */
const HEADER_CREATED = /\b(\d{2})([A-Z]{3})(\d{2})\/(\d{2})(\d{2})Z\b/;

/** A names line starts with an element number and a dot: "1.MWAKALINGA/PETER MR   2.MWAKALINGA/ANNA MRS". */
const NAMES_LINE = /^\d{1,3}\.[A-Z]/;

/** Where the next name starts on a names line (several names per line). */
const NAME_BOUNDARY = /\s+(?=\d{1,3}\.[A-Z])/;

/** One name item: "3.MWAKALINGA/DAVID MSTR(CHD/12MAR17)" → 1 element number · 2 the rest. */
const NAME_ITEM = /^(\d{1,3})\.(.*)$/;

/** Bracketed annotation after a name: "(CHD/12MAR17)", "(INFMWAKALINGA/BABY/10JAN26)". Tolerates a missing ")". */
const NAME_ANNOTATION = /\(([^()]*)(?:\)|$)/g;

/** Title at the end of the given-name part: "PETER MR". Honorifics we cannot store as a Title are stripped too. */
const TITLE_SUFFIX = /\s+(MR|MRS|MS|MSTR|MISS|DR|PROF|REV|ENG|HON)$/;

/** Infant annotation: "INFMWAKALINGA/BABY/10JAN26", "INF/BABY/10JAN26", "INFBABY/10JAN26", "INF" → 1 the rest. */
const ANNOTATION_INFANT = /^INF\s*(.*)$/;

/** Child annotation: "CHD/12MAR17", "CHD12MAR17", "CHD". */
const ANNOTATION_CHILD = /^CHD(?![A-Z])/;

/** Adult-like passenger type codes that sometimes appear in brackets. */
const ANNOTATION_ADULT = /^(ADT|YTH|YCD|STU|SRC|MIL|LBR|SEA)(?![A-Z])/;

/** A date with a year: "12MAR17" → 1 day · 2 month · 3 year (yy). */
const DATE_DDMMMYY = /(\d{2})([A-Z]{3})(\d{2})/;

/** A whole token that is a date with a year. */
const DATE_DDMMMYY_TOKEN = /^(\d{2})([A-Z]{3})(\d{2})$/;

/** A date without a year: "12OCT" → 1 day · 2 month. */
const DATE_DDMMM = /^(\d{2})([A-Z]{3})$/;

/**
 * Air segment: "4  EK 726 Y 12OCT 1 DARDXB HK3  1650 2305   12OCT  E  EK/Z8K4QM"
 *    1 element number   2 carrier       3 flight number   4 booking class (RBD)
 *    5 date DDMMM       6 day of week (optional, ignored)
 *    7 origin           8 destination   9 status code     10 seats
 *   11 departure HHMM  12 arrival HHMM  13 day offset "+1" (optional)  14 arrival date DDMMM (optional)
 */
const AIR_SEGMENT =
  /^(\d{1,3})\s+([A-Z0-9]{2})\s*(\d{1,4}[A-Z]?)\s+([A-Z])\s+(\d{2}[A-Z]{3})\s*([1-7])?\s*\*?([A-Z]{3})([A-Z]{3})\s+([A-Z]{2})\s?(\d{1,2})\s+(\d{4})\s+(\d{4})\s*([+-]\d)?(?:\s+(\d{2}[A-Z]{3})(?![A-Z0-9]))?/;

/** "OPERATED BY KQ" under a segment (only the 2-character code form is read). */
const OPERATED_BY = /^OPERATED BY\s+([A-Z0-9]{2})$/;

/** Element number at the start of an element line: "8 TK OK28SEP/DARTZ2100". */
const ELEMENT_NUMBER = /^\d{1,3}\s+/;

/**
 * Ticketing arrangement: "TK TL05OCT/DARTZ2100" (time limit), "TK TL05OCT/1200/DARTZ2100" (with time),
 * "TK XL05OCT/…" (auto-cancel), "TK OK28SEP/DARTZ2100" (already ticketed).
 *   1 TL | XL | OK   2 date DDMMM (optional)   3 time HHMM (optional)
 */
const TICKETING = /^TK\s*(TL|XL|OK)\s*(\d{2}[A-Z]{3})?(?:\/(\d{4})(?=\/|\s|$))?/;

/**
 * Ticket element: "FA PAX 176-2401234567/ETEK/USD1450.00/28SEP26/DARTZ2100/00000000/S4-5/P1".
 * "FA INF" is an infant's ticket (its /P points at the accompanying adult); "FHE" is a manually added e-ticket.
 *   1 FA | FHE   2 PAX | INF (optional)   3 airline prefix   4 serial (10 digits; a "-68" conjunction suffix is ignored)
 */
const TICKET_LINE = /^(FA|FHE)\s+(?:(PAX|INF)\s*)?(\d{3})-?(\d{10})/;

/** Validating carrier in a ticket element: "/ETEK/" → EK. */
const TICKET_CARRIER = /\/ET([A-Z0-9]{2})(?=\/|\s|$)/;

/** Fare in a ticket element: "/USD1450.00/" → 1 currency · 2 amount. */
const TICKET_FARE = /\/([A-Z]{3})\s?(\d+(?:\.\d{1,2})?)(?=\/|\s|$)/;

/** Issue date in a ticket element: "/28SEP26/". */
const TICKET_ISSUE_DATE = /\/(\d{2}[A-Z]{3}\d{2})(?=\/|\s|$)/;

/** Passenger association in a ticket element: "/P1". */
const TICKET_PASSENGER = /\/P(\d{1,3})(?!\d)/;

/**
 * Contact elements: "AP DAR 255754000111 - H", "APE PETER@EXAMPLE.COM", "APM +255754222333".
 * APH/APB (home/business) are read too; APA (agency), APN (notification) and APF (fax) are skipped.
 *   1 E | M | H | B (optional)   2 the value
 */
const CONTACT = /^AP([EMHB])?\s+(.+)$/;

/** City code in front of a phone contact: "DAR 255754000111". */
const CONTACT_CITY_PREFIX = /^[A-Z]{3}\s+/;

/** Trailing contact kind: " - H", "-B", " - M". */
const CONTACT_KIND_SUFFIX = /\s*-\s*[A-Z]$/;

/** Amadeus e-mail encoding: "//" stands for "@" in some displays ("PETER//EXAMPLE.COM"). */
const EMAIL_AT_ENCODED = /\/\//g;

/** A value that contains an encoded "@" between two characters. */
const HAS_ENCODED_AT = /\S\/\/\S/;

// ═════════════════════════════════ Constants ═════════════════════════════════

const TITLES: readonly Title[] = ["MR", "MRS", "MS", "MSTR", "MISS"];

const SEGMENT_STATUSES: readonly SegmentStatus[] = ["HK", "KK", "TK", "HL", "UN", "UC", "NO", "HX", "XX"];

/** Other status codes seen in displays, mapped to the closest stored status (with a warning). */
const SEGMENT_STATUS_ALIASES: Record<string, SegmentStatus> = {
  RR: "HK", // reconfirmed
  SS: "HK", // sold
  DK: "HK", // direct sell confirmed
  GK: "HK", // passive, confirmed outside Amadeus
  HS: "HK", // have sold
  KL: "HK", // confirmed from the waitlist
  HN: "HL", // requested, awaiting the airline
  NN: "HL", // need
  PN: "HL", // pending
  LL: "HL", // waitlist
  US: "UC", // unable to sell
  UU: "UC", // unable, waitlisted
};

const SUPPORTED_CURRENCIES: readonly Currency[] = ["USD", "TZS"];

// ═══════════════════════════════════ Parser ═══════════════════════════════════

interface ParsedName {
  elementNo: number;
  surname: string;
  givenName: string;
  title?: Title;
  paxType: PaxType;
  dateOfBirth?: ISODate;
  infant?: { surname?: string; givenName?: string; dateOfBirth?: ISODate };
}

interface ParseContext {
  now: Date;
  today: ISODate; // Dar-local date of `now`
  refDate: ISODate; // PNR creation date, or today
  warnings: string[];
}

export function parsePnr(text: string, now: Date): PnrSnapshot {
  const raw = typeof text === "string" ? text : "";
  const snapshot: PnrSnapshot = {
    recordLocator: "",
    passengers: [],
    segments: [],
    tickets: [],
    contacts: [],
    raw,
    warnings: [],
  };

  try {
    parseInto(snapshot, raw, now);
  } catch {
    // Belt and braces: the parser must never throw into the UI.
    snapshot.warnings.push("Part of this PNR could not be read. Check the preview carefully before saving.");
  }
  return snapshot;
}

function parseInto(out: PnrSnapshot, raw: string, now: Date): void {
  const lines = normaliseLines(raw);
  if (lines.length === 0) {
    out.warnings.push("Nothing to read. Paste the PNR display from the Amadeus terminal.");
    return;
  }

  const today = darLocalDate(isValidDate(now) ? now : new Date(0));
  const ctx: ParseContext = { now, today, refDate: today, warnings: out.warnings };

  // ── Header first: the creation date anchors every date without a year ──
  const headerLine = lines.find((l) => HEADER.test(l));
  if (headerLine) {
    out.officeId = HEADER.exec(headerLine)?.[1];
    const locator = HEADER_RECORD_LOCATOR.exec(headerLine)?.[1];
    if (locator) out.recordLocator = locator;
    const created = readCreatedAt(headerLine);
    if (created) {
      out.createdAt = created;
      ctx.refDate = darLocalDate(new Date(created));
    }
  }

  // ── Classify every other line ──
  const names: ParsedName[] = [];
  const segmentsByNo = new Map<number, PnrSnapshotSegment>();
  const ticketLines: { kind: "PAX" | "INF"; line: string }[] = [];
  let lastSegment: PnrSnapshotSegment | undefined;

  for (const line of lines) {
    if (line === headerLine) continue;

    if (NAMES_LINE.test(line)) {
      for (const item of line.split(NAME_BOUNDARY)) {
        const name = readName(item.trim(), ctx);
        if (name) names.push(name);
      }
      continue;
    }

    const seg = AIR_SEGMENT.exec(line);
    if (seg) {
      const segment = readSegment(seg, ctx);
      if (segment) {
        const existing = segmentsByNo.get(segment.segmentNo);
        if (!existing) segmentsByNo.set(segment.segmentNo, segment);
        else if (JSON.stringify(existing) !== JSON.stringify(segment))
          ctx.warnings.push(`Segment ${segment.segmentNo} appears twice with different details. The first one was kept.`);
        lastSegment = segmentsByNo.get(segment.segmentNo);
      }
      continue;
    }

    const element = line.replace(ELEMENT_NUMBER, "");

    const operated = OPERATED_BY.exec(element);
    if (operated && lastSegment) {
      lastSegment.operatingCarrier = operated[1];
      continue;
    }

    const tk = TICKETING.exec(element);
    if (tk) {
      readTicketing(tk, out, ctx);
      continue;
    }

    const fa = TICKET_LINE.exec(element);
    if (fa) {
      ticketLines.push({ kind: fa[2] === "INF" ? "INF" : "PAX", line: element });
      continue;
    }

    const ap = CONTACT.exec(element);
    if (ap) {
      const contact = readContact(ap[1], ap[2]);
      if (contact && !out.contacts.some((c) => c.type === contact.type && c.value === contact.value)) out.contacts.push(contact);
      continue;
    }
    // Anything else (RM, SSR, OSI, FP, FV, TST, pagination, command echoes…) is ignored.
  }

  // ── Passengers (infants appended after the named passengers) ──
  const infantOf = new Map<number, number>(); // adult P no → infant P no
  out.passengers = assignPassengers(names, infantOf, ctx);

  // ── Segments in element order ──
  out.segments = [...segmentsByNo.values()].sort((a, b) => a.segmentNo - b.segmentNo);

  // ── Tickets, mapped to passengers ──
  out.tickets = readTickets(ticketLines, out.passengers, infantOf, ctx);

  // ── Missing essentials ──
  if (!headerLine) {
    ctx.warnings.push("No header line (RP/…) found, so the record locator and office ID are missing. Check you copied the whole PNR, or type them in.");
  } else if (!out.recordLocator) {
    ctx.warnings.push("No record locator found on the header line. Type it in before saving.");
  }
  if (out.passengers.length === 0) ctx.warnings.push("No passenger names found.");
  if (out.segments.length === 0) ctx.warnings.push("No flight segments found.");
}

// ═════════════════════════════════ Line helpers ═════════════════════════════════

function normaliseLines(raw: string): string[] {
  return raw
    .replace(/\r\n?/g, "\n")
    .split("\n")
    .map((l) =>
      l
        .toUpperCase()
        .replace(ODD_WHITESPACE, " ")
        .replace(PAGINATION_PROMPT, " ")
        .trim()
        .replace(LEADING_PROMPT, "")
        .trim(),
    )
    .filter((l) => l.length > 0);
}

function isValidDate(d: Date): boolean {
  return d instanceof Date && !Number.isNaN(d.getTime());
}

function readCreatedAt(headerLine: string): ISODateTime | undefined {
  const m = HEADER_CREATED.exec(headerLine);
  if (!m) return undefined;
  const [, dd, mon, yy, hh, mi] = m;
  const month = MONTHS[mon];
  const year = 2000 + Number(yy);
  if (month === undefined || !isValidYmd(year, month, Number(dd)) || Number(hh) > 23 || Number(mi) > 59) return undefined;
  return new Date(Date.UTC(year, month, Number(dd), Number(hh), Number(mi))).toISOString();
}

/** "28SEP26" → "2026-09-28" (always 20yy: issue and creation dates). */
function readDateWithYear(token: string): ISODate | undefined {
  const m = DATE_DDMMMYY_TOKEN.exec(token);
  if (!m) return undefined;
  const month = MONTHS[m[2]];
  const year = 2000 + Number(m[3]);
  return month !== undefined && isValidYmd(year, month, Number(m[1])) ? isoDate(year, month, Number(m[1])) : undefined;
}

/** Date of birth "12MAR17" → "2017-03-12". A two-digit year after today's year means 19yy. */
function readBirthDate(text: string, ctx: ParseContext): ISODate | undefined {
  const m = DATE_DDMMMYY.exec(text);
  if (!m) return undefined;
  const month = MONTHS[m[2]];
  const day = Number(m[1]);
  if (month === undefined) return undefined;
  let year = 2000 + Number(m[3]);
  if (!isValidYmd(year, month, day)) return undefined;
  if (diffDaysIso(isoDate(year, month, day), ctx.today) > 0) year -= 100;
  return isValidYmd(year, month, day) ? isoDate(year, month, day) : undefined;
}

/** "12OCT" → next occurrence on or after `from` (the PNR creation date by default). */
function resolveDayMonth(token: string, from: ISODate): ISODate | undefined {
  const m = DATE_DDMMM.exec(token);
  if (!m) return undefined;
  const month = MONTHS[m[2]];
  if (month === undefined) return undefined;
  return nextOccurrence(Number(m[1]), month, from) ?? undefined;
}

function readTime(hhmm: string): { hh: number; mm: number; text: string } | undefined {
  const hh = Number(hhmm.slice(0, 2));
  const mm = Number(hhmm.slice(2, 4));
  if (!(hh >= 0 && hh <= 23 && mm >= 0 && mm <= 59)) return undefined;
  return { hh, mm, text: `${hhmm.slice(0, 2)}:${hhmm.slice(2, 4)}` };
}

const collapse = (s: string) => s.replace(/\s+/g, " ").trim();

// ═════════════════════════════════ Names ═════════════════════════════════

function readName(item: string, ctx: ParseContext): ParsedName | undefined {
  const m = NAME_ITEM.exec(item);
  if (!m) return undefined;
  const elementNo = Number(m[1]);
  let body = m[2];

  let paxType: PaxType = "ADT";
  let dateOfBirth: ISODate | undefined;
  let infant: ParsedName["infant"];

  // Bracketed annotations: (CHD/…), (INF…), (ADT)…
  const annotations: string[] = [];
  body = body.replace(NAME_ANNOTATION, (_all, inner: string) => {
    annotations.push(inner.trim());
    return " ";
  });
  for (const a of annotations) {
    const inf = ANNOTATION_INFANT.exec(a);
    if (inf) {
      infant = readInfant(inf[1], ctx);
      continue;
    }
    if (ANNOTATION_CHILD.test(a)) {
      paxType = "CHD";
      dateOfBirth = readBirthDate(a, ctx) ?? dateOfBirth;
      continue;
    }
    if (ANNOTATION_ADULT.test(a)) paxType = "ADT";
  }

  body = collapse(body);
  const slash = body.indexOf("/");
  let surname = slash >= 0 ? body.slice(0, slash) : body;
  let given = slash >= 0 ? body.slice(slash + 1) : "";

  let title: Title | undefined;
  const titled = TITLE_SUFFIX.exec(slash >= 0 ? " " + given : " " + surname);
  if (titled) {
    if ((TITLES as readonly string[]).includes(titled[1])) title = titled[1] as Title;
    if (slash >= 0) given = given.slice(0, given.length - titled[0].length + 1);
    else surname = surname.slice(0, surname.length - titled[0].length + 1);
  }
  surname = collapse(surname.replace(/\//g, " "));
  given = collapse(given.replace(/\//g, " "));

  if (!surname) return undefined;
  if (!given) ctx.warnings.push(`Passenger ${elementNo} (${surname}) has no given name. Add it before saving.`);

  return { elementNo, surname, givenName: given, title, paxType, dateOfBirth, infant };
}

/** Rest of an "(INF…)" annotation: "MWAKALINGA/BABY/10JAN26", "/BABY/10JAN26", "BABY/10JAN26" or "". */
function readInfant(rest: string, ctx: ParseContext): NonNullable<ParsedName["infant"]> {
  const tokens = rest.split("/").map((t) => collapse(t));
  let dateOfBirth: ISODate | undefined;
  if (tokens.length && DATE_DDMMMYY_TOKEN.test(tokens[tokens.length - 1])) dateOfBirth = readBirthDate(tokens.pop() as string, ctx);
  while (tokens.length && tokens[tokens.length - 1] === "") tokens.pop();

  const strip = (s: string) => collapse(s.replace(TITLE_SUFFIX, ""));
  if (tokens.length === 0) return { dateOfBirth };
  if (tokens.length === 1) return { givenName: strip(tokens[0]) || undefined, dateOfBirth }; // same surname as the adult
  return { surname: tokens[0] || undefined, givenName: strip(tokens.slice(1).join(" ")) || undefined, dateOfBirth };
}

function assignPassengers(names: ParsedName[], infantOf: Map<number, number>, ctx: ParseContext): PnrSnapshotPassenger[] {
  const byNo = new Map<number, ParsedName>();
  const extra: ParsedName[] = [];
  for (const n of names) {
    const existing = n.elementNo > 0 ? byNo.get(n.elementNo) : undefined;
    if (n.elementNo > 0 && !existing) byNo.set(n.elementNo, n);
    else if (existing && existing.surname === n.surname && existing.givenName === n.givenName) continue; // same page pasted twice
    else {
      ctx.warnings.push(`Two passengers share number ${n.elementNo}. ${n.surname}/${n.givenName} was given the next free number.`);
      extra.push(n);
    }
  }

  const passengers: PnrSnapshotPassenger[] = [];
  const ordered = [...byNo.entries()].sort((a, b) => a[0] - b[0]);
  let nextNo = ordered.length ? ordered[ordered.length - 1][0] + 1 : 1;
  const all: [number, ParsedName][] = [...ordered, ...extra.map((n): [number, ParsedName] => [nextNo++, n])];

  for (const [no, n] of all) {
    passengers.push({
      pnrPaxNo: no,
      surname: n.surname,
      givenName: n.givenName,
      ...(n.title ? { title: n.title } : {}),
      paxType: n.paxType,
      ...(n.dateOfBirth ? { dateOfBirth: n.dateOfBirth } : {}),
    });
  }

  for (const [no, n] of all) {
    if (!n.infant) continue;
    const infantNo = nextNo++;
    infantOf.set(no, infantNo);
    const givenName = n.infant.givenName ?? "";
    if (!givenName) ctx.warnings.push(`The infant travelling with passenger ${no} has no name in the PNR. Add it before saving.`);
    passengers.push({
      pnrPaxNo: infantNo,
      surname: n.infant.surname ?? n.surname,
      givenName,
      paxType: "INF",
      ...(n.infant.dateOfBirth ? { dateOfBirth: n.infant.dateOfBirth } : {}),
    });
  }
  return passengers;
}

// ═════════════════════════════════ Segments ═════════════════════════════════

function readSegment(m: RegExpExecArray, ctx: ParseContext): PnrSnapshotSegment | undefined {
  const [, elementNo, carrier, flightNumber, rbd, dateToken, , origin, destination, statusRaw, seats, depRaw, arrRaw, offsetRaw, arrDateToken] = m;
  const segmentNo = Number(elementNo);

  const depDate = resolveDayMonth(dateToken, ctx.refDate);
  const dep = readTime(depRaw);
  const arr = readTime(arrRaw);
  if (!depDate || !dep || !arr) {
    ctx.warnings.push(`Segment ${segmentNo} (${carrier} ${flightNumber}) has a date or time that could not be read, so it was skipped.`);
    return undefined;
  }

  // Day offset: explicit "+1" wins, then the arrival date column, then arrival time earlier than departure.
  let offset = 0;
  if (offsetRaw) offset = Number(offsetRaw);
  else if (arrDateToken) {
    const arrDate = resolveDayMonth(arrDateToken, depDate);
    offset = arrDate ? diffDaysIso(arrDate, depDate) : 0;
  } else if (arr.hh * 60 + arr.mm < dep.hh * 60 + dep.mm) offset = 1;

  if (offset < 0 || offset > 2) {
    ctx.warnings.push(`Segment ${segmentNo} arrives ${offset > 0 ? "+" : ""}${offset} day(s) from departure. Check the arrival date.`);
  }
  const arrivalDayOffset = (Math.min(Math.max(offset, 0), 2) as 0 | 1 | 2);

  let statusCode: SegmentStatus;
  if ((SEGMENT_STATUSES as readonly string[]).includes(statusRaw)) statusCode = statusRaw as SegmentStatus;
  else if (SEGMENT_STATUS_ALIASES[statusRaw]) {
    statusCode = SEGMENT_STATUS_ALIASES[statusRaw];
    ctx.warnings.push(`Segment ${segmentNo} has status ${statusRaw}; it was read as ${statusCode}.`);
  } else {
    statusCode = "UC";
    ctx.warnings.push(`Segment ${segmentNo} has an unknown status code ${statusRaw}; it was read as UC. Check it in Amadeus.`);
  }

  return {
    segmentNo,
    carrier,
    flightNumber,
    bookingClass: rbd,
    origin,
    destination,
    departureLocal: `${depDate}T${dep.text}`,
    arrivalLocal: `${addDaysIso(depDate, offset)}T${arr.text}`,
    arrivalDayOffset,
    statusCode,
    seats: Number(seats),
  };
}

// ═════════════════════════════════ Ticketing ═════════════════════════════════

function readTicketing(m: RegExpExecArray, out: PnrSnapshot, ctx: ParseContext): void {
  const [, kind, dateToken, timeRaw] = m;
  if (kind === "OK") return; // already ticketed: no time limit
  if (!dateToken) {
    ctx.warnings.push("The ticketing time limit (TK TL) has no date. Enter it by hand.");
    return;
  }
  const date = resolveDayMonth(dateToken, ctx.refDate);
  if (!date) {
    ctx.warnings.push(`The ticketing time limit ${dateToken} is not a valid date.`);
    return;
  }
  const time = timeRaw ? readTime(timeRaw) : undefined;
  // Time limit = end of that day in Dar es Salaam unless a time is given.
  out.ticketingTimeLimit = darLocalToUtcIso(date, time?.hh ?? 23, time?.mm ?? 59);
}

function readTickets(
  lines: { kind: "PAX" | "INF"; line: string }[],
  passengers: PnrSnapshotPassenger[],
  infantOf: Map<number, number>,
  ctx: ParseContext,
): PnrSnapshotTicket[] {
  const tickets: PnrSnapshotTicket[] = [];
  const nonInfants = passengers.filter((p) => p.paxType !== "INF");
  const infants = passengers.filter((p) => p.paxType === "INF");

  for (const { kind, line } of lines) {
    const head = TICKET_LINE.exec(line);
    if (!head) continue;
    const ticketNumber = `${head[3]}-${head[4]}`;
    if (tickets.some((t) => t.ticketNumber === ticketNumber)) continue; // pasted twice

    // Which passenger?
    const pRef = TICKET_PASSENGER.exec(line);
    let pnrPaxNo: number | undefined;
    if (kind === "INF") {
      if (pRef) pnrPaxNo = infantOf.get(Number(pRef[1]));
      else if (infants.length === 1) pnrPaxNo = infants[0].pnrPaxNo;
      if (pnrPaxNo === undefined) {
        ctx.warnings.push(`Infant ticket ${ticketNumber} could not be matched to an infant in the PNR. Enter it by hand.`);
        continue;
      }
    } else if (pRef) {
      pnrPaxNo = Number(pRef[1]);
      if (!passengers.some((p) => p.pnrPaxNo === pnrPaxNo))
        ctx.warnings.push(`Ticket ${ticketNumber} is for passenger ${pnrPaxNo}, who is not in the names list.`);
    } else if (nonInfants.length === 1) {
      pnrPaxNo = nonInfants[0].pnrPaxNo;
    } else {
      ctx.warnings.push(`Ticket ${ticketNumber} does not say which passenger it belongs to (/P…). Enter it by hand.`);
      continue;
    }

    const ticket: PnrSnapshotTicket = { pnrPaxNo, ticketNumber, carrier: TICKET_CARRIER.exec(line)?.[1] ?? "" };

    const fare = TICKET_FARE.exec(line);
    if (fare) {
      if ((SUPPORTED_CURRENCIES as readonly string[]).includes(fare[1])) {
        ticket.currency = fare[1] as Currency;
        ticket.amount = Number(fare[2]);
      } else {
        ctx.warnings.push(`Ticket ${ticketNumber} is priced in ${fare[1]}. Enter the fare in USD or TZS.`);
      }
    }
    const issued = TICKET_ISSUE_DATE.exec(line);
    const issuedAt = issued ? readDateWithYear(issued[1]) : undefined;
    if (issuedAt) ticket.issuedAt = issuedAt;

    tickets.push(ticket);
  }
  return tickets;
}

// ═════════════════════════════════ Contacts ═════════════════════════════════

function readContact(kind: string | undefined, rawValue: string): { type: "phone" | "email"; value: string } | undefined {
  const value = collapse(rawValue);
  if (!value) return undefined;

  const looksLikeEmail = kind === "E" || value.includes("@") || HAS_ENCODED_AT.test(value);
  if (looksLikeEmail) {
    const email = value.replace(CONTACT_KIND_SUFFIX, "").replace(EMAIL_AT_ENCODED, "@").replace(/\s+/g, "").toLowerCase();
    return { type: "email", value: email };
  }

  const text = value.replace(CONTACT_KIND_SUFFIX, "").replace(CONTACT_CITY_PREFIX, "");
  const digits = text.replace(/\D/g, "");
  if (!digits) return { type: "phone", value: text };
  if (digits.startsWith("255") && digits.length === 12) return { type: "phone", value: `+${digits}` };
  if (digits.startsWith("0") && digits.length === 10) return { type: "phone", value: `+255${digits.slice(1)}` };
  return { type: "phone", value: text.trim().startsWith("+") ? `+${digits}` : digits };
}
