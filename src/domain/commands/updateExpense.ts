import type { Command, Expense, ID, LedgerEntry } from "../types";
import { makeAudit } from "../audit";
import { format } from "../money";
import { expenseGroupOf, mirrorGroup, postExpense } from "../ledger/postings";
import { denied, fail, nowIso, ok, parse, post, produce } from "./_helpers";
import { checkExpenseAccount, expenseLedgerAt, expenseSchema, type RecordExpenseInput } from "./recordExpense";

export interface UpdateExpenseInput {
  expenseId: ID;
  /** "" clears note / attachmentName. */
  patch: Partial<RecordExpenseInput>;
}

/** Edits an expense. When the amount, account, category or date changes, the old posting is reversed and a new one posted. */
export const updateExpense: Command<UpdateExpenseInput> = (state, input, ctx) => {
  const no = denied(ctx, "expense.record");
  if (no) return no;
  const current = state.expenses[input?.expenseId];
  if (!current) return fail("NOT_FOUND", "This expense could not be found.", "expenseId");
  if (current.deletedAt) return fail("CONFLICT", `Expense ${current.number} was deleted and cannot be edited.`);

  const merged: Record<string, unknown> = { ...current };
  for (const [k, v] of Object.entries(input.patch ?? {})) if (v !== undefined) merged[k] = v;
  const parsed = parse(expenseSchema, merged, "patch");
  if (!parsed.ok) return parsed;
  const f = parsed.data;
  const badAccount = checkExpenseAccount(state, f.accountId, f.amount, "patch.accountId");
  if (badAccount) return badAccount;

  const updated: Expense = { ...current, category: f.category, payee: f.payee, amount: f.amount, accountId: f.accountId, paidAt: f.paidAt };
  if (f.note) updated.note = f.note;
  else delete updated.note;
  if (f.attachmentName) updated.attachmentName = f.attachmentName;
  else delete updated.attachmentName;

  const moneyChanged =
    f.amount.amountMinor !== current.amount.amountMinor ||
    f.amount.currency !== current.amount.currency ||
    f.accountId !== current.accountId ||
    f.category !== current.category ||
    f.paidAt !== current.paidAt;

  const entries: LedgerEntry[] = [];
  if (moneyChanged) {
    const at = nowIso(ctx);
    const reversal = post(() => mirrorGroup(expenseGroupOf(state.ledger, current.id), { newId: ctx.newId, at }, { kind: "expense_reversal", memo: `Correction of expense ${current.number}` }));
    if (!reversal.ok) return reversal;
    const repost = post(() => postExpense(updated, { newId: ctx.newId, at: expenseLedgerAt(updated.paidAt) }));
    if (!repost.ok) return repost;
    entries.push(...reversal.entries, ...repost.entries);
  }

  const next = produce(state, (d) => {
    d.expenses[current.id] = updated;
    if (entries.length) d.ledger.push(...entries);
  });
  const change = moneyChanged ? ` (was ${format(current.amount)}, now ${format(updated.amount)})` : "";
  return ok(next, [makeAudit(ctx, "expense.updated", "expense", current.id, `Expense ${current.number} updated${change}`)], undefined, "Expense saved");
};
