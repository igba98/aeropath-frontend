import { describe, expect, it } from "vitest";
import type { Money } from "../types";
import { major, money } from "../money";
import { allocationsMatchAmount } from "../allocations";
import { recordPayment, reversePayment, verifyPayment, type RecordPaymentInput } from "../commands";
import { isBalanced } from "../ledger/postings";
import { newClient, newFile } from "./builders";
import { attempt, createWorld, errorOf, run, type World } from "./fixtures";

const usd = (n: number) => major(n, "USD");
const tzs = (n: number) => major(n, "TZS");

function setup() {
  const w = createWorld();
  const { clientId, travellerIds } = newClient(w);
  const usdFile = newFile(w, clientId, travellerIds, "USD").fileId;
  const tzsFile = newFile(w, clientId, travellerIds, "TZS").fileId;
  return { w, clientId, usdFile, tzsFile };
}

const input = (w: World, clientId: string, amount: Money, allocations: { fileId: string; amount: Money }[], extra: Partial<RecordPaymentInput> = {}): RecordPaymentInput => ({
  clientId,
  amount,
  allocations,
  method: "bank_transfer",
  accountId: amount.currency === "USD" ? w.acc.crdbUsd : w.acc.crdbTzs,
  reference: "REF-1",
  ...extra,
});

describe("allocation sum (§15: equal after FX, within 1 minor unit)", () => {
  it("same currency: exact or 1 minor unit off passes, 2 fails", () => {
    expect(allocationsMatchAmount(usd(100), [usd(60), usd(40)], 2600)).toBe(true);
    expect(allocationsMatchAmount(usd(100), [money(9999, "USD")], 2600)).toBe(true);
    expect(allocationsMatchAmount(usd(100), [money(9998, "USD")], 2600)).toBe(false);
  });
  it("TZS paid onto a USD booking is compared in USD cents", () => {
    // TZS 1,000,000 ÷ 2600 = USD 384.615… → 384.62
    expect(allocationsMatchAmount(tzs(1_000_000), [money(38462, "USD")], 2600)).toBe(true);
    expect(allocationsMatchAmount(tzs(1_000_000), [money(38464, "USD")], 2600)).toBe(false);
  });
  it("mixed allocations: part in the payment currency, rest converted", () => {
    expect(allocationsMatchAmount(usd(500), [usd(200), tzs(780_000)], 2600)).toBe(true);
    expect(allocationsMatchAmount(usd(500), [usd(200), tzs(790_000)], 2600)).toBe(false);
  });
});

describe("recordPayment", () => {
  it("records a receipt, posts balanced entries and captures the FX rate used", () => {
    const { w, clientId, usdFile, tzsFile } = setup();
    const { number, paymentId } = run(w, recordPayment, input(w, clientId, usd(500), [{ fileId: usdFile, amount: usd(200) }, { fileId: tzsFile, amount: tzs(780_000) }]), "neema");
    expect(number).toBe("RCT-2026-00001");
    const p = w.db.payments[paymentId];
    expect(p.fxRate).toBe(2600);
    expect(p.status).toBe("recorded");
    expect(isBalanced(w.db.ledger)).toBe(true);
    expect(w.db.audit.filter((a) => a.entityId === paymentId)).toHaveLength(2); // one per booking
  });

  it("rejects allocations that do not add up, with the difference", () => {
    const { w, clientId, usdFile } = setup();
    const e = errorOf(attempt(w, recordPayment, input(w, clientId, usd(500), [{ fileId: usdFile, amount: usd(400) }]), "neema"));
    expect(e.code).toBe("VALIDATION");
    expect(e.field).toBe("allocations");
    expect(e.message).toMatch(/USD 400\.00.*USD 500\.00.*USD 100\.00/);
  });

  it("allows allocating more than the balance (client credit)", () => {
    const { w, clientId, usdFile } = setup();
    expect(attempt(w, recordPayment, input(w, clientId, usd(9000), [{ fileId: usdFile, amount: usd(9000) }]), "neema").ok).toBe(true);
  });

  it("only an Accountant or a Manager may change the exchange rate", () => {
    const { w, clientId, tzsFile } = setup();
    const i = input(w, clientId, usd(100), [{ fileId: tzsFile, amount: tzs(265_000) }], { fxRate: 2650 });
    const e = errorOf(attempt(w, recordPayment, i, "neema"));
    expect(e.code).toBe("FORBIDDEN");
    expect(e.message).toBe("Only an Accountant or a Manager can change the exchange rate on a payment.");
    const { paymentId } = run(w, recordPayment, i, "peter");
    expect(w.db.payments[paymentId].fxRate).toBe(2650);
    expect(attempt(w, recordPayment, { ...i, fxRate: 2600, allocations: [{ fileId: tzsFile, amount: tzs(260_000) }] }, "neema").ok).toBe(true);
  });

  it("needs a reference unless cash, and an account in the payment currency", () => {
    const { w, clientId, usdFile } = setup();
    expect(errorOf(attempt(w, recordPayment, input(w, clientId, usd(10), [{ fileId: usdFile, amount: usd(10) }], { reference: "" }), "neema")).field).toBe("reference");
    expect(attempt(w, recordPayment, input(w, clientId, usd(10), [{ fileId: usdFile, amount: usd(10) }], { reference: undefined, method: "cash" }), "neema").ok).toBe(true);
    expect(errorOf(attempt(w, recordPayment, input(w, clientId, usd(10), [{ fileId: usdFile, amount: usd(10) }], { accountId: w.acc.mpesa }), "neema")).field).toBe("accountId");
  });

  it("allocations must be in the booking currency and belong to the paying client", () => {
    const { w, clientId, usdFile } = setup();
    expect(errorOf(attempt(w, recordPayment, input(w, clientId, tzs(26_000), [{ fileId: usdFile, amount: tzs(26_000) }]), "neema")).field).toBe("allocations.0.amount");
    const other = newClient(w);
    expect(errorOf(attempt(w, recordPayment, input(w, other.clientId, usd(10), [{ fileId: usdFile, amount: usd(10) }]), "neema")).message).toMatch(/another client/);
  });
});

describe("verify and reverse", () => {
  it("verification is finance only; reversal needs a reason", () => {
    const { w, clientId, usdFile } = setup();
    const { paymentId } = run(w, recordPayment, input(w, clientId, usd(10), [{ fileId: usdFile, amount: usd(10) }]), "neema");
    expect(errorOf(attempt(w, verifyPayment, { paymentId }, "neema")).code).toBe("FORBIDDEN");
    run(w, verifyPayment, { paymentId }, "peter");
    expect(w.db.payments[paymentId].verifiedBy).toBe("usr_peter");
    expect(errorOf(attempt(w, reversePayment, { paymentId, reason: "" }, "peter")).field).toBe("reason");
    run(w, reversePayment, { paymentId, reason: "Duplicate entry" }, "grace");
    expect(errorOf(attempt(w, verifyPayment, { paymentId }, "peter")).code).toBe("CONFLICT");
  });
});
