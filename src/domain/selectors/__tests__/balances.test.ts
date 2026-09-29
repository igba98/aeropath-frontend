import { describe, expect, it } from "vitest";
import { major } from "../../money";
import { recordPayment, recordSupplierPayment, updateClient } from "../../commands";
import { createWorld, NOW, run, type World } from "../../__tests__/fixtures";
import { addFlight, issueFlight, issuedFlightScenario, newClient, newFile } from "../../__tests__/builders";
import { agingBucket, cashPositions, clientBalance, clientCreditUsage, payablesAging, receivablesAging, supplierBalances, supplierOpenItems } from "../balances";

const usd = (n: number) => major(n, "USD");
const tzs = (n: number) => major(n, "TZS");
const DAY = 86_400_000;
const later = (days: number) => new Date(NOW.getTime() + days * DAY);

function pay(w: World, clientId: string, fileId: string, amount: number) {
  return run(w, recordPayment, { clientId, amount: usd(amount), allocations: [{ fileId, amount: usd(amount) }], method: "bank_transfer", accountId: w.acc.crdbUsd, reference: "TT-1" }, "neema");
}

describe("clientBalance", () => {
  it("sums charges, received and balance over the client's files", () => {
    const w = createWorld();
    const s = issuedFlightScenario(w); // sell USD 1,523.60
    pay(w, s.clientId, s.fileId, 500);
    const b = clientBalance(w.db, s.clientId, NOW);
    expect(b.currency).toBe("USD");
    expect(b.charges).toEqual(usd(1523.6));
    expect(b.received).toEqual(usd(500));
    expect(b.balance).toEqual(usd(1023.6));
    expect(b.overdue).toEqual(usd(0));
    expect(b.openFiles).toBe(1);
  });

  it("converts files in another currency into the client's default currency at the current rate", () => {
    const w = createWorld();
    const { clientId, travellerIds } = newClient(w);
    const { fileId } = newFile(w, clientId, travellerIds, "TZS");
    const lineId = addFlight(w, fileId, travellerIds, { currency: "TZS", total: 2_600_000, markup: 0, serviceFee: 0 });
    issueFlight(w, lineId);
    const b = clientBalance(w.db, clientId, NOW);
    expect(b.currency).toBe("USD");
    expect(b.charges).toEqual(usd(1000)); // TZS 2,600,000 ÷ 2,600
  });

  it("marks the balance overdue once the first travel date has passed", () => {
    const w = createWorld();
    const s = issuedFlightScenario(w); // departs 12 Oct
    expect(clientBalance(w.db, s.clientId, new Date("2026-10-13T09:00:00Z")).overdue).toEqual(usd(1523.6));
  });
});

describe("clientCreditUsage", () => {
  it("is null for individuals", () => {
    const w = createWorld();
    const { clientId } = newClient(w);
    expect(clientCreditUsage(w.db, clientId, NOW)).toBeNull();
  });

  it("uses positive balances against the corporate limit", () => {
    const w = createWorld();
    const { clientId, travellerIds } = newClient(w, { type: "corporate" });
    run(w, updateClient, { clientId, patch: { creditLimit: usd(2000) } }, "grace");
    const { fileId } = newFile(w, clientId, travellerIds, "USD");
    issueFlight(w, addFlight(w, fileId, travellerIds));
    const u = clientCreditUsage(w.db, clientId, NOW)!;
    expect(u.limit).toEqual(usd(2000));
    expect(u.used).toEqual(usd(1523.6));
    expect(u.pct).toBeCloseTo(76.18, 2);
  });
});

describe("suppliers", () => {
  it("lists open items oldest first and nets supplier payments", () => {
    const w = createWorld();
    const a = issuedFlightScenario(w);
    const b = issuedFlightScenario(w, { total: 800 });
    run(w, recordSupplierPayment, { supplierId: w.sup.consolidator, amount: usd(1000), accountId: w.acc.crdbUsd, allocations: [{ lineId: a.lineId, amount: usd(1000) }] }, "peter");

    const items = supplierOpenItems(w.db, w.sup.consolidator, NOW);
    expect(items.map((i) => i.line.id)).toEqual([a.lineId, b.lineId]);
    expect(items[0].cost).toEqual(usd(1450));
    expect(items[0].paid).toEqual(usd(1000));
    expect(items[0].remaining).toEqual(usd(450));
    expect(items[0].overdue).toBe(false);

    const row = supplierBalances(w.db, NOW).find((r) => r.supplier.id === w.sup.consolidator)!;
    expect(row.owed).toEqual(usd(1250)); // 450 + 800
    expect(row.overdue).toEqual(usd(0));
    expect(row.openItems).toBe(2);
    expect(row.lastPaymentAt).toBe(NOW.toISOString());
  });

  it("flags items past the supplier's terms as overdue", () => {
    const w = createWorld();
    issuedFlightScenario(w);
    const [item] = supplierOpenItems(w.db, w.sup.consolidator, later(31));
    expect(item.daysOutstanding).toBe(31);
    expect(item.overdue).toBe(true);
    expect(supplierBalances(w.db, later(31))[0].overdue).toEqual(usd(1450));
  });
});

describe("cashPositions", () => {
  it("adds ledger 1100 movements to the opening balance", () => {
    const w = createWorld();
    w.db.moneyAccounts[w.acc.crdbUsd].openingBalance = usd(100);
    const s = issuedFlightScenario(w);
    pay(w, s.clientId, s.fileId, 500);
    run(w, recordSupplierPayment, { supplierId: w.sup.consolidator, amount: usd(200), accountId: w.acc.crdbUsd, allocations: [{ lineId: s.lineId, amount: usd(200) }] }, "peter");
    const pos = cashPositions(w.db).find((p) => p.account.id === w.acc.crdbUsd)!;
    expect(pos.balance).toEqual(usd(400)); // 100 + 500 − 200
    expect(cashPositions(w.db).find((p) => p.account.id === w.acc.cashTzs)!.balance).toEqual(tzs(0));
  });
});

describe("aging", () => {
  it("buckets days past due", () => {
    expect([0, 1, 30, 31, 60, 61, 90, 91].map(agingBucket)).toEqual(["notDue", "d0_30", "d0_30", "d31_60", "d31_60", "d61_90", "d61_90", "d90plus"]);
  });

  it("ages receivables from the booking's due date and totals in TZS", () => {
    const w = createWorld();
    const s = issuedFlightScenario(w); // due 12 Oct (first travel date)
    pay(w, s.clientId, s.fileId, 523.6);
    const notYet = receivablesAging(w.db, NOW);
    expect(notYet.rows).toHaveLength(1);
    expect(notYet.rows[0].bucket).toBe("notDue");

    const aging = receivablesAging(w.db, new Date("2026-11-25T09:00:00Z")); // 44 days past due
    const [row] = aging.rows;
    expect(row.daysPastDue).toBe(44);
    expect(row.bucket).toBe("d31_60");
    expect(row.buckets.d31_60).toEqual(usd(1000));
    expect(aging.totals.buckets.d31_60).toEqual(tzs(2_600_000));
    expect(aging.totals.total).toEqual(tzs(2_600_000));
    expect(aging.totals.byCurrency.USD?.total).toEqual(usd(1000));
  });

  it("leaves paid files and client credits out of receivables", () => {
    const w = createWorld();
    const s = issuedFlightScenario(w);
    pay(w, s.clientId, s.fileId, 2000);
    expect(receivablesAging(w.db, NOW).rows).toHaveLength(0);
  });

  it("ages payables by days past the supplier's terms", () => {
    const w = createWorld();
    issuedFlightScenario(w);
    expect(payablesAging(w.db, NOW).rows[0].buckets.notDue).toEqual(usd(1450));
    const aging = payablesAging(w.db, later(45)); // 45 days outstanding, 30-day terms → 15 past
    expect(aging.rows[0].buckets.d0_30).toEqual(usd(1450));
    expect(aging.rows[0].total).toEqual(usd(1450));
    expect(aging.totals.total).toEqual(tzs(3_770_000));
  });
});
