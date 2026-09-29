import type { Command, ID } from "../types";
import { makeAudit } from "../audit";
import { format } from "../money";
import { denied, fail, nowIso, ok, produce } from "./_helpers";

export interface VerifyPaymentInput {
  paymentId: ID;
}

/** Marks a recorded payment as checked against the bank or mobile money statement. No ledger impact. */
export const verifyPayment: Command<VerifyPaymentInput> = (state, input, ctx) => {
  const no = denied(ctx, "payment.verify");
  if (no) return no;
  const p = state.payments[input?.paymentId];
  if (!p) return fail("NOT_FOUND", "This payment could not be found.", "paymentId");
  if (p.status === "verified") return fail("CONFLICT", `${p.number} is already verified.`);
  if (p.status === "reversed") return fail("CONFLICT", `${p.number} was reversed and cannot be verified.`);

  const at = nowIso(ctx);
  const next = produce(state, (d) => {
    const dp = d.payments[p.id];
    dp.status = "verified";
    dp.verifiedBy = ctx.user.id;
    dp.verifiedAt = at;
  });
  const audit = p.allocations.map((a) => makeAudit(ctx, "payment.verified", "payment", p.id, `Payment ${p.number} of ${format(p.amount)} verified`, a.fileId));
  return ok(next, audit, undefined, `${p.number} verified`);
};
