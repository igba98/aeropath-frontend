/**
 * Money movements for the seed: client payments (single file or bulk), verification, reversal, voids, refunds and
 * exchanges, supplier payments and expenses — all through the real commands on the Seeder timeline.
 */
import type { Currency, ExpenseCategory, ID, Money, PaymentMethod } from "@/domain/types";
import {
  decideRefund,
  payRefund,
  recordExpense,
  recordPayment,
  recordSupplierPayment,
  requestRefund,
  reversePayment,
  verifyPayment,
  voidLine,
  type RecordPaymentInput,
  type RequestRefundInput,
} from "@/domain/commands";
import { convert, major, money } from "@/domain/money";
import { fileTotals } from "@/domain/selectors/fileTotals";
import { lineSupplierDue } from "@/domain/selectors/core";
import { buildSegments, FileBuilder, type SegSpec } from "./seed-file";
import type { Seeder, StaffKey } from "./seed-kit";

/** Transaction reference in the style of each method; undefined for cash. */
export function referenceFor(s: Seeder, method: PaymentMethod): string | undefined {
  const AZ09 = "ABCDEFGHJKLMNPQRSTUVWXYZ0123456789";
  switch (method) {
    case "cash":
      return undefined;
    case "bank_transfer":
      return s.code("FT", 10, "0123456789");
    case "mpesa":
      return s.code(s.chars(1, "QRST"), 9, AZ09);
    case "airtel_money":
      return s.code("MP", 10, "0123456789");
    case "mixx":
      return s.code("MX", 8, AZ09);
    case "halopesa":
      return s.code("HP", 9, "0123456789");
    case "card":
      return s.code("AUTH ", 6, "0123456789");
    case "cheque":
      return s.code("CHQ ", 6, "0123456789");
  }
}

/** A round share of a balance (TZS to 10,000, USD to 50); the whole balance when the share rounds to zero. */
export function share(balance: Money, frac: number): Money {
  const unit = balance.currency === "TZS" ? 1_000_000 : 5_000;
  const raw = Math.floor((balance.amountMinor * frac) / unit) * unit;
  return money(raw > 0 ? raw : balance.amountMinor, balance.currency);
}

export interface PayOpts {
  method: PaymentMethod;
  /** Money account key, e.g. "crdb_usd". */
  account: string;
  /** Currency received; defaults to the file currency (a different one is converted at the settings rate). */
  cur?: Currency;
  /** "balance", a fraction of the balance, or an exact amount in the file currency (major units). */
  amount: "balance" | number | { exact: number };
  /** false leaves the payment unverified. Default: verified by Peter a few hours later (if that is before now). */
  verify?: boolean;
  note?: string;
}

/** Schedules the verification of a payment by the accountant a few hours after it was received. */
function autoVerify(s: Seeder, at: Date, label: string, getId: () => ID | undefined): void {
  const lagMs = (s.int(1, 18) * 60 + s.int(0, 59)) * 60_000;
  const when = s.plusMs(at, lagMs);
  if (when.getTime() > s.now.getTime() - 60_000) return; // not yet checked
  s.at(when, `${label}: verify`, () => {
    const id = getId();
    if (!id) throw new Error(`${label}: payment was not recorded`);
    s.run(`${label}: verifyPayment`, when, "peter", verifyPayment, { paymentId: id });
  });
}

/** Records a client payment allocated to one booking. */
export function pay(f: FileBuilder, key: string, at: Date, who: StaffKey, o: PayOpts): void {
  const s = f.s;
  const reference = referenceFor(s, o.method);
  f.step(at, `payment ${key}`, () => {
    const state = s.state;
    const file = state.files[f.id];
    const rate = state.settings.fx.USD_TZS;
    const balance = fileTotals(state, file.id).balance;
    const alloc = o.amount === "balance" ? balance : typeof o.amount === "number" ? share(balance, o.amount) : major(o.amount.exact, file.currency);
    const cur = o.cur ?? file.currency;
    const input: RecordPaymentInput = {
      clientId: file.clientId,
      amount: convert(alloc, cur, rate),
      allocations: [{ fileId: file.id, amount: alloc }],
      method: o.method,
      accountId: s.ref(`a:${o.account}`),
    };
    if (cur !== file.currency) input.fxRate = rate;
    if (reference) input.reference = reference;
    if (o.note) input.note = o.note;
    const r = s.run(f.label(`recordPayment ${key}`), at, who, recordPayment, input);
    if (r) f.payments[key] = r.paymentId;
  });
  if (o.verify !== false) autoVerify(s, at, f.label(key), () => f.payments[key]);
}

/** One payment allocated across several bookings of the same client (each gets its full balance). */
export function bulkPay(s: Seeder, label: string, at: Date, who: StaffKey, files: FileBuilder[], o: { method: PaymentMethod; account: string; cur: Currency; note?: string }): { id?: ID } {
  const holder: { id?: ID } = {};
  const reference = referenceFor(s, o.method);
  s.at(at, label, () => {
    const state = s.state;
    const rate = state.settings.fx.USD_TZS;
    const allocations = files.map((f) => ({ fileId: f.id, amount: fileTotals(state, f.id).balance }));
    const same = allocations.filter((a) => a.amount.currency === o.cur).reduce((t, a) => t + a.amount.amountMinor, 0);
    const other = allocations.filter((a) => a.amount.currency !== o.cur);
    const otherCur: Currency = o.cur === "TZS" ? "USD" : "TZS";
    const otherSum = money(
      other.reduce((t, a) => t + a.amount.amountMinor, 0),
      otherCur,
    );
    const amount = money(same + convert(otherSum, o.cur, rate).amountMinor, o.cur);
    const input: RecordPaymentInput = { clientId: state.files[files[0].id].clientId, amount, allocations, method: o.method, accountId: s.ref(`a:${o.account}`), reference, note: o.note };
    if (other.length) input.fxRate = rate;
    const r = s.run(`${label}: recordPayment`, at, who, recordPayment, input);
    if (r) holder.id = r.paymentId;
  });
  autoVerify(s, at, label, () => holder.id);
  return holder;
}

export function verify(f: FileBuilder, key: string, at: Date): void {
  f.step(at, `verify ${key}`, () => {
    f.s.run(f.label(`verifyPayment ${key}`), at, "peter", verifyPayment, { paymentId: f.payments[key] });
  });
}

export function reverse(f: FileBuilder, key: string, at: Date, reason: string): void {
  f.step(at, `reverse ${key}`, () => {
    f.s.run(f.label(`reversePayment ${key}`), at, "peter", reversePayment, { paymentId: f.payments[key], reason });
  });
}

export function voidTicket(f: FileBuilder, key: string, at: Date, reason: string): void {
  f.step(at, `void ${key}`, () => {
    f.s.run(f.label(`voidLine ${key}`), at, f.spec.owner, voidLine, { lineId: f.lineId(key), reason });
  });
}

/** Refund or exchange request on an issued line (amounts in major units, any currency). */
export function requestRefundOn(
  f: FileBuilder,
  key: string,
  at: Date,
  o: { kind: "refund" | "exchange"; reason: string; penalty: [number, Currency]; agencyFee?: [number, Currency]; exchange?: { segs: SegSpec[]; additionalFare: [number, Currency]; changeFee: [number, Currency] } },
): void {
  const pax = f.meta[key]?.pax.length ?? 1;
  const exchange = o.exchange
    ? { newSegments: buildSegments(f.s, o.exchange.segs, pax), additionalFare: major(...o.exchange.additionalFare), changeFee: major(...o.exchange.changeFee) }
    : undefined;
  f.step(at, `request ${o.kind} ${key}`, () => {
    const input: RequestRefundInput = { lineId: f.lineId(key), kind: o.kind, reason: o.reason, supplierPenalty: major(...o.penalty) };
    if (o.agencyFee) input.agencyFee = major(...o.agencyFee);
    if (exchange) input.exchange = exchange;
    const r = f.s.run(f.label(`requestRefund ${key}`), at, f.spec.owner, requestRefund, input);
    if (r) f.refundId = r.refundId;
  });
}

/** Approve or reject the file's refund request. For an approved exchange, the new line is stored under `newLineKey`. */
export function decide(f: FileBuilder, at: Date, who: StaffKey, decision: "approve" | "reject", note?: string, exchange?: { from: string; newLineKey: string }): void {
  if (exchange) f.meta[exchange.newLineKey] = { ...f.meta[exchange.from] };
  f.step(at, `decide refund (${decision})`, () => {
    if (!f.refundId) throw new Error(`${f.spec.key}: no refund request to decide`);
    const r = f.s.run(f.label("decideRefund"), at, who, decideRefund, { refundId: f.refundId, decision, note });
    if (r?.newLineId && exchange) f.lines[exchange.newLineKey] = r.newLineId;
  });
}

export function payOutRefund(f: FileBuilder, at: Date, account: string, method: PaymentMethod): void {
  const reference = referenceFor(f.s, method);
  f.step(at, "pay out refund", () => {
    if (!f.refundId) throw new Error(`${f.spec.key}: no refund to pay out`);
    f.s.run(f.label("payRefund"), at, "peter", payRefund, { refundId: f.refundId, accountId: f.s.ref(`a:${account}`), method, reference });
  });
}

/** Pays a supplier the full amount still owed on the given lines, from a money account (as Peter). */
export function paySupplier(s: Seeder, label: string, at: Date, supplier: string, account: string, items: [FileBuilder, string][], note?: string): void {
  const reference = referenceFor(s, "bank_transfer");
  s.at(at, label, () => {
    const state = s.state;
    const acc = state.moneyAccounts[s.ref(`a:${account}`)];
    const allocations = items
      .map(([f, key]) => {
        const line = state.lines[f.lineId(key)];
        return { lineId: line.id, amount: lineSupplierDue(state, line) };
      })
      .filter((a) => a.amount.amountMinor > 0);
    const rate = state.settings.fx.USD_TZS;
    const same = allocations.filter((a) => a.amount.currency === acc.currency).reduce((t, a) => t + a.amount.amountMinor, 0);
    const otherCur: Currency = acc.currency === "TZS" ? "USD" : "TZS";
    const other = money(
      allocations.filter((a) => a.amount.currency !== acc.currency).reduce((t, a) => t + a.amount.amountMinor, 0),
      otherCur,
    );
    const amount = money(same + convert(other, acc.currency, rate).amountMinor, acc.currency);
    s.run(`${label}: recordSupplierPayment`, at, "peter", recordSupplierPayment, { supplierId: s.ref(`s:${supplier}`), amount, accountId: acc.id, allocations, paidAt: at.toISOString(), reference, note });
  });
}

/** Records an expense paid `daysAgo` days ago (recorded by Peter that afternoon). daysAgo ≥ 1. */
export function expense(s: Seeder, daysAgo: number, category: ExpenseCategory, payee: string, amount: [number, Currency], account: string, note?: string): void {
  const paidAt = s.date(-daysAgo);
  const at = s.day(daysAgo, "15:30");
  s.at(at, `expense ${category} ${payee}`, () => {
    s.run(`expense ${category} ${payee}`, at, "peter", recordExpense, { category, payee, amount: major(...amount), accountId: s.ref(`a:${account}`), paidAt, note });
  });
}
