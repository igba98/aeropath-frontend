import { z } from "zod";
import type { Command, ID, Money, Payment, PaymentMethod } from "../types";
import { makeAudit } from "../audit";
import { convert, format } from "../money";
import { toFileMoney } from "../pricing";
import { postPaymentOut } from "../ledger/postings";
import { denied, fail, nowIso, ok, parse, post, produce, takeNumber } from "./_helpers";
import { zId, zOptDateTime, zOptText, zPaymentMethod } from "./_schemas";

export interface PayRefundInput {
  refundId: ID;
  accountId: ID;
  method: PaymentMethod;
  /** Required unless cash. */
  reference?: string;
  /** Defaults to now. */
  paidAt?: string;
}

export interface PayRefundResult {
  paymentId: ID;
  number: string;
}

const schema = z.object({ refundId: zId, accountId: zId, method: zPaymentMethod, reference: zOptText, paidAt: zOptDateTime });

/**
 * Pays out an approved client refund: a Payment with direction 'out' (RFD- series) allocated to the file in the file
 * currency, posted Dr 1200 client · Cr 1100 account. Payouts are made by finance staff and are recorded as verified.
 */
export const payRefund: Command<PayRefundInput, PayRefundResult> = (state, input, ctx) => {
  const no = denied(ctx, "refund.pay");
  if (no) return no;
  const parsed = parse(schema, input);
  if (!parsed.ok) return parsed;
  const f = parsed.data;

  const refund = state.refunds[f.refundId];
  if (!refund) return fail("NOT_FOUND", "This refund request could not be found.", "refundId");
  if (refund.kind !== "refund") return fail("CONFLICT", `${refund.number} is an exchange; there is nothing to pay out.`);
  if (refund.status === "paid") return fail("CONFLICT", `${refund.number} has already been paid out.`);
  if (refund.status !== "approved") return fail("CONFLICT", `${refund.number} must be approved before it can be paid out.`);
  if (refund.quote.clientRefund.amountMinor <= 0) return fail("CONFLICT", `${refund.number} has no money to return to the client.`);

  const account = state.moneyAccounts[f.accountId];
  if (!account) return fail("NOT_FOUND", "Choose the account the refund is paid from.", "accountId");
  if (!account.active) return fail("VALIDATION", `${account.name} is inactive. Choose another account.`, "accountId");
  if (f.method !== "cash" && !f.reference) return fail("VALIDATION", "Enter the transaction reference (only cash payouts can go without one).", "reference");

  const line = state.lines[refund.lineId];
  const file = state.files[refund.fileId];
  if (!line || !file) return fail("NOT_FOUND", "The booking for this refund could not be found.");

  const rate = state.settings.fx.USD_TZS;
  const clientRefund = refund.quote.clientRefund;
  const allocation = toFileMoney(clientRefund, file.currency, line.pricing.fxToFile, rate);
  const amount: Money =
    account.currency === clientRefund.currency ? clientRefund : account.currency === file.currency ? allocation : convert(clientRefund, account.currency, rate);

  const { number, counters } = takeNumber(state, "refund_payout", ctx);
  const id = ctx.newId("pay");
  const paidAt = f.paidAt ?? nowIso(ctx);
  const payment: Payment = {
    id,
    number,
    direction: "out",
    clientId: file.clientId,
    amount,
    allocations: [{ fileId: file.id, amount: allocation }],
    method: f.method,
    accountId: account.id,
    receivedAt: paidAt,
    status: "verified",
    recordedBy: ctx.user.id,
    verifiedBy: ctx.user.id,
    verifiedAt: nowIso(ctx),
    refundRequestId: refund.id,
  };
  if (amount.currency !== file.currency) payment.fxRate = rate;
  if (f.reference) payment.reference = f.reference;

  const posted = post(() => postPaymentOut(payment, rate, { newId: ctx.newId, at: paidAt }));
  if (!posted.ok) return posted;

  const next = produce(state, (d) => {
    d.payments[id] = payment;
    d.counters = counters;
    d.refunds[refund.id] = { ...refund, status: "paid", payoutPaymentId: id };
    d.ledger.push(...posted.entries);
    d.files[file.id].updatedAt = nowIso(ctx);
  });
  return ok(
    next,
    [makeAudit(ctx, "refund.paid", "refund", refund.id, `Refund ${refund.number} paid out: ${format(amount)} from ${account.name} (${number})`, file.id)],
    { paymentId: id, number },
    `Refund paid — ${format(amount)} (${number})`,
  );
};
