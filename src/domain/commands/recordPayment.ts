import { z } from "zod";
import type { AuditEvent, Command, ID, Money, Payment, PaymentMethod } from "../types";
import { makeAudit } from "../audit";
import { format, sub } from "../money";
import { allocationsMatchAmount, allocationsTotal } from "../allocations";
import { postPaymentIn } from "../ledger/postings";
import { denied, fail, nowIso, ok, parse, post, produce, takeNumber } from "./_helpers";
import { zId, zMoneyPos, zOptDateTime, zOptText, zPaymentMethod } from "./_schemas";

export interface RecordPaymentInput {
  clientId: ID;
  /** In the currency actually received. */
  amount: Money;
  /** Each allocation is in its booking's currency. Allocating more than a balance is allowed (client credit). */
  allocations: { fileId: ID; amount: Money }[];
  /** TZS per 1 USD. Only an Accountant or a Manager may use a rate different from settings. */
  fxRate?: number;
  method: PaymentMethod;
  accountId: ID;
  /** Required for every method except cash. */
  reference?: string;
  fiscalReceiptNo?: string;
  /** ISO instant or Dar-local "YYYY-MM-DDTHH:mm". Defaults to now. */
  receivedAt?: string;
  note?: string;
}

export interface RecordPaymentResult {
  paymentId: ID;
  number: string;
}

export const METHOD_LABELS: Record<PaymentMethod, string> = {
  cash: "Cash",
  bank_transfer: "Bank transfer",
  mpesa: "M-Pesa",
  airtel_money: "Airtel Money",
  mixx: "Mixx by Yas",
  halopesa: "HaloPesa",
  card: "Card",
  cheque: "Cheque",
};

const schema = z.object({
  clientId: zId,
  amount: zMoneyPos,
  allocations: z.array(z.object({ fileId: zId, amount: zMoneyPos })).min(1, "Allocate the payment to at least one booking."),
  fxRate: z.number().positive("The exchange rate must be more than zero.").optional(),
  method: zPaymentMethod,
  accountId: zId,
  reference: zOptText,
  fiscalReceiptNo: zOptText,
  receivedAt: zOptDateTime,
  note: zOptText,
});

export const recordPayment: Command<RecordPaymentInput, RecordPaymentResult> = (state, input, ctx) => {
  const no = denied(ctx, "payment.record");
  if (no) return no;
  const parsed = parse(schema, input);
  if (!parsed.ok) return parsed;
  const f = parsed.data;

  const settingsRate = state.settings.fx.USD_TZS;
  if (f.fxRate !== undefined && Math.abs(f.fxRate - settingsRate) > 1e-9 * settingsRate) {
    const noFx = denied(ctx, "fx.override");
    if (noFx) return { ...noFx, error: { ...noFx.error, field: "fxRate" } };
  }
  const rate = f.fxRate ?? settingsRate;

  const client = state.clients[f.clientId];
  if (!client) return fail("NOT_FOUND", "Choose the client who paid.", "clientId");
  if (f.method !== "cash" && !f.reference) return fail("VALIDATION", "Enter the transaction reference (only cash can go without one).", "reference");

  const account = state.moneyAccounts[f.accountId];
  if (!account) return fail("NOT_FOUND", "Choose the account the money went into.", "accountId");
  if (!account.active) return fail("VALIDATION", `${account.name} is inactive. Choose another account.`, "accountId");
  if (account.currency !== f.amount.currency) {
    return fail("VALIDATION", `${account.name} holds ${account.currency}. Choose a ${f.amount.currency} account or change the payment currency.`, "accountId");
  }

  const seen = new Set<ID>();
  for (let i = 0; i < f.allocations.length; i++) {
    const a = f.allocations[i];
    const file = state.files[a.fileId];
    if (!file) return fail("NOT_FOUND", "One of the bookings could not be found.", `allocations.${i}.fileId`);
    if (seen.has(file.id)) return fail("VALIDATION", `Booking ${file.number} is listed twice. Combine the amounts into one line.`, `allocations.${i}.fileId`);
    seen.add(file.id);
    if (file.clientId !== client.id) return fail("VALIDATION", `Booking ${file.number} belongs to another client.`, `allocations.${i}.fileId`);
    if (a.amount.currency !== file.currency) {
      return fail("VALIDATION", `Booking ${file.number} is invoiced in ${file.currency}; allocate the amount in ${file.currency}.`, `allocations.${i}.amount`);
    }
  }

  const allocs = f.allocations.map((a) => a.amount);
  if (!allocationsMatchAmount(f.amount, allocs, rate)) {
    const total = allocationsTotal(allocs, f.amount.currency, rate);
    return fail(
      "VALIDATION",
      `The allocations add up to ${format(total)} but the payment is ${format(f.amount)} (difference ${format(sub(f.amount, total))}). Make them equal.`,
      "allocations",
    );
  }

  const { number, counters } = takeNumber(state, "receipt", ctx);
  const id = ctx.newId("pay");
  const receivedAt = f.receivedAt ?? nowIso(ctx);
  const payment: Payment = {
    id,
    number,
    direction: "in",
    clientId: client.id,
    amount: f.amount,
    allocations: f.allocations.map((a) => ({ fileId: a.fileId, amount: a.amount })),
    method: f.method,
    accountId: account.id,
    receivedAt,
    status: "recorded",
    recordedBy: ctx.user.id,
  };
  if (f.allocations.some((a) => a.amount.currency !== f.amount.currency)) payment.fxRate = rate;
  if (f.reference) payment.reference = f.reference;
  if (f.fiscalReceiptNo) payment.fiscalReceiptNo = f.fiscalReceiptNo;
  if (f.note) payment.note = f.note;

  const posted = post(() => postPaymentIn(payment, settingsRate, { newId: ctx.newId, at: receivedAt }));
  if (!posted.ok) return posted;

  const at = nowIso(ctx);
  const next = produce(state, (d) => {
    d.payments[id] = payment;
    d.counters = counters;
    d.ledger.push(...posted.entries);
    for (const a of payment.allocations) d.files[a.fileId].updatedAt = at;
  });

  const how = `${METHOD_LABELS[f.method]}${f.reference ? `, ref ${f.reference}` : ""}`;
  const audit: AuditEvent[] = payment.allocations.map((a) => {
    const file = state.files[a.fileId];
    const part = payment.allocations.length > 1 ? `; ${format(a.amount)} to ${file.number}` : "";
    return makeAudit(ctx, "payment.recorded", "payment", id, `Payment ${number} of ${format(f.amount)} received from ${client.name} (${how})${part}`, a.fileId);
  });
  return ok(next, audit, { paymentId: id, number }, `Payment recorded — receipt ${number}`);
};
