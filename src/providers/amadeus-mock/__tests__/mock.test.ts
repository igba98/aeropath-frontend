import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Settings } from "@/domain/types";
import { AIRLINES } from "@/store/seed/reference";
import { getProvider, LIVE_NOT_AVAILABLE } from "../..";
import { ProviderError } from "../../types";
import { createAmadeusMockProvider, MOCK_RECORD_LOCATORS, resetMockMemory, type AmadeusMockOptions } from "..";

const NOW = new Date("2026-09-28T09:00:00.000Z"); // 12:00 in Dar
const noWait = () => Promise.resolve();

const mock = (opts: AmadeusMockOptions = {}) => createAmadeusMockProvider({ latencyMs: 0, sleep: noWait, now: () => NOW, ...opts });

/** Deterministic random source cycling through the given values. */
const seq = (...values: number[]) => {
  let i = 0;
  return () => values[i++ % values.length];
};

const rejection = async (p: Promise<unknown>) => {
  try {
    await p;
  } catch (e) {
    return e as ProviderError;
  }
  throw new Error("expected a rejection");
};

const settings = (mode: "off" | "mock" | "live", failure: Settings["integrations"]["amadeus"]["mock"]["failure"] = "none"): Pick<Settings, "integrations" | "airlines"> => ({
  airlines: AIRLINES,
  integrations: { amadeus: { mode, environment: "test", officeId: "DARTZ2100", mock: { latencyMs: 0, failure } } },
});

beforeEach(() => resetMockMemory());

describe("getProvider", () => {
  it("off → manual", async () => {
    const p = getProvider(settings("off"));
    expect(p.id).toBe("manual");
    expect(await p.ping()).toEqual({ ok: false, message: "Manual mode" });
    const e = await rejection(p.retrievePnr("Z8K4QM"));
    expect(e).toBeInstanceOf(ProviderError);
    expect(e.code).toBe("NOT_SUPPORTED");
    expect(e.message).toBe("Amadeus is not connected. Use Paste PNR or enter the flight manually.");
    for (const call of [p.issueTicket("Z8K4QM"), p.voidDocument("176-2401234567"), p.refundQuote("176-2401234567"), p.readQueue("50C0")]) {
      expect((await rejection(call)).code).toBe("NOT_SUPPORTED");
    }
  });

  it("live → manual with a clear ping message", async () => {
    const p = getProvider(settings("live"));
    expect(p.id).toBe("manual");
    expect(await p.ping()).toEqual({ ok: false, message: LIVE_NOT_AVAILABLE });
    expect((await rejection(p.retrievePnr("Z8K4QM"))).message).toMatch(/^Live is available after the API contract\. Use Paste PNR/);
  });

  it("mock → amadeus-mock using the settings' failure mode", async () => {
    const p = getProvider(settings("mock", "auth_error"));
    expect(p.id).toBe("amadeus-mock");
    expect((await rejection(p.retrievePnr("Z8K4QM"))).code).toBe("AUTH");
  });
});

describe("amadeus-mock: retrievePnr", () => {
  it("knows four fixtures", () => {
    expect(MOCK_RECORD_LOCATORS).toEqual(["Z8K4QM", "W3JN6P", "T5MV8C", "L9BX2D"]);
  });

  it("looks locators up case-insensitively and re-bases dates: first departure today + 10, gaps kept", async () => {
    const pnr = await mock().retrievePnr(" z8k4qm ");
    expect(pnr.recordLocator).toBe("Z8K4QM");
    expect(pnr.segments.map((s) => [s.departureLocal, s.arrivalLocal])).toEqual([
      ["2026-10-08T16:50", "2026-10-08T23:05"],
      ["2026-10-22T10:20", "2026-10-22T15:00"],
    ]);
    expect(pnr.passengers).toHaveLength(3);
    expect(pnr.tickets.map((t) => t.ticketNumber)).toEqual(["176-2401234567", "176-2401234568", "176-2401234569"]);
    expect(pnr.tickets.every((t) => (t.issuedAt as string) <= "2026-09-28")).toBe(true);
    expect(Date.parse(pnr.createdAt as string)).toBeLessThan(NOW.getTime());
    expect(pnr.warnings).toEqual([]);
    expect(JSON.parse(pnr.raw)).toMatchObject({ source: "amadeus-mock", pnr: { recordLocator: "Z8K4QM" } });
  });

  it("re-bases relative to whatever `now` is, keeping the +1 day on overnight flights", async () => {
    const later = new Date("2027-03-01T22:30:00.000Z"); // already 2 March in Dar
    const pnr = await mock({ now: () => later }).retrievePnr("T5MV8C");
    expect(pnr.segments[0].departureLocal).toBe("2027-03-12T02:00");
    expect(pnr.segments[3]).toMatchObject({ departureLocal: "2027-03-19T21:55", arrivalLocal: "2027-03-20T07:35", arrivalDayOffset: 1 });
  });

  it("puts the ticketing time limit 36 hours from now on booked PNRs", async () => {
    const pnr = await mock().retrievePnr("W3JN6P");
    expect(pnr.ticketingTimeLimit).toBe("2026-09-29T21:00:00.000Z");
    expect(pnr.tickets).toEqual([]);
  });

  it("does not let callers mutate the fixtures", async () => {
    const a = await mock().retrievePnr("Z8K4QM");
    a.passengers[0].surname = "CHANGED";
    const b = await mock().retrievePnr("Z8K4QM");
    expect(b.passengers[0].surname).toBe("MWAKALINGA");
  });

  it("unknown locator → NOT_FOUND with a friendly message", async () => {
    const e = await rejection(mock().retrievePnr("AB12CD"));
    expect(e.code).toBe("NOT_FOUND");
    expect(e.message).toBe("No booking found for AB12CD. Check the record locator.");
  });

  it("malformed locator → NOT_FOUND explaining the format", async () => {
    const e = await rejection(mock().retrievePnr("Z8K4"));
    expect(e.code).toBe("NOT_FOUND");
    expect(e.message).toMatch(/isn't a record locator/);
  });

  it("waits the configured latency", async () => {
    const sleep = vi.fn(noWait);
    await mock({ latencyMs: 1200, sleep }).retrievePnr("Z8K4QM");
    expect(sleep).toHaveBeenCalledWith(1200);
  });

  it("really waits when no sleep is injected", async () => {
    vi.useFakeTimers();
    try {
      const p = createAmadeusMockProvider({ latencyMs: 500, now: () => NOW }).retrievePnr("Z8K4QM");
      let done = false;
      void p.then(() => (done = true));
      await vi.advanceTimersByTimeAsync(499);
      expect(done).toBe(false);
      await vi.advanceTimersByTimeAsync(1);
      expect(done).toBe(true);
    } finally {
      vi.useRealTimers();
    }
  });
});

describe("amadeus-mock: failure modes", () => {
  it("timeout", async () => {
    const e = await rejection(mock({ failure: "timeout" }).retrievePnr("Z8K4QM"));
    expect(e.code).toBe("TIMEOUT");
    expect(e.message).toBe("Amadeus didn't answer in time. Try again, or enter the flight manually.");
  });

  it("auth_error", async () => {
    const e = await rejection(mock({ failure: "auth_error" }).retrievePnr("Z8K4QM"));
    expect(e.code).toBe("AUTH");
    expect(e.message).toBe("Amadeus rejected our credentials. Ask your manager to check Settings → Integrations.");
  });

  it("not_found", async () => {
    const e = await rejection(mock({ failure: "not_found" }).retrievePnr("Z8K4QM"));
    expect(e.code).toBe("NOT_FOUND");
    expect(e.message).toBe("No booking found for Z8K4QM. Check the record locator.");
  });

  it("random: fails when the draw is under 30%, with a random code", async () => {
    expect((await rejection(mock({ failure: "random", random: seq(0.1, 0.0) }).retrievePnr("Z8K4QM"))).code).toBe("TIMEOUT");
    expect((await rejection(mock({ failure: "random", random: seq(0.1, 0.5) }).retrievePnr("Z8K4QM"))).code).toBe("NOT_FOUND");
    expect((await rejection(mock({ failure: "random", random: seq(0.29, 0.99) }).retrievePnr("Z8K4QM"))).code).toBe("AUTH");
    await expect(mock({ failure: "random", random: seq(0.3) }).retrievePnr("Z8K4QM")).resolves.toMatchObject({ recordLocator: "Z8K4QM" });
  });

  it("random: roughly 30% of calls fail over many calls", async () => {
    let seed = 42;
    const lcg = () => ((seed = (seed * 1664525 + 1013904223) % 4294967296) / 4294967296);
    const p = mock({ failure: "random", random: lcg });
    let failures = 0;
    for (let i = 0; i < 1000; i++) {
      try {
        await p.retrievePnr("Z8K4QM");
      } catch {
        failures++;
      }
    }
    expect(failures).toBeGreaterThan(240);
    expect(failures).toBeLessThan(360);
  });
});

describe("amadeus-mock: ping", () => {
  it("ok with a message", async () => {
    const r = await mock({ latencyMs: 0 }).ping();
    expect(r.ok).toBe(true);
    expect(r.message).toMatch(/^Connected to the Amadeus mock \(test, office DARTZ2100\)/);
  });
  it("mentions a simulated failure mode that only affects lookups", async () => {
    const r = await mock({ failure: "not_found" }).ping();
    expect(r).toMatchObject({ ok: true });
    expect(r.message).toMatch(/not found/);
  });
  it("reports auth and timeout failures without throwing", async () => {
    expect(await mock({ failure: "auth_error" }).ping()).toEqual({ ok: false, message: "Amadeus rejected our credentials. Ask your manager to check Settings → Integrations." });
    expect((await mock({ failure: "timeout" }).ping()).ok).toBe(false);
  });
});

describe("amadeus-mock: issueTicket, voidDocument, refundQuote, readQueue", () => {
  it("issues tickets with the airline prefix and a 10-digit serial, then the PNR shows them", async () => {
    const p = mock({ random: seq(0.12, 0.34, 0.56, 0.78, 0.9) });
    const { tickets } = await p.issueTicket("W3JN6P");
    expect(tickets).toHaveLength(2);
    for (const t of tickets) {
      expect(t.ticketNumber).toMatch(/^706-\d{10}$/);
      expect(t).toMatchObject({ carrier: "KQ", currency: "USD", amount: 385, issuedAt: "2026-09-28" });
    }
    expect(new Set(tickets.map((t) => t.ticketNumber)).size).toBe(2);
    expect(tickets.map((t) => t.pnrPaxNo)).toEqual([1, 2]);

    const again = await p.issueTicket("W3JN6P");
    expect(again.tickets).toEqual(tickets);

    const pnr = await p.retrievePnr("W3JN6P");
    expect(pnr.tickets).toEqual(tickets);
    expect(pnr.ticketingTimeLimit).toBeUndefined();
  });

  it("returns the existing tickets for an already ticketed PNR", async () => {
    const { tickets } = await mock().issueTicket("Z8K4QM");
    expect(tickets.map((t) => t.ticketNumber)).toEqual(["176-2401234567", "176-2401234568", "176-2401234569"]);
  });

  it("explains a missing ticket prefix", async () => {
    const airlines = AIRLINES.map((a) => (a.code === "TK" ? { ...a, ticketPrefix: undefined } : a));
    const e = await rejection(mock({ airlines }).issueTicket("T5MV8C"));
    expect(e.code).toBe("UNKNOWN");
    expect(e.message).toBe("No ticket prefix is set for Turkish Airlines (TK). Add it in Settings → Airlines, then try again.");
  });

  it("voids a document", async () => {
    await expect(mock().voidDocument("1762401234567")).resolves.toEqual({ ok: true });
    expect((await rejection(mock().voidDocument("176-24"))).code).toBe("NOT_FOUND");
    expect((await rejection(mock({ failure: "timeout" }).voidDocument("176-2401234567"))).code).toBe("TIMEOUT");
  });

  it("quotes a refund with a 15% penalty on a fixture ticket", async () => {
    expect(await mock().refundQuote("176-2401234567")).toEqual({
      supplierPenalty: { amountMinor: 21750, currency: "USD" },
      refundable: { amountMinor: 123250, currency: "USD" },
    });
  });

  it("quotes a refund on a ticket the mock issued", async () => {
    const p = mock();
    const { tickets } = await p.issueTicket("T5MV8C");
    expect(await p.refundQuote(tickets[0].ticketNumber)).toEqual({
      supplierPenalty: { amountMinor: 57900, currency: "USD" },
      refundable: { amountMinor: 328100, currency: "USD" },
    });
  });

  it("unknown ticket → NOT_FOUND", async () => {
    const e = await rejection(mock().refundQuote("176-9999999999"));
    expect(e.code).toBe("NOT_FOUND");
    expect(e.message).toBe("No ticket 176-9999999999 found in Amadeus. Check the ticket number.");
  });

  it("reads 2–3 locators from the fixtures", async () => {
    const two = await mock({ random: seq(0.9, 0.1, 0.5, 0.4) }).readQueue("50C0");
    const three = await mock({ random: seq(0.2, 0.7, 0.3, 0.6) }).readQueue("50C0");
    for (const list of [two, three]) {
      for (const item of list) {
        expect(MOCK_RECORD_LOCATORS).toContain(item.recordLocator);
        expect(item.reason.length).toBeGreaterThan(5);
      }
      expect(new Set(list.map((i) => i.recordLocator)).size).toBe(list.length);
    }
    expect([two.length, three.length].sort()).toEqual([2, 3]);
  });

  it("an empty queue in not_found mode", async () => {
    expect(await mock({ failure: "not_found" }).readQueue("50C0")).toEqual([]);
  });
});
