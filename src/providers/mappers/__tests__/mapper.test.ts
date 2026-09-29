import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import type { Traveller } from "@/domain/types";
import { AIRLINES } from "@/store/seed/reference";
import { parsePnr } from "../../pnr-parser/parse";
import type { PnrSnapshot, PnrSnapshotSegment } from "../../types";
import {
  autoMatchTravellers,
  draftTravellerFromPnr,
  formatNameInPnr,
  inferTripType,
  inferValidatingCarrier,
  normaliseTicketNumber,
  snapshotSummary,
  snapshotToFlightDetails,
} from "../pnr-to-flight-line";

const NOW = new Date("2026-09-28T09:00:00.000Z");
const load = (name: string) => parsePnr(readFileSync(fileURLToPath(new URL(`../../pnr-parser/samples/${name}`, import.meta.url)), "utf8"), NOW);

const FAMILY = load("ticketed-family.txt");
const BOOKED = load("booked-return.txt");
const MULTI = load("multi-city.txt");
const INFANT = load("infant.txt");

const seg = (origin: string, destination: string, dep: string, arr: string, statusCode: PnrSnapshotSegment["statusCode"] = "HK"): PnrSnapshotSegment => ({
  segmentNo: 1,
  carrier: "XX",
  flightNumber: "1",
  bookingClass: "Y",
  origin,
  destination,
  departureLocal: dep,
  arrivalLocal: arr,
  arrivalDayOffset: 0,
  statusCode,
  seats: 1,
});

const traveller = (id: string, surname: string, givenName: string, paxType: Traveller["paxType"] = "ADT"): Traveller => ({
  id,
  clientId: "cli_1",
  title: "MR",
  givenName,
  surname,
  paxType,
  frequentFlyer: [],
});

describe("snapshotToFlightDetails", () => {
  it("maps the ticketed family PNR (Z8K4QM)", () => {
    const d = snapshotToFlightDetails(FAMILY, { travellerMap: { 1: "trv_peter", 2: "trv_anna", 3: "trv_david" }, airlines: AIRLINES });
    expect(d.recordLocator).toBe("Z8K4QM");
    expect(d.officeId).toBe("DARTZ2100");
    expect(d.validatingCarrier).toBe("EK");
    expect(d.tripType).toBe("return");
    expect(d.ticketingTimeLimit).toBeUndefined();
    expect(d.segments.map((s) => s.cabin)).toEqual(["economy", "economy"]);
    expect(d.segments[0]).toMatchObject({ segmentNo: 4, carrier: "EK", flightNumber: "726", origin: "DAR", destination: "DXB", departureLocal: "2026-10-12T16:50" });
    expect(d.passengers).toEqual([
      { travellerId: "trv_peter", nameInPnr: "MWAKALINGA/PETER MR", paxType: "ADT", pnrPaxNo: 1, ticketNumber: "176-2401234567", emdNumbers: [], fareAmount: { amountMinor: 145000, currency: "USD" } },
      { travellerId: "trv_anna", nameInPnr: "MWAKALINGA/ANNA MRS", paxType: "ADT", pnrPaxNo: 2, ticketNumber: "176-2401234568", emdNumbers: [], fareAmount: { amountMinor: 145000, currency: "USD" } },
      { travellerId: "trv_david", nameInPnr: "MWAKALINGA/DAVID MSTR", paxType: "CHD", pnrPaxNo: 3, ticketNumber: "176-2401234569", emdNumbers: [], fareAmount: { amountMinor: 112000, currency: "USD" } },
    ]);
    expect(d.fare).toEqual({
      currency: "USD",
      baseFare: { amountMinor: 402000, currency: "USD" },
      taxes: [],
      totalFare: { amountMinor: 402000, currency: "USD" },
      commissionPct: 0,
    });
  });

  it("maps a booked PNR with no FA lines: zero fare in the requested currency, time limit kept", () => {
    const d = snapshotToFlightDetails(BOOKED, { travellerMap: { 1: "trv_john", 2: "trv_mary" }, currency: "TZS", airlines: AIRLINES });
    expect(d.validatingCarrier).toBe("KQ");
    expect(d.tripType).toBe("return");
    expect(d.ticketingTimeLimit).toBe("2026-10-05T20:59:00.000Z");
    expect(d.fare.currency).toBe("TZS");
    expect(d.fare.totalFare).toEqual({ amountMinor: 0, currency: "TZS" });
    expect(d.fare.baseFare).toEqual({ amountMinor: 0, currency: "TZS" });
    expect(d.passengers.every((p) => p.ticketNumber === undefined && p.fareAmount === undefined)).toBe(true);
  });

  it("defaults the fare currency to USD", () => {
    expect(snapshotToFlightDetails(BOOKED, { travellerMap: {}, airlines: AIRLINES }).fare.currency).toBe("USD");
  });

  it("FA currency wins over the requested currency", () => {
    expect(snapshotToFlightDetails(FAMILY, { travellerMap: {}, currency: "TZS", airlines: AIRLINES }).fare.currency).toBe("USD");
  });

  it("maps the multi-city PNR with cabins from the booking class", () => {
    const d = snapshotToFlightDetails(MULTI, { travellerMap: { 1: "trv_daniel" }, airlines: AIRLINES });
    expect(d.tripType).toBe("multi_city");
    expect(d.validatingCarrier).toBe("TK");
    expect(d.segments.map((s) => `${s.bookingClass}:${s.cabin}`)).toEqual(["J:business", "J:business", "Y:economy", "C:business", "C:business"]);
  });

  it("uses an edited cabin map, and keeps a cabin already set on the snapshot", () => {
    const withCabin: PnrSnapshot = { ...MULTI, segments: MULTI.segments.map((s, i) => (i === 0 ? { ...s, cabin: "first" as const } : s)) };
    const d = snapshotToFlightDetails(withCabin, { travellerMap: {}, airlines: AIRLINES, cabinMap: { Y: "premium_economy", J: "business", C: "business" } });
    expect(d.segments.map((s) => s.cabin)).toEqual(["first", "business", "premium_economy", "business", "business"]);
  });

  it("maps the infant PNR: one-way, INF passenger with its own ticket and fare", () => {
    const d = snapshotToFlightDetails(INFANT, { travellerMap: { 1: "trv_asha", 2: "trv_juma", 3: "trv_zawadi" }, airlines: AIRLINES });
    expect(d.tripType).toBe("one_way");
    expect(d.validatingCarrier).toBe("ET");
    expect(d.passengers[2]).toEqual({
      travellerId: "trv_zawadi",
      nameInPnr: "KAHAMA/ZAWADI",
      paxType: "INF",
      pnrPaxNo: 3,
      ticketNumber: "071-2401555002",
      emdNumbers: [],
      fareAmount: { amountMinor: 9800, currency: "USD" },
    });
    expect(d.fare.totalFare).toEqual({ amountMinor: 205800, currency: "USD" });
  });

  it("leaves travellerId empty for passengers the agent has not mapped yet", () => {
    const d = snapshotToFlightDetails(FAMILY, { travellerMap: { 1: "trv_peter", 2: null }, airlines: AIRLINES });
    expect(d.passengers.map((p) => p.travellerId)).toEqual(["trv_peter", "", ""]);
  });

  it("omits officeId when the snapshot has none", () => {
    const d = snapshotToFlightDetails({ ...BOOKED, officeId: undefined }, { travellerMap: {}, airlines: AIRLINES });
    expect("officeId" in d).toBe(false);
  });
});

describe("inferValidatingCarrier", () => {
  it("prefers the FA line carrier", () => {
    expect(inferValidatingCarrier(FAMILY)).toBe("EK");
  });
  it("falls back to the airline owning the ticket prefix", () => {
    const snap = { ...BOOKED, tickets: [{ pnrPaxNo: 1, ticketNumber: "157-1234567890", carrier: "" }] };
    expect(inferValidatingCarrier(snap, AIRLINES)).toBe("QR");
    expect(inferValidatingCarrier(snap, [{ code: "ZZ", name: "Test Air", ticketPrefix: "157" }])).toBe("ZZ");
  });
  it("falls back to the first flown segment's carrier", () => {
    expect(inferValidatingCarrier(BOOKED)).toBe("KQ");
    const cancelledFirst = { tickets: [], segments: [seg("DAR", "NBO", "2026-10-01T08:00", "2026-10-01T09:00", "HX"), { ...seg("DAR", "ADD", "2026-10-02T08:00", "2026-10-02T10:00"), carrier: "ET" }] };
    expect(inferValidatingCarrier(cancelledFirst)).toBe("ET");
  });
  it("returns an empty string when nothing is known", () => {
    expect(inferValidatingCarrier({ tickets: [], segments: [] })).toBe("");
  });
});

describe("inferTripType", () => {
  it("one-way with a connection", () => {
    expect(inferTripType([seg("DAR", "ADD", "2026-11-14T15:40", "2026-11-14T18:15"), seg("ADD", "FRA", "2026-11-14T23:30", "2026-11-15T04:40")])).toBe("one_way");
  });
  it("return with connections both ways", () => {
    expect(
      inferTripType([
        seg("DAR", "DOH", "2026-10-01T02:00", "2026-10-01T06:00"),
        seg("DOH", "LHR", "2026-10-01T08:00", "2026-10-01T13:00"),
        seg("LHR", "DOH", "2026-10-10T21:00", "2026-10-11T07:00"),
        seg("DOH", "DAR", "2026-10-11T09:00", "2026-10-11T14:00"),
      ]),
    ).toBe("return");
  });
  it("open-jaw return (one surface gap) is a return", () => {
    expect(inferTripType([seg("DAR", "AMS", "2026-10-01T02:00", "2026-10-01T12:00"), seg("LHR", "DAR", "2026-10-10T21:00", "2026-10-11T09:00")])).toBe("return");
  });
  it("triangle with two stopovers is multi-city", () => {
    expect(
      inferTripType([
        seg("DAR", "DXB", "2026-10-01T02:00", "2026-10-01T08:00"),
        seg("DXB", "BOM", "2026-10-05T10:00", "2026-10-05T15:00"),
        seg("BOM", "DAR", "2026-10-09T10:00", "2026-10-09T15:00"),
      ]),
    ).toBe("multi_city");
  });
  it("one-way with a single stopover stays one-way", () => {
    expect(inferTripType([seg("DAR", "DXB", "2026-10-01T02:00", "2026-10-01T08:00"), seg("DXB", "LHR", "2026-10-04T08:00", "2026-10-04T12:00")])).toBe("one_way");
  });
  it("ignores cancelled segments", () => {
    expect(
      inferTripType([
        seg("DAR", "NBO", "2026-10-01T08:00", "2026-10-01T09:30"),
        seg("NBO", "EBB", "2026-10-03T08:00", "2026-10-03T09:00", "XX"),
        seg("NBO", "DAR", "2026-10-06T08:00", "2026-10-06T09:30"),
      ]),
    ).toBe("return");
  });
  it("no segments → one-way", () => {
    expect(inferTripType([])).toBe("one_way");
  });
});

describe("autoMatchTravellers", () => {
  const travellers = [
    traveller("trv_peter", "Mwakalinga", "peter"),
    traveller("trv_anna", "MWAKALINGA", "Anna"),
    traveller("trv_david", "MWAKALINGA", "DAVID", "CHD"),
    traveller("trv_other", "SHAYO", "PETER"),
  ];

  it("matches on surname and given name, case-insensitive, ignoring titles", () => {
    expect(autoMatchTravellers(FAMILY.passengers, travellers)).toEqual({ 1: "trv_peter", 2: "trv_anna", 3: "trv_david" });
  });

  it("returns null for passengers with no match", () => {
    expect(autoMatchTravellers(BOOKED.passengers, travellers)).toEqual({ 1: null, 2: null });
  });

  it("ignores accents, apostrophes and hyphens", () => {
    const pax = [{ pnrPaxNo: 1, surname: "OBRIEN", givenName: "ANNMARIE", paxType: "ADT" as const }];
    expect(autoMatchTravellers(pax, [traveller("trv_x", "O'Brien", "Ann-Marie")])).toEqual({ 1: "trv_x" });
    expect(autoMatchTravellers([{ pnrPaxNo: 1, surname: "JOSE", givenName: "RENE", paxType: "ADT" }], [traveller("trv_y", "José", "René")])).toEqual({ 1: "trv_y" });
  });

  it("falls back to the first given name when exactly one traveller fits", () => {
    const pax = [{ pnrPaxNo: 1, surname: "MWAKALINGA", givenName: "PETER JOHN", title: "MR" as const, paxType: "ADT" as const }];
    expect(autoMatchTravellers(pax, travellers)).toEqual({ 1: "trv_peter" });
    const twoPeters = [...travellers, traveller("trv_peter2", "MWAKALINGA", "PETER PAUL")];
    expect(autoMatchTravellers(pax, twoPeters)).toEqual({ 1: null });
  });

  it("never uses one traveller twice, preferring the same passenger type", () => {
    const pax = [
      { pnrPaxNo: 1, surname: "JUMA", givenName: "ALI", paxType: "ADT" as const },
      { pnrPaxNo: 2, surname: "JUMA", givenName: "ALI", paxType: "CHD" as const },
      { pnrPaxNo: 3, surname: "JUMA", givenName: "ALI", paxType: "ADT" as const },
    ];
    const list = [traveller("trv_ali_jr", "JUMA", "ALI", "CHD"), traveller("trv_ali", "JUMA", "ALI")];
    expect(autoMatchTravellers(pax, list)).toEqual({ 1: "trv_ali", 2: "trv_ali_jr", 3: null });
  });
});

describe("draftTravellerFromPnr", () => {
  it("builds a traveller from a child passenger", () => {
    expect(draftTravellerFromPnr(FAMILY.passengers[2], "cli_1")).toEqual({
      clientId: "cli_1",
      title: "MSTR",
      givenName: "DAVID",
      surname: "MWAKALINGA",
      paxType: "CHD",
      gender: "M",
      dateOfBirth: "2017-03-12",
      frequentFlyer: [],
    });
  });
  it("uppercases, takes gender from the title, and defaults the title when the PNR has none", () => {
    expect(draftTravellerFromPnr({ pnrPaxNo: 1, surname: "Swai", givenName: "Mary", title: "MRS", paxType: "ADT" }, "cli_2")).toMatchObject({
      surname: "SWAI",
      givenName: "MARY",
      title: "MRS",
      gender: "F",
    });
    const noTitle = draftTravellerFromPnr(INFANT.passengers[2], "cli_3");
    expect(noTitle).toMatchObject({ title: "MSTR", paxType: "INF", dateOfBirth: "2026-01-10" });
    expect(noTitle.gender).toBeUndefined();
  });
});

describe("snapshotSummary", () => {
  it("ticketed family", () => {
    expect(snapshotSummary(FAMILY)).toEqual({ route: "DAR → DXB → DAR", firstDeparture: "2026-10-12T16:50", paxCount: 3, ticketed: true });
  });
  it("booked return", () => {
    expect(snapshotSummary(BOOKED)).toEqual({ route: "DAR → NBO → DAR", firstDeparture: "2026-10-16T10:15", paxCount: 2, ticketed: false });
  });
  it("multi-city", () => {
    expect(snapshotSummary(MULTI).route).toBe("DAR → IST → AMS → LHR → DOH → DAR");
  });
  it("infant: ticketed, three passengers", () => {
    expect(snapshotSummary(INFANT)).toMatchObject({ route: "DAR → ADD → FRA", paxCount: 3, ticketed: true });
  });
  it("partly ticketed is not ticketed", () => {
    expect(snapshotSummary({ ...FAMILY, tickets: FAMILY.tickets.slice(0, 2) }).ticketed).toBe(false);
  });
  it("shows a surface sector with a dot", () => {
    const snap: PnrSnapshot = { ...BOOKED, segments: [seg("DAR", "AMS", "2026-10-01T02:00", "2026-10-01T12:00"), seg("LHR", "DAR", "2026-10-10T21:00", "2026-10-11T09:00")] };
    expect(snapshotSummary(snap).route).toBe("DAR → AMS · LHR → DAR");
  });
  it("empty snapshot", () => {
    expect(snapshotSummary(parsePnr("", NOW))).toEqual({ route: "", firstDeparture: undefined, paxCount: 0, ticketed: false });
  });
});

describe("small helpers", () => {
  it("formatNameInPnr", () => {
    expect(formatNameInPnr({ surname: "Mwakalinga", givenName: "Peter", title: "MR" })).toBe("MWAKALINGA/PETER MR");
    expect(formatNameInPnr({ surname: "KAHAMA", givenName: "ZAWADI" })).toBe("KAHAMA/ZAWADI");
    expect(formatNameInPnr({ surname: "KAHAMA", givenName: "" })).toBe("KAHAMA");
  });
  it("normaliseTicketNumber", () => {
    expect(normaliseTicketNumber("1762401234567")).toBe("176-2401234567");
    expect(normaliseTicketNumber(" 176-2401234567 ")).toBe("176-2401234567");
    expect(normaliseTicketNumber("12345")).toBe("12345");
  });
});
