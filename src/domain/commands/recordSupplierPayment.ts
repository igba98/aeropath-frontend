import { z } from "zod";
import type { AuditEvent, Command, ID, Money, SupplierPayment } from "../types";
import { makeAudit } from "../audit";
import { format, money, sub } from "../money";
import { allocationsMatchAmount, allocationsTotal } from "../allocations";
import { postSupplierPayment } from "../ledger/postings";
import { lineSupplierDue } from "../selectors/core";
import { LINE_STATUS_LABELS } from "../status/line-statuses";
import { denied, fail, nowIso, ok, parse, post, produce, takeNumber, unique } from "./_helpers";
import { zId, zMoneyPos, zOptDateTime, zOptText } from "./_schemas";

export interface RecordSupplierPaymentInput {
  supplierId: ID;
  /** In the paying account's currency. */
  amount: Money;
  accountId: ID;
  /** Each allocation is in the line's pricing currency. */
  allocations: { lineId: ID; amount: Money }[];
  /** Defaults to now. */
  paidAt?: string;
  reference?: string;
  note?: string;
}

export interface RecordSupplierPaymentResult {
  supplierPaymentId: ID;
  number: string;
}

const schema = z.object({
  supplierId: zId,
  amount: zMoneyPos,
  accountId: zId,
  allocations: z.array(z.object({ lineId: zId, amount: zMoneyPos })).min(1, "Choose at least one service to pay for."),
  paidAt: zOptDateTime,
  reference: zOptText,
  note: zOptText,
});

/** Pays a supplier for issued business: Dr 2100 supplier · Cr 1100 account; updates each line's supplierPaidMinor. */
export const recordSupplierPayment: Command<RecordSupplierPaymentInput, RecordSupplierPaymentResult> = (state, input, ctx) => {
  const no = denied(ctx, "supplier_payment.record");
  if (no) return no;
  const parsed = parse(schema, input);
  if (!parsed.ok) return parsed;
  const f = parsed.data;

  const supplier = state.suppliers[f.supplierId];
  if (!supplier) return fail("NOT_FOUND", "This supplier could not be found.", "supplierId");
  const account = state.moneyAccounts[f.accountId];
  if (!account) return fail("NOT_FOUND", "Choose the account the payment is made from.", "accountId");
  if (!account.active) return fail("VALIDATION", `${account.name} is inactive. Choose another account.`, "accountId");
  if (account.currency !== f.amount.currency) {
    return fail("VALIDATION", `${account.name} holds ${account.currency}. Choose a ${f.amount.currency} account or change the payment currency.`, "accountId");
  }

  const seen = new Set<ID>();
  for (let i = 0; i < f.allocations.length; i++) {
    const a = f.allocations[i];
    const line = state.lines[a.lineId];
    if (!line) return fail("NOT_FOUND", "One of the services could not be found.", `allocations.${i}.lineId`);
    if (seen.has(line.id)) return fail("VALIDATION", `${line.description} is listed twice. Combine the amounts into one line.`, `allocations.${i}.lineId`);
    seen.add(line.id);
    if (line.supplierId !== supplier.id) return fail("VALIDATION", `${line.description} is supplied by someone else, not ${supplier.name}.`, `allocations.${i}.lineId`);
    if (a.amount.currency !== line.pricing.currency) {
      return fail("VALIDATION", `${line.description} is priced in ${line.pricing.currency}; allocate the amount in ${line.pricing.currency}.`, `allocations.${i}.amount`);
    }
    const due = lineSupplierDue(state, line);
    if (due.amountMinor <= 0) {
      const why = ["quoted", "booked", "cancelled", "voided"].includes(line.status) ? ` (it is ${LINE_STATUS_LABELS[line.status].toLowerCase()})` : "";
      return fail("VALIDATION", `Nothing is owed to ${supplier.name} for ${line.description}${why}.`, `allocations.${i}.lineId`);
    }
    if (a.amount.amountMinor > due.amountMinor) {
      return fail("VALIDATION", `Only ${format(due)} is still owed for ${line.description}.`, `allocations.${i}.amount`);
    }
  }

  const rate = state.settings.fx.USD_TZS;
  const allocs = f.allocations.map((a) => a.amount);
  if (!allocationsMatchAmount(f.amount, allocs, rate)) {
    const total = allocationsTotal(allocs, f.amount.currency, rate);
    return fail("VALIDATION", `The allocations add up to ${format(total)} but the payment is ${format(f.amount)} (difference ${format(sub(f.amount, total))}). Make them equal.`, "allocations");
  }

  const { number, counters } = takeNumber(state, "supplier_payment", ctx);
  const id = ctx.newId("spy");
  const paidAt = f.paidAt ?? nowIso(ctx);
  const sp: SupplierPayment = {
    id,
    number,
    supplierId: supplier.id,
    amount: f.amount,
    accountId: account.id,
    allocations: f.allocations.map((a) => ({ lineId: a.lineId, amount: a.amount })),
    paidAt,
    recordedBy: ctx.user.id,
  };
  if (f.reference) sp.reference = f.reference;
  if (f.note) sp.note = f.note;

  const posted = post(() => postSupplierPayment(sp, state.lines, rate, { newId: ctx.newId, at: paidAt }));
  if (!posted.ok) return posted;

  const next = produce(state, (d) => {
    d.supplierPayments[id] = sp;
    d.counters = counters;
    for (const a of sp.allocations) {
      const l = d.lines[a.lineId];
      l.supplierPaidMinor = (l.supplierPaidMinor || 0) + a.amount.amountMinor;
    }
    d.ledger.push(...posted.entries);
  });

  const fileIds = unique(sp.allocations.map((a) => state.lines[a.lineId].fileId));
  const audit: AuditEvent[] = fileIds.map((fileId) => {
    const part = sp.allocations.filter((a) => state.lines[a.lineId].fileId === fileId);
    const partText = part.map((a) => `${format(a.amount)} for ${state.lines[a.lineId].description}`).join("; ");
    return makeAudit(ctx, "supplier_payment.recorded", "supplier_payment", id, `Supplier payment ${number} to ${supplier.name}: ${partText}`, fileId);
  });
  return ok(next, audit, { supplierPaymentId: id, number }, `Paid ${supplier.name} ${format(money(f.amount.amountMinor, f.amount.currency))} (${number})`);
};
