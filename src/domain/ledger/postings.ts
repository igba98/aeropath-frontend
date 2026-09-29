import type { AccountCode, Expense, ID, ISODateTime, LedgerEntry, LedgerKind, Money, Payment, RefundRequest, ServiceLine, SupplierPayment } from "../types";
import { convert } from "../money";
import { EXPENSE_ACCOUNT } from "./accounts";

/**
 * Posting rules (spec §8.4). Every builder returns ONE balanced entry group in the transaction's currency
 * (line pricing currency for line events, payment currency for payments). Negative amounts flip sides; zero legs
 * are dropped.
 *
 * | Event                 | Debit                          | Credit                                             |
 * | Line issued           | 1200 client: sell              | 2100 supplier: cost · 4200 markup · 4100 fee · 2300 vat |
 * | Payment in            | 1100 account                   | 1200 client                                        |
 * | Payment out (refund)  | 1200 client                    | 1100 account                                       |
 * | Payment reversed      | mirror of the original group   |                                                    |
 * | Line voided           | mirror of the issue group      |                                                    |
 * | Refund approved       | (a) mirror of the issue group, then (b) 1200 client: retained                       |
 * |                       | (b) credits 2100 penalty · 4300 agency fee · 2300 VAT on fee (+ unless waived: 4200 markup, 4100 fee, 2300 original VAT) |
 * | Supplier payment      | 2100 supplier                  | 1100 account                                       |
 * | Expense               | 5xxx category                  | 1100 account                                       |
 */

export interface PostingCtx {
  newId: (prefix: string) => ID;
  at: ISODateTime;
}

type Sub = LedgerEntry["sub"];

interface Leg {
  account: AccountCode;
  side: "debit" | "credit";
  amount: Money;
  sub?: Sub;
  fileId?: ID;
  lineId?: ID;
}

interface GroupMeta {
  kind: LedgerKind;
  ref: LedgerEntry["ref"];
  memo: string;
  fileId?: ID;
  lineId?: ID;
}

export class UnbalancedError extends Error {
  code = "UNBALANCED" as const;
}

function buildGroup(legs: Leg[], meta: GroupMeta, pc: PostingCtx): LedgerEntry[] {
  const groupId = pc.newId("grp");
  const out: LedgerEntry[] = [];
  for (const leg of legs) {
    const minor = leg.amount.amountMinor;
    if (minor === 0) continue;
    const side = minor < 0 ? (leg.side === "debit" ? "credit" : "debit") : leg.side;
    const abs = Math.abs(minor);
    const e: LedgerEntry = {
      id: pc.newId("led"),
      groupId,
      kind: meta.kind,
      at: pc.at,
      account: leg.account,
      debitMinor: side === "debit" ? abs : 0,
      creditMinor: side === "credit" ? abs : 0,
      currency: leg.amount.currency,
      memo: meta.memo,
      ref: meta.ref,
    };
    if (leg.sub) e.sub = leg.sub;
    const fileId = leg.fileId ?? meta.fileId;
    const lineId = leg.lineId ?? meta.lineId;
    if (fileId) e.fileId = fileId;
    if (lineId) e.lineId = lineId;
    out.push(e);
  }
  assertBalanced(out);
  return out;
}

const client = (id: ID): Sub => ({ type: "client", id });
const supplier = (id: ID): Sub => ({ type: "supplier", id });
const account = (id: ID): Sub => ({ type: "money_account", id });

/** Line issued: Dr 1200 sell · Cr 2100 cost, 4200 markup, 4100 service fee, 2300 VAT. */
export function postLineIssue(line: ServiceLine, clientId: ID, pc: PostingCtx): LedgerEntry[] {
  const p = line.pricing;
  return buildGroup(
    [
      { account: "1200", side: "debit", amount: p.sell, sub: client(clientId) },
      { account: "2100", side: "credit", amount: p.cost, sub: supplier(line.supplierId) },
      { account: "4200", side: "credit", amount: p.markup },
      { account: "4100", side: "credit", amount: p.serviceFee },
      { account: "2300", side: "credit", amount: p.vat },
    ],
    { kind: "line_issue", ref: { entity: "line", id: line.id }, memo: `Issued: ${line.description}`, fileId: line.fileId, lineId: line.id },
    pc,
  );
}

/**
 * Splits a payment amount across its allocations in the payment currency. Allocations in another currency convert
 * at `rate` (TZS per USD); the last allocation absorbs rounding so the parts add up exactly to the amount.
 */
export function splitAllocations(amount: Money, allocations: { key: ID; amount: Money }[], rate: number): { key: ID; amount: Money }[] {
  if (!allocations.length) return [];
  const parts = allocations.map((a) => ({ key: a.key, amount: convert(a.amount, amount.currency, rate) }));
  const others = parts.slice(0, -1).reduce((s, p) => s + p.amount.amountMinor, 0);
  parts[parts.length - 1] = { key: parts[parts.length - 1].key, amount: { amountMinor: amount.amountMinor - others, currency: amount.currency } };
  return parts;
}

function paymentMemo(p: Payment): string {
  return `${p.direction === "in" ? "Receipt" : "Refund payout"} ${p.number}${p.reference ? ` · ref ${p.reference}` : ""}`;
}

/** Payment in: Dr 1100 account · Cr 1200 client (one leg per allocated file). */
export function postPaymentIn(payment: Payment, usdTzs: number, pc: PostingCtx): LedgerEntry[] {
  const rate = payment.fxRate ?? usdTzs;
  const parts = splitAllocations(
    payment.amount,
    payment.allocations.map((a) => ({ key: a.fileId, amount: a.amount })),
    rate,
  );
  return buildGroup(
    [
      { account: "1100", side: "debit", amount: payment.amount, sub: account(payment.accountId) },
      ...parts.map((p): Leg => ({ account: "1200", side: "credit", amount: p.amount, sub: client(payment.clientId), fileId: p.key })),
    ],
    { kind: "payment_in", ref: { entity: "payment", id: payment.id }, memo: paymentMemo(payment), fileId: parts.length === 1 ? parts[0].key : undefined },
    pc,
  );
}

/** Payment out (client refund): Dr 1200 client · Cr 1100 account. */
export function postPaymentOut(payment: Payment, usdTzs: number, pc: PostingCtx): LedgerEntry[] {
  const rate = payment.fxRate ?? usdTzs;
  const parts = splitAllocations(
    payment.amount,
    payment.allocations.map((a) => ({ key: a.fileId, amount: a.amount })),
    rate,
  );
  return buildGroup(
    [
      ...parts.map((p): Leg => ({ account: "1200", side: "debit", amount: p.amount, sub: client(payment.clientId), fileId: p.key })),
      { account: "1100", side: "credit", amount: payment.amount, sub: account(payment.accountId) },
    ],
    { kind: "payment_out", ref: { entity: "payment", id: payment.id }, memo: paymentMemo(payment), fileId: parts.length === 1 ? parts[0].key : undefined },
    pc,
  );
}

/** Exact mirror of a group: every debit becomes a credit and vice versa, in a new group. */
export function mirrorGroup(entries: LedgerEntry[], pc: PostingCtx, meta: { kind: LedgerKind; memo?: string; ref?: LedgerEntry["ref"] }): LedgerEntry[] {
  if (!entries.length) return [];
  const groupId = pc.newId("grp");
  const out = entries.map(
    (e): LedgerEntry => ({
      ...e,
      id: pc.newId("led"),
      groupId,
      kind: meta.kind,
      at: pc.at,
      debitMinor: e.creditMinor,
      creditMinor: e.debitMinor,
      memo: meta.memo ?? `Reversal: ${e.memo}`,
      ref: meta.ref ?? e.ref,
    }),
  );
  assertBalanced(out);
  return out;
}

/**
 * Refund approved, part (b): what the agency keeps.
 * Dr 1200 client: retained · Cr 2100 supplier penalty · 4300 agency fee · 2300 VAT on fee
 * (+ unless waived: 4200 original markup · 4100 original service fee · 2300 original VAT).
 */
export function postRefundRetained(refund: RefundRequest, line: ServiceLine, clientId: ID, pc: PostingCtx): LedgerEntry[] {
  const q = refund.quote;
  const p = line.pricing;
  const keepOriginal = !q.waiveOriginalFees;
  const retainedMinor = p.sell.amountMinor - q.clientRefund.amountMinor;
  const legs: Leg[] = [
    { account: "1200", side: "debit", amount: { amountMinor: retainedMinor, currency: q.currency }, sub: client(clientId) },
    { account: "2100", side: "credit", amount: q.supplierPenalty, sub: supplier(line.supplierId) },
    { account: "4300", side: "credit", amount: q.agencyFee },
    { account: "2300", side: "credit", amount: q.vatOnAgencyFee },
  ];
  if (keepOriginal) {
    legs.push({ account: "4200", side: "credit", amount: p.markup }, { account: "4100", side: "credit", amount: p.serviceFee }, { account: "2300", side: "credit", amount: p.vat });
  }
  return buildGroup(legs, { kind: "refund_retained", ref: { entity: "refund", id: refund.id }, memo: `Refund ${refund.number}: kept ${line.description}`, fileId: line.fileId, lineId: line.id }, pc);
}

/** Supplier payment: Dr 2100 supplier (per allocated line) · Cr 1100 account. */
export function postSupplierPayment(sp: SupplierPayment, lines: Record<ID, ServiceLine>, usdTzs: number, pc: PostingCtx): LedgerEntry[] {
  const parts = splitAllocations(
    sp.amount,
    sp.allocations.map((a) => ({ key: a.lineId, amount: a.amount })),
    usdTzs,
  );
  return buildGroup(
    [
      ...parts.map((p): Leg => ({ account: "2100", side: "debit", amount: p.amount, sub: supplier(sp.supplierId), lineId: p.key, fileId: lines[p.key]?.fileId })),
      { account: "1100", side: "credit", amount: sp.amount, sub: account(sp.accountId) },
    ],
    { kind: "supplier_payment", ref: { entity: "supplier_payment", id: sp.id }, memo: `Supplier payment ${sp.number}${sp.reference ? ` · ref ${sp.reference}` : ""}` },
    pc,
  );
}

/** Expense: Dr 5xxx category · Cr 1100 account. */
export function postExpense(expense: Expense, pc: PostingCtx): LedgerEntry[] {
  return buildGroup(
    [
      { account: EXPENSE_ACCOUNT[expense.category], side: "debit", amount: expense.amount },
      { account: "1100", side: "credit", amount: expense.amount, sub: account(expense.accountId) },
    ],
    { kind: "expense", ref: { entity: "expense", id: expense.id }, memo: `Expense ${expense.number} · ${expense.payee}` },
    pc,
  );
}

// ───────────────────────────── Invariants and lookups ─────────────────────────────

/** Σ debit − Σ credit per group and currency. */
export function groupImbalances(entries: LedgerEntry[]): { groupId: ID; currency: string; diff: number }[] {
  const acc = new Map<string, { groupId: ID; currency: string; diff: number }>();
  for (const e of entries) {
    const k = `${e.groupId}|${e.currency}`;
    const cur = acc.get(k) ?? { groupId: e.groupId, currency: e.currency, diff: 0 };
    cur.diff += e.debitMinor - e.creditMinor;
    acc.set(k, cur);
  }
  return [...acc.values()].filter((g) => g.diff !== 0);
}

export const isBalanced = (entries: LedgerEntry[]): boolean => groupImbalances(entries).length === 0;

/** Throws UnbalancedError unless every group balances (Σ debit = Σ credit) per currency. */
export function assertBalanced(entries: LedgerEntry[]): void {
  const bad = groupImbalances(entries);
  if (bad.length) {
    const b = bad[0];
    throw new UnbalancedError(`Ledger group ${b.groupId} does not balance in ${b.currency} (difference ${b.diff} minor units).`);
  }
}

/** Entries of the most recent group whose entries match `pred` (by ledger order). */
export function latestGroup(ledger: LedgerEntry[], pred: (e: LedgerEntry) => boolean): LedgerEntry[] {
  for (let i = ledger.length - 1; i >= 0; i--) {
    if (pred(ledger[i])) {
      const gid = ledger[i].groupId;
      return ledger.filter((e) => e.groupId === gid);
    }
  }
  return [];
}

/** The issue group of a line (to mirror on void or refund). */
export const issueGroupOf = (ledger: LedgerEntry[], lineId: ID): LedgerEntry[] =>
  latestGroup(ledger, (e) => e.kind === "line_issue" && e.ref.entity === "line" && e.ref.id === lineId);

/** The original posting group of a payment (payment_in or payment_out). */
export const paymentGroupOf = (ledger: LedgerEntry[], paymentId: ID): LedgerEntry[] =>
  latestGroup(ledger, (e) => (e.kind === "payment_in" || e.kind === "payment_out") && e.ref.entity === "payment" && e.ref.id === paymentId);

/** The current (latest, not yet reversed) posting group of an expense. */
export const expenseGroupOf = (ledger: LedgerEntry[], expenseId: ID): LedgerEntry[] =>
  latestGroup(ledger, (e) => e.kind === "expense" && e.ref.entity === "expense" && e.ref.id === expenseId);
