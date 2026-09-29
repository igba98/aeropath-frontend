import { describe, expect, it } from "vitest";
import type { FlightLine } from "../types";
import { major } from "../money";
import { addServiceLine, importFromProvider, transitionLine, voidLine } from "../commands";
import { normalisePhone } from "../commands";
import { normaliseTicket } from "../validation";
import { addFlight, flightDetails, issuedFlightScenario, newClient, newFile } from "./builders";
import { attempt, createWorld, errorOf, run } from "./fixtures";

describe("ticket numbers", () => {
  it("normalise to ddd-dddddddddd", () => {
    expect(normaliseTicket("1762401234567")).toBe("176-2401234567");
    expect(normaliseTicket(" 176-2401234567 ")).toBe("176-2401234567");
    expect(normaliseTicket("176-240123456")).toBeNull();
  });

  it("are stored normalised when issuing", () => {
    const w = createWorld();
    const { clientId, travellerIds } = newClient(w);
    const { fileId } = newFile(w, clientId, travellerIds);
    const lineId = addFlight(w, fileId, travellerIds);
    run(w, transitionLine, { lineId, to: "issued", tickets: [{ travellerId: travellerIds[0], ticketNumber: "1769999999999" }] }, "neema");
    expect((w.db.lines[lineId] as FlightLine).details.passengers[0].ticketNumber).toBe("176-9999999999");
  });

  it("must be unique across bookings", () => {
    const w = createWorld();
    const first = issuedFlightScenario(w);
    const { clientId, travellerIds } = newClient(w);
    const { fileId } = newFile(w, clientId, travellerIds);
    const lineId = addFlight(w, fileId, travellerIds, { locator: "ABC123" });
    const e = errorOf(attempt(w, transitionLine, { lineId, to: "issued", tickets: [{ travellerId: travellerIds[0], ticketNumber: first.tickets[0] }] }, "neema"));
    expect(e.code).toBe("CONFLICT");
    expect(e.message).toMatch(/already recorded on booking AP-2026-000001/);
  });

  it("cannot repeat within one issue", () => {
    const w = createWorld();
    const { clientId, travellerIds } = newClient(w, { travellers: 2 });
    const { fileId } = newFile(w, clientId, travellerIds);
    const lineId = addFlight(w, fileId, travellerIds);
    const tickets = travellerIds.map((travellerId) => ({ travellerId, ticketNumber: "176-1111111111" }));
    expect(errorOf(attempt(w, transitionLine, { lineId, to: "issued", tickets }, "neema")).code).toBe("CONFLICT");
  });

  it("stay reserved after a void", () => {
    const w = createWorld();
    const first = issuedFlightScenario(w);
    run(w, voidLine, { lineId: first.lineId }, "neema");
    const { clientId, travellerIds } = newClient(w);
    const { fileId } = newFile(w, clientId, travellerIds);
    const r = attempt(
      w,
      addServiceLine,
      { fileId, type: "flight", travellerIds, details: flightDetails(travellerIds, { locator: "QWE123", tickets: [first.tickets[0]] }), pricing: { currency: "USD", markup: major(10, "USD") } },
      "neema",
    );
    const e = errorOf(r);
    expect(e.code).toBe("CONFLICT");
    expect(e.message).toMatch(/voided/);
  });

  it("are checked on import too", () => {
    const w = createWorld();
    const first = issuedFlightScenario(w);
    const { clientId, travellerIds } = newClient(w);
    const { fileId } = newFile(w, clientId, travellerIds);
    const r = attempt(
      w,
      importFromProvider,
      { fileId, details: flightDetails(travellerIds, { locator: "IMP123", tickets: [first.tickets[0]] }), external: { provider: "amadeus", externalIds: {} }, source: "amadeus", pricing: { markup: major(0, "USD") } },
      "neema",
    );
    expect(errorOf(r).code).toBe("CONFLICT");
  });
});

describe("phone numbers", () => {
  it("normalise local Tanzanian numbers to E.164", () => {
    expect(normalisePhone("0754 123 456")).toBe("+255754123456");
    expect(normalisePhone("255754123456")).toBe("+255754123456");
    expect(normalisePhone("+44 20 7946 0958")).toBe("+442079460958");
    expect(normalisePhone("12345")).toBeNull();
  });
});
