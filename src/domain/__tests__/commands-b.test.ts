import { describe, expect, it } from "vitest";
import type { FlightLine } from "../types";
import { major, money } from "../money";
import { importFromProvider, issueInvoice, issueQuote, reassignFile, removeTraveller, resetDemoData, updateServiceLine, updateSettings, upsertUser } from "../commands";
import { currentInvoice, isInvoiceOutdated } from "../selectors/core";
import { fileTotals } from "../selectors/fileTotals";
import { addFlight, flightDetails, issuedFlightScenario, newClient, newFile } from "./builders";
import { attempt, createWorld, errorOf, run } from "./fixtures";

const usd = (n: number) => major(n, "USD");
const ext = { provider: "amadeus" as const, externalIds: {} };

describe("invoices and quotes", () => {
  it("snapshot equals charges; a new invoice supersedes the old; changes mark it outdated", () => {
    const w = createWorld();
    const { clientId, travellerIds } = newClient(w);
    const { fileId } = newFile(w, clientId, travellerIds);
    const lineId = addFlight(w, fileId, travellerIds);
    const first = run(w, issueInvoice, { fileId }, "neema");
    expect(first.number).toBe("INV-2026-00001");
    const inv = w.db.invoices[first.invoiceId];
    expect(inv.snapshot.total).toEqual(fileTotals(w.db, fileId).charges);
    expect(inv.snapshot.vat).toEqual(money(360, "USD"));
    expect(inv.snapshot.subtotal).toEqual(money(152000, "USD"));
    expect(isInvoiceOutdated(w.db, fileId)).toBe(false);
    run(w, updateServiceLine, { lineId, patch: { pricing: { markup: usd(80) } } }, "neema");
    expect(isInvoiceOutdated(w.db, fileId)).toBe(true);
    const second = run(w, issueInvoice, { fileId }, "peter");
    expect(w.db.invoices[first.invoiceId].status).toBe("superseded");
    expect(currentInvoice(w.db, fileId)?.id).toBe(second.invoiceId);
  });
  it("a quote takes quoted and booked lines; an invoice needs a booked line", () => {
    const w = createWorld();
    const { clientId, travellerIds } = newClient(w);
    const { fileId } = newFile(w, clientId, travellerIds);
    addFlight(w, fileId, travellerIds, { booked: false });
    expect(errorOf(attempt(w, issueInvoice, { fileId }, "neema")).code).toBe("VALIDATION");
    const q = run(w, issueQuote, { fileId }, "neema");
    expect(q.number).toBe("QUO-2026-00001");
    expect(w.db.invoices[q.invoiceId].snapshot.lines).toHaveLength(1);
  });
});

describe("importFromProvider", () => {
  it("creates a booked line, then updates the same PNR instead of duplicating it", () => {
    const w = createWorld();
    const { clientId, travellerIds } = newClient(w);
    const { fileId } = newFile(w, clientId, travellerIds);
    const a = run(w, importFromProvider, { fileId, details: flightDetails(travellerIds), external: ext, source: "amadeus", pricing: { markup: usd(40) } }, "neema");
    expect(a.created).toBe(true);
    expect(w.db.lines[a.lineId].status).toBe("booked");
    expect(w.db.lines[a.lineId].supplierId).toBe(w.sup.consolidator);
    const b = run(w, importFromProvider, { fileId, details: flightDetails(travellerIds, { tickets: ["176-5555555555"], total: 1500 }), external: ext, source: "amadeus", pricing: { markup: usd(999) } }, "neema");
    expect(b).toEqual({ lineId: a.lineId, created: false });
    const line = w.db.lines[a.lineId] as FlightLine;
    expect(line.details.passengers[0].ticketNumber).toBe("176-5555555555");
    expect(line.pricing.markup).toEqual(usd(40)); // agent pricing kept
    expect(line.pricing.cost).toEqual(usd(1500)); // cost follows the new fare while booked
    expect(line.external?.lastSyncedAt).toBe(w.now.toISOString());
    expect(Object.keys(w.db.lines)).toHaveLength(1);
  });
  it("creates a quoted line when no segment is confirmed", () => {
    const w = createWorld();
    const { clientId, travellerIds } = newClient(w);
    const { fileId } = newFile(w, clientId, travellerIds);
    const r = run(w, importFromProvider, { fileId, details: flightDetails(travellerIds, { status: "HL" }), external: ext, source: "manual", pricing: { markup: usd(0) } }, "neema");
    expect(w.db.lines[r.lineId].status).toBe("quoted");
  });
  it("never changes an issued ticket's fare: marks drift instead", () => {
    const w = createWorld();
    const s = issuedFlightScenario(w);
    run(w, importFromProvider, { fileId: s.fileId, details: flightDetails(s.travellerIds, { total: 1600 }), external: ext, source: "amadeus", pricing: { markup: usd(0) } }, "neema");
    const line = w.db.lines[s.lineId] as FlightLine;
    expect(line.details.fare.totalFare).toEqual(usd(1450));
    expect(line.external?.syncStatus).toBe("drift");
    expect(line.details.passengers[0].ticketNumber).toBe(s.tickets[0]);
  });
});

describe("settings and admin", () => {
  it("updateSettings is Manager only, deep-merges and stamps FX changes", () => {
    const w = createWorld();
    expect(errorOf(attempt(w, updateSettings, { patch: { vatRate: 0.2 } }, "peter")).code).toBe("FORBIDDEN");
    run(w, updateSettings, { patch: { fx: { USD_TZS: 2650 }, company: { name: "Aeropath Travel" } } }, "grace");
    expect(w.db.settings.fx).toMatchObject({ USD_TZS: 2650, updatedBy: "usr_grace" });
    expect(w.db.settings.company.tin).toBe("000-000-000");
    expect(errorOf(attempt(w, updateSettings, { patch: { integrations: { amadeus: { mode: "live" } } } }, "grace")).code).toBe("VALIDATION");
    expect(errorOf(attempt(w, updateSettings, { patch: { vatRate: 18 } }, "grace")).code).toBe("VALIDATION");
  });
  it("upsertUser generates initials and keeps one active Manager", () => {
    const w = createWorld();
    const { userId } = run(w, upsertUser, { user: { name: "Juma Hassan", email: "juma@aeropath.co.tz", role: "agent" } }, "grace");
    expect(w.db.users[userId].initials).toBe("JH");
    expect(errorOf(attempt(w, upsertUser, { user: { id: "usr_grace", name: "Grace Kimaro", email: "grace@aeropath.co.tz", role: "agent" } }, "grace")).code).toBe("CONFLICT");
    expect(errorOf(attempt(w, upsertUser, { user: { name: "X", email: "neema@aeropath.co.tz", role: "agent" } }, "grace")).code).toBe("CONFLICT");
  });
  it("reassign and reset are Manager only", () => {
    const w = createWorld();
    const { clientId, travellerIds } = newClient(w);
    const { fileId } = newFile(w, clientId, travellerIds);
    expect(errorOf(attempt(w, reassignFile, { fileId, ownerId: "usr_baraka" }, "neema")).code).toBe("FORBIDDEN");
    run(w, reassignFile, { fileId, ownerId: "usr_baraka" }, "grace");
    expect(w.db.files[fileId].ownerId).toBe("usr_baraka");
    expect(errorOf(attempt(w, resetDemoData, undefined, "peter")).code).toBe("FORBIDDEN");
    expect(attempt(w, resetDemoData, undefined, "grace").ok).toBe(true);
  });
  it("a traveller on an issued line cannot be removed", () => {
    const w = createWorld();
    const s = issuedFlightScenario(w);
    expect(errorOf(attempt(w, removeTraveller, { travellerId: s.travellerIds[0] }, "neema")).code).toBe("CONFLICT");
  });
});
