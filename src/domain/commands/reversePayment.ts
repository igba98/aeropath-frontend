import { z } from "zod";
import type { Command, ID } from "../types";
import { makeAudit } from "../audit";
import { format } from "../money";
import { mirrorGroup, paymentGroupOf } from "../ledger/postings";
import { denied, fail, nowIso, ok, parse, post, produce } from "./_helpers";
import { zId, zText } from "./_schemas";

export interface ReversePaymentInput {
  paymentId: ID;
  reason: string;
}

const schema = z.object({ paymentId: zId, reason: zText("Reason") });

/**
 * Reverses a payment (in or out): posts the exact mirror of its ledger group and marks it reversed. Reversing a refund
 * payout reopens the refund as approved-but-unpaid.
 */
export const reversePayment: Command<ReversePaymentInput> = (state, input, ctx) => {
  const no = denied(ctx, "payment.reverse");
  if (no) return no;
  const parsed = parse(schema, input);
  if (!parsed.ok) return parsed;
  const f = parsed.data;

  const p = state.payments[f.paymentId];
  if (!p) return fail("NOT_FOUND", "This payment could not be found.", "paymentId");
  if (p.status === "reversed") return fail("CONFLICT", `${p.number} is already reversed.`);

  const at = nowIso(ctx);
  const posted = post(() => mirrorGroup(paymentGroupOf(state.ledger, p.id), { newId: ctx.newId, at }, { kind: "payment_reversal", memo: `Reversal of ${p.number}: ${f.reason}` }));
  if (!posted.ok) return posted;

  const next = produce(state, (d) => {
    const dp = d.payments[p.id];
    dp.status = "reversed";
    dp.reversal = { by: ctx.user.id, at, reason: f.reason };
    d.ledger.push(...posted.entries);
    for (const a of p.allocations) if (d.files[a.fileId]) d.files[a.fileId].updatedAt = at;
    if (p.direction === "out" && p.refundRequestId) {
      const r = d.refunds[p.refundRequestId];
      if (r && r.status === "paid" && r.payoutPaymentId === p.id) {
        r.status = "approved";
        delete r.payoutPaymentId;
      }
    }
  });
  const audit = p.allocations.map((a) => makeAudit(ctx, "payment.reversed", "payment", p.id, `Payment ${p.number} of ${format(p.amount)} reversed: ${f.reason}`, a.fileId));
  return ok(next, audit, undefined, `${p.number} reversed`);
};
