import type { Command, ID } from "../types";
import { makeAudit } from "../audit";
import { format } from "../money";
import { expenseGroupOf, mirrorGroup } from "../ledger/postings";
import { denied, fail, nowIso, ok, post, produce } from "./_helpers";

export interface DeleteExpenseInput {
  expenseId: ID;
  reason?: string;
}

/** Soft-deletes an expense (deletedAt) and posts reversing entries. */
export const deleteExpense: Command<DeleteExpenseInput> = (state, input, ctx) => {
  const no = denied(ctx, "expense.record");
  if (no) return no;
  const e = state.expenses[input?.expenseId];
  if (!e) return fail("NOT_FOUND", "This expense could not be found.", "expenseId");
  if (e.deletedAt) return fail("CONFLICT", `Expense ${e.number} is already deleted.`);

  const at = nowIso(ctx);
  const reason = input.reason?.trim() || undefined;
  const posted = post(() => mirrorGroup(expenseGroupOf(state.ledger, e.id), { newId: ctx.newId, at }, { kind: "expense_reversal", memo: `Expense ${e.number} deleted${reason ? `: ${reason}` : ""}` }));
  if (!posted.ok) return posted;

  const next = produce(state, (d) => {
    d.expenses[e.id].deletedAt = at;
    d.ledger.push(...posted.entries);
  });
  return ok(next, [makeAudit(ctx, "expense.deleted", "expense", e.id, `Expense ${e.number} (${format(e.amount)} to ${e.payee}) deleted${reason ? `: ${reason}` : ""}`)], undefined, `Expense ${e.number} deleted`);
};
