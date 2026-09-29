import { z } from "zod";
import type { Command, ID, ISODate, Money } from "../types";
import { makeAudit } from "../audit";
import { can, forbiddenMessage } from "../permissions";
import { format } from "../money";
import { createJournal } from "./_journals";
import { fail, parse } from "./_helpers";
import { zId, zISODate, zMoneyPos, zOptText } from "./_schemas";

export interface TransferMoneyInput {
  fromAccountId: ID;
  toAccountId: ID;
  amount: Money;
  date: ISODate;
  memo?: string;
}

export interface TransferMoneyResult {
  journalId: ID;
  number: string;
}

const schema = z.object({ fromAccountId: zId, toAccountId: zId, amount: zMoneyPos, date: zISODate, memo: zOptText });

/**
 * Moves money between two money accounts of the same currency: a petty cash top-up from the bank, banking the cash
 * box, a bank to M-Pesa float. Stored as a journal (source "transfer") posting Dr 1100 (to) · Cr 1100 (from).
 * Anyone who posts journals may transfer; a transfer into or out of a cash box also counts as petty cash work.
 */
export const transferMoney: Command<TransferMoneyInput, TransferMoneyResult> = (state, input, ctx) => {
  const parsed = parse(schema, input);
  if (!parsed.ok) return parsed;
  const f = parsed.data;
  const from = state.moneyAccounts[f.fromAccountId];
  const to = state.moneyAccounts[f.toAccountId];
  const touchesCash = from?.kind === "cash" || to?.kind === "cash";
  if (!can(ctx.user, "journal.post") && !(touchesCash && can(ctx.user, "pettycash.record"))) return fail("FORBIDDEN", forbiddenMessage("journal.post", undefined, ctx.user));
  if (!from) return fail("NOT_FOUND", "Choose the account the money leaves.", "fromAccountId");
  if (!to) return fail("NOT_FOUND", "Choose the account the money goes into.", "toAccountId");
  if (from.id === to.id) return fail("VALIDATION", "Choose two different accounts.", "toAccountId");
  if (!from.active) return fail("VALIDATION", `${from.name} is inactive. Choose another account.`, "fromAccountId");
  if (!to.active) return fail("VALIDATION", `${to.name} is inactive. Choose another account.`, "toAccountId");
  if (from.currency !== to.currency)
    return fail("VALIDATION", `${from.name} holds ${from.currency} and ${to.name} holds ${to.currency}. A transfer moves one currency; record a currency exchange as a journal.`, "toAccountId");
  if (f.amount.currency !== from.currency) return fail("VALIDATION", `Enter the amount in ${from.currency}.`, "amount");

  const memo = f.memo ?? `Transfer from ${from.name} to ${to.name}`;
  const made = createJournal(state, ctx, {
    date: f.date,
    memo,
    currency: from.currency,
    source: "transfer",
    lines: [
      { account: "1100", sub: { type: "money_account", id: to.id }, debitMinor: f.amount.amountMinor, creditMinor: 0, memo: `From ${from.name}` },
      { account: "1100", sub: { type: "money_account", id: from.id }, debitMinor: 0, creditMinor: f.amount.amountMinor, memo: `To ${to.name}` },
    ],
  });
  if (!made.ok) return made;
  const j = made.journal;
  return {
    ok: true,
    state: made.state,
    audit: [makeAudit(ctx, "money.transferred", "journal", j.id, `Transfer ${j.number}: ${format(f.amount)} from ${from.name} to ${to.name}`)],
    result: { journalId: j.id, number: j.number },
    toast: `Moved ${format(f.amount)} to ${to.name} (${j.number})`,
  };
};
