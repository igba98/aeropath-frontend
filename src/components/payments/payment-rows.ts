import type { BookingFile, Client, Currency, DbState, ID, Money, MoneyAccount, Payment, PaymentMethod, RefundRequest, ServiceLine, User } from "@/domain/types";
import { add, convert, neg, zero } from "@/domain/money";
import { refundNeedsManager } from "@/domain/permissions";
import { PAYMENT_METHODS } from "@/store/seed/reference";

/** View models for the Payments screen: one row per payment (in and out) and per refund request. */

export const METHOD_LABEL: Record<PaymentMethod, string> = Object.fromEntries(PAYMENT_METHODS.map((m) => [m.value, m.label])) as Record<PaymentMethod, string>;

export const MOBILE_METHODS: PaymentMethod[] = ["mpesa", "airtel_money", "mixx", "halopesa"];

export interface PaymentRow {
  id: ID;
  payment: Payment;
  number: string;
  out: boolean;
  client?: Client;
  files: BookingFile[];
  account?: MoneyAccount;
  recordedBy?: User;
  /** Signed: payouts are negative so sums read as net money in. */
  signed: Money;
  refund?: RefundRequest;
}

export function paymentRow(db: DbState, p: Payment): PaymentRow {
  return {
    id: p.id,
    payment: p,
    number: p.number,
    out: p.direction === "out",
    client: db.clients[p.clientId],
    files: [...new Set(p.allocations.map((a) => a.fileId))].map((id) => db.files[id]).filter(Boolean),
    account: db.moneyAccounts[p.accountId],
    recordedBy: db.users[p.recordedBy],
    signed: p.direction === "out" ? neg(p.amount) : p.amount,
    refund: p.refundRequestId ? db.refunds[p.refundRequestId] : undefined,
  };
}

export function paymentRows(db: DbState, filter?: (p: Payment) => boolean): PaymentRow[] {
  return Object.values(db.payments)
    .filter((p) => (filter ? filter(p) : true))
    .map((p) => paymentRow(db, p))
    .sort((a, b) => b.payment.receivedAt.localeCompare(a.payment.receivedAt));
}

/** Net of non-reversed rows in one display currency, at the current rate. */
export function netIn(rows: PaymentRow[], to: Currency, usdTzs: number): Money {
  return rows.filter((r) => r.payment.status !== "reversed").reduce((acc, r) => add(acc, convert(r.signed, to, usdTzs)), zero(to));
}

export interface RefundRow {
  id: ID;
  refund: RefundRequest;
  number: string;
  file?: BookingFile;
  client?: Client;
  line?: ServiceLine;
  requestedBy?: User;
  needsManager: boolean;
  /** Approved, money still to go back to the client. */
  toPayOut: boolean;
  /** Exchanges: what the client pays on top (additional fare + airline fee + agency fee + VAT on it). */
  extraToCollect?: Money;
}

export function exchangeExtra(r: RefundRequest, usdTzs: number): Money | undefined {
  if (r.kind !== "exchange" || !r.exchange) return undefined;
  const c = r.quote.currency;
  return [convert(r.exchange.additionalFare, c, usdTzs), r.quote.supplierPenalty, r.quote.agencyFee, r.quote.vatOnAgencyFee].reduce((a, m) => add(a, m), zero(c));
}

export function refundRow(db: DbState, r: RefundRequest): RefundRow {
  const file = db.files[r.fileId];
  return {
    id: r.id,
    refund: r,
    number: r.number,
    file,
    client: file ? db.clients[file.clientId] : undefined,
    line: db.lines[r.lineId],
    requestedBy: db.users[r.requestedBy],
    needsManager: r.kind === "refund" && refundNeedsManager(r.quote.clientRefund, db.settings),
    toPayOut: r.kind === "refund" && r.status === "approved" && r.quote.clientRefund.amountMinor > 0,
    extraToCollect: exchangeExtra(r, db.settings.fx.USD_TZS),
  };
}

export function refundRows(db: DbState): RefundRow[] {
  return Object.values(db.refunds)
    .map((r) => refundRow(db, r))
    .sort((a, b) => b.refund.requestedAt.localeCompare(a.refund.requestedAt));
}
