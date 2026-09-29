import { z } from "zod";
import type { Command, DbState, Expense, ExpenseCategory, ID, ISODate, Money } from "../types";
import { makeAudit } from "../audit";
import { darLocalToUtc } from "../dates";
import { format } from "../money";
import { EXPENSE_CATEGORY_LABELS } from "../ledger/accounts";
import { postExpense } from "../ledger/postings";
import { denied, fail, ok, parse, post, produce, takeNumber, type Fail } from "./_helpers";
import { zId, zISODate, zMoneyPos, zOptText, zText } from "./_schemas";

export interface RecordExpenseInput {
  category: ExpenseCategory;
  payee: string;
  amount: Money;
  accountId: ID;
  paidAt: ISODate;
  note?: string;
  /** File name only in the prototype. */
  attachmentName?: string;
}

export interface RecordExpenseResult {
  expenseId: ID;
  number: string;
}

export const EXPENSE_CATEGORIES = ["rent", "salaries", "utilities", "internet_phone", "marketing", "transport", "office_supplies", "bank_charges", "gds_fees", "taxes_licences", "other"] as const;

export const expenseSchema = z.object({
  category: z.enum(EXPENSE_CATEGORIES),
  payee: zText("Payee"),
  amount: zMoneyPos,
  accountId: zId,
  paidAt: zISODate,
  note: zOptText,
  attachmentName: zOptText,
});

/** Account checks shared by record and update. */
export function checkExpenseAccount(state: DbState, accountId: ID, amount: Money, field = "accountId"): Fail | null {
  const account = state.moneyAccounts[accountId];
  if (!account) return fail("NOT_FOUND", "Choose the account the expense was paid from.", field);
  if (!account.active) return fail("VALIDATION", `${account.name} is inactive. Choose another account.`, field);
  if (account.currency !== amount.currency) return fail("VALIDATION", `${account.name} holds ${account.currency}. Choose a ${amount.currency} account or change the currency.`, field);
  return null;
}

/** Ledger time for an expense: noon Dar es Salaam on the paid date, so reports put it on the right day. */
export const expenseLedgerAt = (paidAt: ISODate): string => darLocalToUtc(paidAt);

export const recordExpense: Command<RecordExpenseInput, RecordExpenseResult> = (state, input, ctx) => {
  const no = denied(ctx, "expense.record");
  if (no) return no;
  const parsed = parse(expenseSchema, input);
  if (!parsed.ok) return parsed;
  const f = parsed.data;
  const badAccount = checkExpenseAccount(state, f.accountId, f.amount);
  if (badAccount) return badAccount;

  const { number, counters } = takeNumber(state, "expense", ctx);
  const id = ctx.newId("exp");
  const expense: Expense = { id, number, category: f.category, payee: f.payee, amount: f.amount, accountId: f.accountId, paidAt: f.paidAt, recordedBy: ctx.user.id };
  if (f.note) expense.note = f.note;
  if (f.attachmentName) expense.attachmentName = f.attachmentName;

  const posted = post(() => postExpense(expense, { newId: ctx.newId, at: expenseLedgerAt(f.paidAt) }));
  if (!posted.ok) return posted;

  const next = produce(state, (d) => {
    d.expenses[id] = expense;
    d.counters = counters;
    d.ledger.push(...posted.entries);
  });
  return ok(
    next,
    [makeAudit(ctx, "expense.recorded", "expense", id, `Expense ${number}: ${EXPENSE_CATEGORY_LABELS[f.category]} ${format(f.amount)} to ${f.payee}`)],
    { expenseId: id, number },
    `Expense ${number} recorded`,
  );
};
