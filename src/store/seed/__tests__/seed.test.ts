import { describe, expect, it } from "vitest";
import type { DbState, ID, User } from "@/domain/types";
import { decideRefund } from "@/domain/commands";
import { runCommand } from "@/domain/commands/run";
import { darToday, toDarDate } from "@/domain/dates";
import { groupImbalances } from "@/domain/ledger/postings";
import { convert } from "@/domain/money";
import { refundNeedsManager } from "@/domain/permissions";
import { fileTotals } from "@/domain/selectors/fileTotals";
import { fileStatus } from "@/domain/status/file-status";
import { isOverdue, paymentStatus } from "@/domain/status/payment-status";
import { generateSeed, generateSeedWithReport } from "../generate";
import { RESERVED_LOCATORS, RESERVED_TICKETS } from "../seed-kit";

const NOW = new Date("2026-09-28T09:00:00Z");
const { db, failures } = generateSeedWithReport(NOW);

const files = Object.values(db.files);
const lines = Object.values(db.lines);
const paymentsIn = Object.values(db.payments).filter((p) => p.direction === "in");
const userByEmail = (email: string): User => Object.values(db.users).find((u) => u.email === email)!;
const linesOf = (fileId: ID) => lines.filter((l) => l.fileId === fileId);
const clientByName = (name: string) => Object.values(db.clients).find((c) => c.name === name)!;
const statusCount = (s: ReturnType<typeof fileStatus>) => files.filter((f) => fileStatus(db, f.id, NOW) === s).length;

/** Credit used by a corporate: positive balances of its files, in TZS. */
function creditUsed(state: DbState, clientId: ID): number {
  return Object.values(state.files)
    .filter((f) => f.clientId === clientId)
    .reduce((sum, f) => sum + Math.max(0, convert(fileTotals(state, f.id).balance, "TZS", state.settings.fx.USD_TZS).amountMinor), 0);
}

describe("demo seed", () => {
  it("runs every command without a failure", () => {
    expect(failures).toEqual([]);
  });

  it("creates the master data of spec §14", () => {
    const users = Object.values(db.users);
    expect(users.map((u) => `${u.name}/${u.role}`).sort()).toEqual(["Baraka Lema/agent", "Grace Kimaro/manager", "Neema Mushi/agent", "Peter Mwakalinga/accountant"]);
    expect(userByEmail("neema@aeropath.co.tz").role).toBe("agent");
    expect(Object.keys(db.moneyAccounts)).toHaveLength(7);
    expect(Object.values(db.suppliers)).toHaveLength(11);
    expect(Object.values(db.suppliers).find((x) => x.name === "EA Hotel Bank")?.kind).toBe("hotel");
    const clients = Object.values(db.clients);
    expect(clients.filter((c) => c.type === "individual")).toHaveLength(12);
    expect(clients.filter((c) => c.type === "corporate")).toHaveLength(3);
    for (const c of clients) {
      const n = Object.values(db.travellers).filter((t) => t.clientId === c.id).length;
      expect(n, c.name).toBeGreaterThanOrEqual(1);
      expect(n, c.name).toBeLessThanOrEqual(4);
    }
    const soon = Object.values(db.travellers).filter((t) => t.passportExpiry && t.passportExpiry < toDarDate(new Date(NOW.getTime() + 183 * 86_400_000)));
    expect(soon.length).toBeGreaterThanOrEqual(3);
    const family = Object.values(db.travellers).filter((t) => t.surname === "MWAKALINGA");
    expect(family.map((t) => `${t.givenName}/${t.paxType}`).sort()).toEqual(["ANNA/ADT", "DAVID/CHD", "PETER/ADT"]);
  });

  it("applies the settings of spec §14", () => {
    const s = db.settings;
    const air = db.suppliers[s.airSettlement.supplierId];
    expect(s.airSettlement.mode).toBe("consolidator");
    expect(air.kind).toBe("air_settlement");
    expect(Object.values(db.suppliers).find((x) => x.name.startsWith("BSP"))?.active).toBe(false);
    expect(s.fx.USD_TZS).toBe(2600);
    expect(s.vatRate).toBe(0.18);
    expect(s.vatBase).toBe("service_fee");
    expect(s.refundApprovalLimit).toEqual({ amountMinor: 50_000_000, currency: "TZS" });
    expect(s.voidWindow).toBe("same_day");
    expect(s.integrations.amadeus.mode).toBe("off");
    expect(s.airlines.find((a) => a.code === "EK")?.ticketPrefix).toBe("176");
    expect(s.company.name).toBe("Aeropath Travel Ltd");
    expect(db.session.userId).toBeNull();
  });

  it("covers every booking state", () => {
    expect(files.length).toBeGreaterThanOrEqual(28);
    expect(files.length).toBeLessThanOrEqual(34);
    expect(statusCount("draft")).toBe(4);
    expect(statusCount("closed")).toBe(3);
    expect(statusCount("travelled")).toBeGreaterThanOrEqual(1);
    expect(Object.values(db.invoices).filter((i) => i.kind === "quote")).toHaveLength(4);
    const olderDraft = files.filter((f) => fileStatus(db, f.id, NOW) === "draft" && NOW.getTime() - Date.parse(f.createdAt) > 3 * 86_400_000);
    expect(olderDraft.length).toBeGreaterThanOrEqual(1);

    const booked = lines.filter((l) => l.type === "flight" && l.status === "booked");
    expect(booked).toHaveLength(5);
    const within48h = booked.filter((l) => l.type === "flight" && l.details.ticketingTimeLimit && Date.parse(l.details.ticketingTimeLimit) - NOW.getTime() < 48 * 3_600_000);
    expect(within48h).toHaveLength(2);

    const issuedFiles = files.filter((f) => linesOf(f.id).some((l) => l.status === "issued") && fileStatus(db, f.id, NOW) === "confirmed");
    const pay = (f: (typeof files)[number]) => paymentStatus(fileTotals(db, f.id));
    expect(issuedFiles.filter((f) => pay(f) === "paid").length).toBeGreaterThanOrEqual(8);
    expect(issuedFiles.filter((f) => pay(f) === "partial").length).toBeGreaterThanOrEqual(3);
    const today = darToday(NOW);
    const soonUnpaid = issuedFiles.filter((f) => pay(f) === "unpaid" && linesOf(f.id).some((l) => l.type === "flight" && l.details.segments[0].departureLocal.slice(0, 10) <= toDarDate(new Date(NOW.getTime() + 7 * 86_400_000))));
    expect(soonUnpaid.length).toBeGreaterThanOrEqual(2);

    const voided = lines.filter((l) => l.status === "voided");
    expect(voided).toHaveLength(1);
    const voidedAt = voided[0].statusHistory.at(-1)!.at;
    expect(toDarDate(voidedAt)).toBe(today);
    expect(paymentStatus(fileTotals(db, voided[0].fileId))).toBe("credit");

    const refunds = Object.values(db.refunds);
    expect(refunds.filter((r) => r.kind === "refund").map((r) => r.status).sort()).toEqual(["approved", "paid", "requested"]);
    const exchange = refunds.find((r) => r.kind === "exchange")!;
    expect(exchange.status).toBe("closed");
    expect(db.lines[exchange.lineId].status).toBe("exchanged");
    expect(db.lines[exchange.exchange!.newLineId!].status).toBe("issued");
  });

  it("keeps the pending refund above the limit out of the Accountant's reach", () => {
    const pending = Object.values(db.refunds).find((r) => r.status === "requested")!;
    expect(refundNeedsManager(pending.quote.clientRefund, db.settings)).toBe(true);
    const peter = userByEmail("peter@aeropath.co.tz");
    const res = runCommand(db, decideRefund, { refundId: pending.id, decision: "approve" }, { user: peter, now: NOW, settings: db.settings, newId: (p) => `${p}_test` });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error.code).toBe("FORBIDDEN");
  });

  it("mixes services and currencies", () => {
    const types = (fileId: ID) => new Set(linesOf(fileId).map((l) => l.type));
    const only = (fileId: ID, ...t: string[]) => {
      const s = types(fileId);
      return s.size === t.length && t.every((x) => s.has(x as never));
    };
    expect(files.filter((f) => ["flight", "hotel", "transfer"].every((t) => types(f.id).has(t as never))).length).toBeGreaterThanOrEqual(4);
    expect(files.filter((f) => only(f.id, "hotel")).length).toBeGreaterThanOrEqual(2);
    expect(files.filter((f) => only(f.id, "car")).length).toBeGreaterThanOrEqual(1);
    expect(files.filter((f) => only(f.id, "visa", "insurance")).length).toBeGreaterThanOrEqual(1);
    const flights = lines.filter((l) => l.type === "flight" && !(l.type === "flight" && l.details.exchangedFromLineId));
    const usdShare = flights.filter((l) => l.pricing.currency === "USD").length / flights.length;
    expect(usdShare).toBeGreaterThan(0.5);
    expect(usdShare).toBeLessThan(0.7);
    expect(lines.filter((l) => l.type === "transfer").every((l) => l.pricing.currency === "TZS")).toBe(true);
  });

  it("records payments, verification, a reversal and a corporate bulk payment", () => {
    expect(paymentsIn.length).toBeGreaterThanOrEqual(35);
    expect(paymentsIn.length).toBeLessThanOrEqual(45);
    expect(new Set(paymentsIn.map((p) => p.method))).toEqual(new Set(["cash", "bank_transfer", "mpesa", "airtel_money", "mixx", "halopesa", "card", "cheque"]));
    const dayAgo = NOW.getTime() - 86_400_000;
    expect(paymentsIn.filter((p) => p.status === "recorded" && Date.parse(p.receivedAt) < dayAgo)).toHaveLength(3);
    expect(paymentsIn.filter((p) => p.status === "reversed")).toHaveLength(1);
    expect(paymentsIn.filter((p) => p.status === "verified").length).toBeGreaterThan(paymentsIn.length * 0.8);
    expect(paymentsIn.filter((p) => p.allocations.length === 3)).toHaveLength(1);
    expect(paymentsIn.some((p) => p.amount.currency === "TZS" && p.fxRate === 2600)).toBe(true);
    for (const p of paymentsIn.filter((x) => x.method !== "cash")) expect(p.reference, p.number).toBeTruthy();
    for (const p of paymentsIn) expect(db.moneyAccounts[p.accountId].currency).toBe(p.amount.currency);
  });

  it("gives the corporates distinct credit pictures", () => {
    const pwani = clientByName("Pwani Energy Services Ltd");
    const ratio = creditUsed(db, pwani.id) / pwani.creditLimit!.amountMinor;
    expect(ratio).toBeGreaterThan(0.8);
    expect(ratio).toBeLessThan(0.95);
    const bahari = clientByName("Bahari Freight & Clearing Ltd");
    const baharifiles = files.filter((f) => f.clientId === bahari.id);
    expect(baharifiles.filter((f) => isOverdue(db, f.id, NOW)).length).toBeGreaterThanOrEqual(3);
    const kivukoni = clientByName("Kivukoni Logistics Ltd");
    expect(creditUsed(db, kivukoni.id)).toBe(0);
    for (const c of [pwani, bahari, kivukoni]) expect(c.paymentTermsDays).toBe(30);
  });

  it("pays suppliers and records expenses", () => {
    const sps = Object.values(db.supplierPayments);
    expect(sps.length).toBeGreaterThanOrEqual(7);
    expect(sps.length).toBeLessThanOrEqual(10);
    const air = db.settings.airSettlement.supplierId;
    expect(sps.some((p) => p.supplierId === air && p.allocations.length >= 3)).toBe(true);
    const expenses = Object.values(db.expenses);
    expect(expenses.length).toBeGreaterThanOrEqual(22);
    expect(expenses.length).toBeLessThanOrEqual(28);
    expect(new Set(expenses.map((e) => e.category)).size).toBe(11);
    const oldest = expenses.map((e) => e.paidAt).sort()[0];
    expect(Date.parse(`${oldest}T00:00:00Z`)).toBeGreaterThan(NOW.getTime() - 95 * 86_400_000);
  });

  it("keeps the ledger balanced and every event in the past", () => {
    expect(groupImbalances(db.ledger)).toEqual([]);
    const byGroup = new Map<string, Map<string, number>>();
    for (const e of db.ledger) {
      const g = byGroup.get(e.groupId) ?? new Map<string, number>();
      g.set(e.currency, (g.get(e.currency) ?? 0) + e.debitMinor - e.creditMinor);
      byGroup.set(e.groupId, g);
    }
    for (const g of byGroup.values()) for (const diff of g.values()) expect(diff).toBe(0);
    for (const a of db.audit) expect(Date.parse(a.at)).toBeLessThanOrEqual(NOW.getTime());
    for (const e of db.ledger) expect(Date.parse(e.at)).toBeLessThanOrEqual(NOW.getTime());
  });

  it("leaves the demo record locators and ticket numbers free", () => {
    for (const l of lines) {
      if (l.type !== "flight") continue;
      expect(RESERVED_LOCATORS.has(l.details.recordLocator)).toBe(false);
      for (const p of l.details.passengers) if (p.ticketNumber) expect(RESERVED_TICKETS.has(p.ticketNumber)).toBe(false);
    }
  });

  it("is deterministic and small", () => {
    expect(generateSeed(NOW)).toEqual(generateSeed(NOW));
    expect(JSON.stringify(db).length).toBeLessThan(1_000_000);
  });

  it.each(["2027-01-01T00:30:00Z", "2026-03-01T21:05:00Z", "2026-06-15T13:45:00Z", "2026-09-27T21:00:00Z"])("also seeds cleanly when now = %s", (iso) => {
    const other = generateSeedWithReport(new Date(iso));
    expect(other.failures).toEqual([]);
    expect(groupImbalances(other.db.ledger)).toEqual([]);
    expect(Object.keys(other.db.files)).toHaveLength(files.length);
  });
});
