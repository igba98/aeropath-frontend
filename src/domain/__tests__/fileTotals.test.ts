import { describe, expect, it } from "vitest";
import { major, money } from "../money";
import { decideRefund, payRefund, recordPayment, recordSupplierPayment, requestRefund, voidLine } from "../commands";
import { debitBalance } from "../ledger/queries";
import { fileTotals } from "../selectors/fileTotals";
import { fileStatus } from "../status/file-status";
import { paymentStatus } from "../status/payment-status";
import { addFlight, issueFlight, issuedFlightScenario, newClient, newFile } from "./builders";
import { createWorld, run } from "./fixtures";

const usd = (n: number) => major(n, "USD");
const tzs = (n: number) => major(n, "TZS");
const pay = (w: ReturnType<typeof createWorld>, clientId: string, fileId: string, amount: ReturnType<typeof usd>, alloc = amount, accountId = w.acc.crdbUsd) =>
  run(w, recordPayment, { clientId, amount, allocations: [{ fileId, amount: alloc }], method: "bank_transfer", accountId, reference: "REF" }, "neema");

describe("fileTotals (§8.3)", () => {
  it("deposit before issue: booked lines count in charges; the ledger shows the deposit as client credit", () => {
    const w = createWorld();
    const { clientId, travellerIds } = newClient(w);
    const { fileId } = newFile(w, clientId, travellerIds);
    addFlight(w, fileId, travellerIds);
    pay(w, clientId, fileId, usd(500));
    const t = fileTotals(w.db, fileId);
    expect(t.charges).toEqual(money(152360, "USD"));
    expect(t.received).toEqual(usd(500));
    expect(t.balance).toEqual(money(102360, "USD"));
    expect(t.margin).toEqual(usd(70));
    expect(t.supplierOwed).toEqual(usd(0)); // nothing issued yet
    expect(paymentStatus(t)).toBe("partial");
    expect(debitBalance(w.db.ledger, { account: "1200", currency: "USD", fileId }).amountMinor).toBe(-50000);
  });

  it("quoted lines never count in charges", () => {
    const w = createWorld();
    const { clientId, travellerIds } = newClient(w);
    const { fileId } = newFile(w, clientId, travellerIds);
    addFlight(w, fileId, travellerIds, { booked: false });
    expect(fileTotals(w.db, fileId).charges.amountMinor).toBe(0);
    expect(paymentStatus(fileTotals(w.db, fileId))).toBe("none");
  });

  it("FX: a USD line in a TZS file converts at the rate saved on the line; a USD payment allocated in TZS pays it", () => {
    const w = createWorld();
    const { clientId, travellerIds } = newClient(w);
    const { fileId } = newFile(w, clientId, travellerIds, "TZS");
    const lineId = addFlight(w, fileId, travellerIds);
    expect(w.db.lines[lineId].pricing.fxToFile).toBe(2600);
    const t = fileTotals(w.db, fileId);
    expect(t.currency).toBe("TZS");
    expect(t.charges).toEqual(tzs(3_961_360));
    pay(w, clientId, fileId, usd(1523.6), tzs(3_961_360));
    expect(w.db.payments[Object.keys(w.db.payments)[0]].fxRate).toBe(2600);
    w.db.settings.fx.USD_TZS = 2700; // a later rate change must not move the booking total
    expect(fileTotals(w.db, fileId).charges).toEqual(tzs(3_961_360));
    expect(paymentStatus(fileTotals(w.db, fileId))).toBe("paid");
  });

  it("void → the charges drop and a paid client shows credit", () => {
    const w = createWorld();
    const s = issuedFlightScenario(w);
    pay(w, s.clientId, s.fileId, usd(500));
    run(w, voidLine, { lineId: s.lineId }, "neema");
    const t = fileTotals(w.db, s.fileId);
    expect(t.charges.amountMinor).toBe(0);
    expect(t.balance).toEqual(usd(-500));
    expect(paymentStatus(t)).toBe("credit");
    expect(fileStatus(w.db, s.fileId, w.now)).toBe("cancelled");
  });

  it("refund: retained charges stay, the payout brings the balance to zero", () => {
    const w = createWorld();
    const s = issuedFlightScenario(w);
    pay(w, s.clientId, s.fileId, money(152360, "USD"));
    const { refundId } = run(w, requestRefund, { lineId: s.lineId, kind: "refund", reason: "Cancelled trip", supplierPenalty: usd(200), agencyFee: usd(10) }, "neema");
    run(w, decideRefund, { refundId, decision: "approve" }, "grace"); // USD 1,238.20 ≈ TZS 3.2m, above the Accountant's limit
    const t = fileTotals(w.db, s.fileId);
    expect(t.charges).toEqual(money(28540, "USD"));
    expect(t.cost).toEqual(usd(200));
    expect(t.margin).toEqual(usd(80)); // agency fee 10 + original markup 50 + fee 20
    expect(t.balance).toEqual(money(-123820, "USD"));
    run(w, payRefund, { refundId, accountId: w.acc.crdbUsd, method: "bank_transfer", reference: "OUT1" }, "peter");
    expect(fileTotals(w.db, s.fileId).balance.amountMinor).toBe(0);
    expect(w.db.refunds[refundId].status).toBe("paid");
    expect(fileStatus(w.db, s.fileId, w.now)).toBe("cancelled");
  });

  it("supplier owed = cost of issued lines − supplier payments", () => {
    const w = createWorld();
    const s = issuedFlightScenario(w);
    expect(fileTotals(w.db, s.fileId).supplierOwed).toEqual(usd(1450));
    run(w, recordSupplierPayment, { supplierId: w.sup.consolidator, amount: usd(1000), accountId: w.acc.crdbUsd, allocations: [{ lineId: s.lineId, amount: usd(1000) }] }, "peter");
    expect(fileTotals(w.db, s.fileId).supplierOwed).toEqual(usd(450));
  });

  it("client balance from the ledger (1200 by file) matches fileTotals for a fully issued file", () => {
    const w = createWorld();
    const { clientId, travellerIds } = newClient(w, { travellers: 2 });
    const { fileId } = newFile(w, clientId, travellerIds);
    const a = addFlight(w, fileId, travellerIds, { total: 2000 });
    issueFlight(w, a);
    pay(w, clientId, fileId, usd(700));
    const ledger = debitBalance(w.db.ledger, { account: "1200", currency: "USD", fileId });
    expect(ledger).toEqual(fileTotals(w.db, fileId).balance);
  });
});
