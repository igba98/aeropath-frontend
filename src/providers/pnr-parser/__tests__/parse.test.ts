import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { parsePnr } from "../parse";
import type { MockFixture } from "../../amadeus-mock";
import fixtureZ8K4QM from "../../amadeus-mock/fixtures/Z8K4QM.json";
import fixtureW3JN6P from "../../amadeus-mock/fixtures/W3JN6P.json";
import fixtureT5MV8C from "../../amadeus-mock/fixtures/T5MV8C.json";
import fixtureL9BX2D from "../../amadeus-mock/fixtures/L9BX2D.json";

const NOW = new Date("2026-09-28T09:00:00.000Z");
const sample = (name: string) => readFileSync(fileURLToPath(new URL(`../samples/${name}`, import.meta.url)), "utf8");

const FAMILY = sample("ticketed-family.txt");
const BOOKED = sample("booked-return.txt");
const MULTI = sample("multi-city.txt");
const INFANT = sample("infant.txt");

/** Everything but `raw` (which always echoes the input). */
const core = (text: string, now = NOW) => {
  const { raw: _raw, ...rest } = parsePnr(text, now);
  void _raw;
  return rest;
};

describe("sample: ticketed-family.txt (spec §11.4)", () => {
  const pnr = parsePnr(FAMILY, NOW);

  it("reads the header", () => {
    expect(pnr.recordLocator).toBe("Z8K4QM");
    expect(pnr.officeId).toBe("DARTZ2100");
    expect(pnr.createdAt).toBe("2026-09-28T08:12:00.000Z");
  });

  it("reads three passengers, two per line where needed, with the child's date of birth", () => {
    expect(pnr.passengers).toEqual([
      { pnrPaxNo: 1, surname: "MWAKALINGA", givenName: "PETER", title: "MR", paxType: "ADT" },
      { pnrPaxNo: 2, surname: "MWAKALINGA", givenName: "ANNA", title: "MRS", paxType: "ADT" },
      { pnrPaxNo: 3, surname: "MWAKALINGA", givenName: "DAVID", title: "MSTR", paxType: "CHD", dateOfBirth: "2017-03-12" },
    ]);
  });

  it("reads both EK segments with local times and the year from the creation date", () => {
    expect(pnr.segments).toEqual([
      {
        segmentNo: 4, carrier: "EK", flightNumber: "726", bookingClass: "Y", origin: "DAR", destination: "DXB",
        departureLocal: "2026-10-12T16:50", arrivalLocal: "2026-10-12T23:05", arrivalDayOffset: 0, statusCode: "HK", seats: 3,
      },
      {
        segmentNo: 5, carrier: "EK", flightNumber: "725", bookingClass: "Y", origin: "DXB", destination: "DAR",
        departureLocal: "2026-10-26T10:20", arrivalLocal: "2026-10-26T15:00", arrivalDayOffset: 0, statusCode: "HK", seats: 3,
      },
    ]);
  });

  it("reads the FA ticket lines and maps them to passengers", () => {
    expect(pnr.tickets).toEqual([
      { pnrPaxNo: 1, ticketNumber: "176-2401234567", carrier: "EK", currency: "USD", amount: 1450, issuedAt: "2026-09-28" },
      { pnrPaxNo: 2, ticketNumber: "176-2401234568", carrier: "EK", currency: "USD", amount: 1450, issuedAt: "2026-09-28" },
      { pnrPaxNo: 3, ticketNumber: "176-2401234569", carrier: "EK", currency: "USD", amount: 1120, issuedAt: "2026-09-28" },
    ]);
  });

  it("reads contacts, has no time limit (TK OK), no warnings and keeps the raw text", () => {
    expect(pnr.contacts).toEqual([
      { type: "phone", value: "+255754000111" },
      { type: "email", value: "peter@example.com" },
    ]);
    expect(pnr.ticketingTimeLimit).toBeUndefined();
    expect(pnr.warnings).toEqual([]);
    expect(pnr.raw).toBe(FAMILY);
  });
});

describe("sample: booked-return.txt", () => {
  const pnr = parsePnr(BOOKED, NOW);

  it("reads a booked KQ return with a ticketing time limit and no tickets", () => {
    expect(pnr.recordLocator).toBe("W3JN6P");
    expect(pnr.passengers.map((p) => `${p.pnrPaxNo}.${p.surname}/${p.givenName} ${p.title}`)).toEqual(["1.SWAI/JOHN MR", "2.SWAI/MARY MRS"]);
    expect(pnr.segments.map((s) => [s.segmentNo, s.carrier, s.flightNumber, s.origin, s.destination, s.departureLocal, s.statusCode, s.seats])).toEqual([
      [3, "KQ", "483", "DAR", "NBO", "2026-10-16T10:15", "HK", 2],
      [4, "KQ", "482", "NBO", "DAR", "2026-10-20T07:15", "HK", 2],
    ]);
    expect(pnr.tickets).toEqual([]);
    expect(pnr.warnings).toEqual([]);
  });

  it("turns TK TL05OCT into 23:59 Dar time (UTC+3) as UTC", () => {
    expect(pnr.ticketingTimeLimit).toBe("2026-10-05T20:59:00.000Z");
  });

  it("normalises a local Tanzanian phone number to E.164", () => {
    expect(pnr.contacts).toContainEqual({ type: "phone", value: "+255713456789" });
    expect(pnr.contacts).toContainEqual({ type: "email", value: "john.swai@example.com" });
  });
});

describe("sample: multi-city.txt", () => {
  const pnr = parsePnr(MULTI, NOW);

  it("reads five segments across TK, KL and QR, with and without a space before the flight number", () => {
    expect(pnr.recordLocator).toBe("T5MV8C");
    expect(pnr.segments.map((s) => `${s.carrier}${s.flightNumber} ${s.bookingClass} ${s.origin}-${s.destination}`)).toEqual([
      "TK604 J DAR-IST",
      "TK1951 J IST-AMS",
      "KL1001 Y AMS-LHR",
      "QR4 C LHR-DOH",
      "QR1349 C DOH-DAR",
    ]);
  });

  it("applies an explicit +1 arrival", () => {
    const qr4 = pnr.segments.find((s) => s.flightNumber === "4");
    expect(qr4).toMatchObject({ departureLocal: "2026-11-09T21:55", arrivalLocal: "2026-11-10T07:35", arrivalDayOffset: 1 });
  });

  it("decodes an Amadeus-encoded e-mail (// for @) and reads APM", () => {
    expect(pnr.contacts).toEqual([
      { type: "phone", value: "+255754222333" },
      { type: "email", value: "daniel.mosha@acme.co.tz" },
    ]);
  });

  it("ignores the RLR banner and SSR lines", () => {
    expect(pnr.passengers).toHaveLength(1);
    expect(pnr.ticketingTimeLimit).toBe("2026-10-20T20:59:00.000Z");
    expect(pnr.warnings).toEqual([]);
  });
});

describe("sample: infant.txt", () => {
  const pnr = parsePnr(INFANT, NOW);

  it("adds the infant inside a name as an extra INF passenger with its own number", () => {
    expect(pnr.passengers).toEqual([
      { pnrPaxNo: 1, surname: "KAHAMA", givenName: "ASHA", title: "MRS", paxType: "ADT" },
      { pnrPaxNo: 2, surname: "KAHAMA", givenName: "JUMA", title: "MR", paxType: "ADT" },
      { pnrPaxNo: 3, surname: "KAHAMA", givenName: "ZAWADI", paxType: "INF", dateOfBirth: "2026-01-10" },
    ]);
  });

  it("maps FA INF …/P1 to the infant travelling with P1", () => {
    expect(pnr.tickets.map((t) => [t.pnrPaxNo, t.ticketNumber, t.amount])).toEqual([
      [1, "071-2401555001", 980],
      [3, "071-2401555002", 98],
      [2, "071-2401555003", 980],
    ]);
  });

  it("infers +1 when the arrival time is earlier than the departure (no +1, no arrival date)", () => {
    expect(pnr.segments[1]).toMatchObject({ origin: "ADD", destination: "FRA", departureLocal: "2026-11-14T23:30", arrivalLocal: "2026-11-15T04:40", arrivalDayOffset: 1 });
    expect(pnr.segments[0].arrivalDayOffset).toBe(0);
    expect(pnr.warnings).toEqual([]);
  });
});

describe("samples agree with the Amadeus mock fixtures", () => {
  const pairs: [string, string, MockFixture][] = [
    ["ticketed-family.txt", FAMILY, fixtureZ8K4QM as unknown as MockFixture],
    ["booked-return.txt", BOOKED, fixtureW3JN6P as unknown as MockFixture],
    ["multi-city.txt", MULTI, fixtureT5MV8C as unknown as MockFixture],
    ["infant.txt", INFANT, fixtureL9BX2D as unknown as MockFixture],
  ];
  it.each(pairs)("%s", (_name, text, fixture) => {
    const { mock: _mock, ...expected } = fixture;
    void _mock;
    const { raw: _raw, warnings, ...parsed } = parsePnr(text, NOW);
    void _raw;
    expect(warnings).toEqual([]);
    expect(parsed).toEqual(expected);
  });
});

describe("edge cases", () => {
  it("accepts lower-case input", () => {
    expect(core(FAMILY.toLowerCase())).toEqual(core(FAMILY));
    expect(core(INFANT.toLowerCase())).toEqual(core(INFANT));
  });

  it("tolerates extra blank lines, tabs, CRLF and extra spaces", () => {
    const messy = FAMILY.split("\n")
      .map((l) => l.replace(/ {2,}/g, "     ").replace(/^ +/, "\t"))
      .join("\r\n\r\n\r\n");
    expect(core(messy)).toEqual(core(FAMILY));
  });

  it("tolerates non-breaking spaces from web terminals", () => {
    const nbsp = String.fromCharCode(0xa0);
    expect(core(BOOKED.replace(/ /g, nbsp))).toEqual(core(BOOKED));
  });

  it("ignores ')>' prompts, '>' command echoes and MD pagination lines", () => {
    const lines = FAMILY.split("\n");
    const noisy = [
      ">RT Z8K4QM",
      lines[0] + "  )>",
      lines[1],
      lines[2] + ")>",
      "  )>",
      ">MD",
      "MD",
      ...lines.slice(3, 7).map((l) => l + " )>"),
      "> md",
      ...lines.slice(7),
      ")>",
    ].join("\n");
    expect(core(noisy)).toEqual(core(FAMILY));
  });

  it("does not duplicate anything when overlapping pages are pasted twice", () => {
    const lines = FAMILY.trim().split("\n");
    const overlapped = [...lines.slice(0, 7), ")>", "MD", ...lines.slice(3)].join("\n");
    expect(core(overlapped)).toEqual(core(FAMILY));
  });

  it("warns when the header is missing, and resolves dates from `now`", () => {
    const noHeader = FAMILY.split("\n").slice(1).join("\n");
    const pnr = parsePnr(noHeader, NOW);
    expect(pnr.recordLocator).toBe("");
    expect(pnr.officeId).toBeUndefined();
    expect(pnr.createdAt).toBeUndefined();
    expect(pnr.warnings).toHaveLength(1);
    expect(pnr.warnings[0]).toMatch(/No header line/);
    expect(pnr.passengers).toHaveLength(3);
    expect(pnr.segments[0].departureLocal).toBe("2026-10-12T16:50");
  });

  it("uses `now` for the time limit when there is no header", () => {
    const pnr = parsePnr(BOOKED.split("\n").slice(1).join("\n"), NOW);
    expect(pnr.ticketingTimeLimit).toBe("2026-10-05T20:59:00.000Z");
  });

  it("reads a time limit with an explicit time (TK TL05OCT/1200)", () => {
    const pnr = parsePnr(BOOKED.replace("TK TL05OCT/DARTZ2100", "TK TL05OCT/1200/DARTZ2100"), NOW);
    expect(pnr.ticketingTimeLimit).toBe("2026-10-05T09:00:00.000Z");
  });

  it("rolls a date without a year into next year when it is before the creation date", () => {
    const pnr = parsePnr(
      ["RP/DARTZ2100/DARTZ2100 GK/SU 20DEC26/1000Z ABC123", " 1.JUMA/ALI MR", " 2  TC 100 Y 05JAN 2 DARZNZ HK1  0800 0825"].join("\n"),
      NOW,
    );
    expect(pnr.segments[0].departureLocal).toBe("2027-01-05T08:00");
  });

  describe("segments crossing midnight", () => {
    const pnrWith = (seg: string) => parsePnr(["RP/DARTZ2100/DARTZ2100 GK/SU 28SEP26/0812Z ABC123", " 1.JUMA/ALI MR", seg].join("\n"), NOW).segments[0];

    it("explicit +1", () => {
      expect(pnrWith(" 2  QR1350 Y 12OCT 1 DARDOH HK1  2340 0535+1")).toMatchObject({ arrivalLocal: "2026-10-13T05:35", arrivalDayOffset: 1 });
    });
    it("explicit +1 after a space", () => {
      expect(pnrWith(" 2  QR1350 Y 12OCT 1 DARDOH HK1  2340 0535 +1")).toMatchObject({ arrivalLocal: "2026-10-13T05:35", arrivalDayOffset: 1 });
    });
    it("arrival date column only", () => {
      expect(pnrWith(" 2  QR1350 Y 12OCT 1 DARDOH HK1  2340 0535   13OCT  E  QR/X")).toMatchObject({ arrivalLocal: "2026-10-13T05:35", arrivalDayOffset: 1 });
    });
    it("arrival time earlier than departure only", () => {
      expect(pnrWith(" 2  QR1350 Y 12OCT 1 DARDOH HK1  2340 0535")).toMatchObject({ arrivalLocal: "2026-10-13T05:35", arrivalDayOffset: 1 });
    });
    it("+2", () => {
      expect(pnrWith(" 2  QR 908 Y 12OCT 1 DOHSYD HK1  2010 0620+2")).toMatchObject({ arrivalLocal: "2026-10-14T06:20", arrivalDayOffset: 2 });
    });
  });

  describe("infants", () => {
    const withName = (name: string) => parsePnr(["RP/DARTZ2100/DARTZ2100 GK/SU 28SEP26/0812Z ABC123", name].join("\n"), NOW);

    it("(INFSURNAME/GIVEN/DOB) with a different surname", () => {
      const pnr = withName(" 1.MWAKALINGA/ANNA MRS(INFJUMA/BABY/10JAN26)");
      expect(pnr.passengers[1]).toEqual({ pnrPaxNo: 2, surname: "JUMA", givenName: "BABY", paxType: "INF", dateOfBirth: "2026-01-10" });
    });
    it("(INF/GIVEN/DOB) takes the adult's surname", () => {
      const pnr = withName(" 1.MWAKALINGA/ANNA MRS(INF/BABY/10JAN26)");
      expect(pnr.passengers[1]).toEqual({ pnrPaxNo: 2, surname: "MWAKALINGA", givenName: "BABY", paxType: "INF", dateOfBirth: "2026-01-10" });
    });
    it("(INFGIVEN/DOB) takes the adult's surname", () => {
      const pnr = withName(" 1.MWAKALINGA/ANNA MRS(INFBABY/10JAN26)");
      expect(pnr.passengers[1]).toMatchObject({ surname: "MWAKALINGA", givenName: "BABY", dateOfBirth: "2026-01-10" });
    });
    it("numbers infants after every named passenger", () => {
      const pnr = withName(" 1.MWAKALINGA/ANNA MRS(INF/BABY/10JAN26)  2.MWAKALINGA/PETER MR");
      expect(pnr.passengers.map((p) => [p.pnrPaxNo, p.givenName, p.paxType])).toEqual([
        [1, "ANNA", "ADT"],
        [2, "PETER", "ADT"],
        [3, "BABY", "INF"],
      ]);
    });
    it("an infant without a name gets a warning", () => {
      const pnr = withName(" 1.MWAKALINGA/ANNA MRS(INF)");
      expect(pnr.passengers[1]).toMatchObject({ paxType: "INF", surname: "MWAKALINGA", givenName: "" });
      expect(pnr.warnings.join(" ")).toMatch(/infant travelling with passenger 1 has no name/);
    });
    it("an FA INF line with no matching infant is skipped with a warning", () => {
      const pnr = parsePnr(INFANT.replace("(INFKAHAMA/ZAWADI/10JAN26)", ""), NOW);
      expect(pnr.tickets.map((t) => t.ticketNumber)).toEqual(["071-2401555001", "071-2401555003"]);
      expect(pnr.warnings.join(" ")).toMatch(/Infant ticket 071-2401555002/);
    });
  });

  describe("names", () => {
    const withNames = (...lines: string[]) => parsePnr(["RP/DARTZ2100/DARTZ2100 GK/SU 28SEP26/0812Z ABC123", ...lines].join("\n"), NOW);

    it("reads three names on one line, middle names, hyphens and apostrophes", () => {
      const pnr = withNames(" 1.O'BRIEN/MARY ANNE MS  2.MWAKALINGA-SHAYO/JOHN PETER MR  3.ALI/FATMA MISS(CHD/01FEB19)");
      expect(pnr.passengers).toEqual([
        { pnrPaxNo: 1, surname: "O'BRIEN", givenName: "MARY ANNE", title: "MS", paxType: "ADT" },
        { pnrPaxNo: 2, surname: "MWAKALINGA-SHAYO", givenName: "JOHN PETER", title: "MR", paxType: "ADT" },
        { pnrPaxNo: 3, surname: "ALI", givenName: "FATMA", title: "MISS", paxType: "CHD", dateOfBirth: "2019-02-01" },
      ]);
    });
    it("reads a name without a title, a child without a date, and strips DR", () => {
      const pnr = withNames(" 1.JUMA/ALI  2.JUMA/SARA(CHD)  3.KIMARO/GRACE DR");
      expect(pnr.passengers).toEqual([
        { pnrPaxNo: 1, surname: "JUMA", givenName: "ALI", paxType: "ADT" },
        { pnrPaxNo: 2, surname: "JUMA", givenName: "SARA", paxType: "CHD" },
        { pnrPaxNo: 3, surname: "KIMARO", givenName: "GRACE", paxType: "ADT" },
      ]);
    });
    it("reads a 19xx date of birth for an adult annotation", () => {
      const pnr = withNames(" 1.JUMA/ALI MR(CHD/15JUN80)");
      expect(pnr.passengers[0].dateOfBirth).toBe("1980-06-15");
    });
  });

  describe("status codes, tickets and currencies", () => {
    const base = ["RP/DARTZ2100/DARTZ2100 GK/SU 28SEP26/0812Z ABC123", " 1.JUMA/ALI MR"];

    it("maps GK to HK and unknown codes to UC, with warnings", () => {
      const pnr = parsePnr([...base, " 2  TC 100 Y 12OCT 1 DARZNZ GK1  0800 0825", " 3  TC 101 Y 14OCT 3 ZNZDAR ZZ1  1800 1825"].join("\n"), NOW);
      expect(pnr.segments.map((s) => s.statusCode)).toEqual(["HK", "UC"]);
      expect(pnr.warnings).toHaveLength(2);
    });
    it("reads every stored status code and the seat count", () => {
      for (const code of ["HK", "KK", "TK", "HL", "UN", "UC", "NO", "HX", "XX"]) {
        const pnr = parsePnr([...base, ` 2  TC 100 Y 12OCT 1 DARZNZ ${code}12  0800 0825`].join("\n"), NOW);
        expect(pnr.segments[0]).toMatchObject({ statusCode: code, seats: 12 });
        expect(pnr.warnings).toEqual([]);
      }
    });
    it("assigns an FA line without /P to the only passenger and ignores a conjunction suffix", () => {
      const pnr = parsePnr([...base, " 3 FA PAX 176-2401234567-68/ETEK/USD1450.00/28SEP26/DARTZ2100/00000000/S2"].join("\n"), NOW);
      expect(pnr.tickets).toEqual([{ pnrPaxNo: 1, ticketNumber: "176-2401234567", carrier: "EK", currency: "USD", amount: 1450, issuedAt: "2026-09-28" }]);
    });
    it("reads an FA line without a dash in the ticket number and in TZS", () => {
      const pnr = parsePnr([...base, " 3 FA PAX 1972401234567/ETTC/TZS350000/28SEP26/DARTZ2100/00000000/S2/P1"].join("\n"), NOW);
      expect(pnr.tickets[0]).toMatchObject({ ticketNumber: "197-2401234567", carrier: "TC", currency: "TZS", amount: 350000 });
    });
    it("keeps the ticket but not the amount when the fare is in another currency", () => {
      const pnr = parsePnr([...base, " 3 FA PAX 074-2401234567/ETKL/EUR1200.00/28SEP26/DARTZ2100/00000000/S2/P1"].join("\n"), NOW);
      expect(pnr.tickets[0]).toEqual({ pnrPaxNo: 1, ticketNumber: "074-2401234567", carrier: "KL", issuedAt: "2026-09-28" });
      expect(pnr.warnings.join(" ")).toMatch(/EUR/);
    });
    it("reads OPERATED BY under a segment", () => {
      const pnr = parsePnr([...base, " 2  KL 569 Y 12OCT 1 DARJRO HK1  0800 0900", "     OPERATED BY KQ"].join("\n"), NOW);
      expect(pnr.segments[0].operatingCarrier).toBe("KQ");
    });
  });

  describe("never throws; warns about missing essentials", () => {
    it("empty input", () => {
      const pnr = parsePnr("", NOW);
      expect(pnr.warnings).toEqual(["Nothing to read. Paste the PNR display from the Amadeus terminal."]);
      expect(pnr).toMatchObject({ recordLocator: "", passengers: [], segments: [], tickets: [], contacts: [] });
    });
    it("garbage input", () => {
      expect(() => parsePnr("hello\n)>\n12345\n//// (((( \u0000", NOW)).not.toThrow();
      const pnr = parsePnr("hello world", NOW);
      expect(pnr.warnings).toHaveLength(3);
    });
    it("non-string input and an invalid clock", () => {
      expect(() => parsePnr(undefined as unknown as string, NOW)).not.toThrow();
      expect(() => parsePnr(FAMILY, new Date("nope"))).not.toThrow();
    });
    it("header only: no passengers, no segments", () => {
      const pnr = parsePnr("RP/DARTZ2100/DARTZ2100 GK/SU 28SEP26/0812Z Z8K4QM", NOW);
      expect(pnr.recordLocator).toBe("Z8K4QM");
      expect(pnr.warnings).toEqual(["No passenger names found.", "No flight segments found."]);
    });
    it("header without a record locator", () => {
      const pnr = parsePnr(FAMILY.replace("Z8K4QM\n", "\n"), NOW);
      expect(pnr.recordLocator).toBe("");
      expect(pnr.warnings).toEqual(["No record locator found on the header line. Type it in before saving."]);
    });
  });
});
